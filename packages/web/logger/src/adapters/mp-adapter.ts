import type { LogRecord } from '../types';
import type { MPFileSystemLike } from '../utils/mp-runtime';
import { MP_LOG_DIRECTORY, MP_LOG_FILE_EXTENSION } from '../constants';
import { detectMPRuntime } from '../utils/mp-runtime';
import { BaseStorageAdapter } from './base-adapter';

/** 小程序存储适配器配置 */
export interface MPStorageAdapterConfig {
  /**
   * 文件系统实例。缺省时运行时探测五端全局（wx/my/tt/swan/qq）；
   * 测试时注入内存 mock，避免污染全局。
   */
  fs?: MPFileSystemLike;
  /** 日志根目录绝对路径，缺省时为 `{USER_DATA_PATH}/fedstack_logs` */
  rootPath?: string;
}

/**
 * 小程序存储适配器
 *
 * 按日期分片存储：`{rootPath}/yyyy-MM-dd.jsonl`（本地时区），每行一条 JSON 日志。
 * 文件名只用于按日期预过滤，时间范围语义由行级 timestamp 精确过滤保证，跨时区
 * 或临界时间不影响正确性。
 *
 * 失败语义：
 * - 探测不到小程序运行时且未注入 fs 时，console.warn 一次并退化为无操作
 *   （写丢弃、读返回空、删除返回 0），业务初始化不受影响；
 * - append 抛错（典型为 10MB 用户文件限额写满）时删除最旧日期文件重试一次，
 *   仍失败则向上抛，由 StorageTransport 回填缓冲区下轮重试（buffer 硬上限兜底）；
 * - 单行 JSON 解析失败（文件损坏）时跳过该行，不影响其余日志。
 */
export class MPStorageAdapter extends BaseStorageAdapter {
  /** 文件系统实例，null 表示无可用运行时（无操作退化） */
  private fs: MPFileSystemLike | null;

  /** 日志根目录绝对路径 */
  private readonly rootPath: string;

  /** 是否已输出过无运行时警告 */
  private hasWarnedUnavailable = false;

  constructor(config: MPStorageAdapterConfig = {}) {
    super();
    const runtime = config.fs ? null : detectMPRuntime();
    this.fs = config.fs ?? runtime?.fs ?? null;
    this.rootPath = config.rootPath ?? `${runtime?.userDataPath ?? ''}/${MP_LOG_DIRECTORY}`;
  }

  /** 初始化适配器：确保日志目录存在 */
  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }
    this.initialized = true;

    const fs = this.fs;
    if (!fs) {
      this.warnUnavailable();
      return;
    }

    try {
      fs.accessSync(this.rootPath);
    }
    catch {
      try {
        fs.mkdirSync(this.rootPath);
      }
      catch {
        // 目录已存在或创建失败；创建失败时后续写入会抛错，走紧急清理/回填路径
      }
    }
  }

  /** 写入单条日志 */
  async write(record: LogRecord): Promise<void> {
    await this.ensureInitialized();
    const fs = this.fs;
    if (!fs) {
      return;
    }
    this.appendLines(fs, this.dateFileName(record.timestamp), [record]);
  }

  /** 批量写入日志（按日期分组，同一天合并为一次 append） */
  async writeBatch(records: LogRecord[]): Promise<void> {
    await this.ensureInitialized();
    const fs = this.fs;
    if (!fs || records.length === 0) {
      return;
    }

    const byFile = new Map<string, LogRecord[]>();
    for (const record of records) {
      const fileName = this.dateFileName(record.timestamp);
      const group = byFile.get(fileName);
      if (group) {
        group.push(record);
      }
      else {
        byFile.set(fileName, [record]);
      }
    }

    for (const [fileName, group] of byFile) {
      this.appendLines(fs, fileName, group);
    }
  }

  /** 读取指定时间范围的日志（文件名按日期预过滤，行级按 timestamp 精确过滤） */
  async read(startTime?: number, endTime?: number): Promise<LogRecord[]> {
    await this.ensureInitialized();
    const fs = this.fs;
    if (!fs) {
      return [];
    }

    const startDate = startTime !== undefined ? this.dateString(startTime) : undefined;
    const endDate = endTime !== undefined ? this.dateString(endTime) : undefined;

    const records: LogRecord[] = [];
    for (const fileName of this.listLogFiles(fs)) {
      const date = this.fileDate(fileName);
      if (startDate !== undefined && date < startDate) {
        continue;
      }
      if (endDate !== undefined && date > endDate) {
        continue;
      }
      for (const record of this.readFileRecords(fs, fileName)) {
        if (startTime !== undefined && record.timestamp < startTime) {
          continue;
        }
        if (endTime !== undefined && record.timestamp > endTime) {
          continue;
        }
        records.push(record);
      }
    }

    records.sort((a, b) => a.timestamp - b.timestamp);
    return records;
  }

  /**
   * 删除指定时间之前的日志
   *
   * 早于边界日期的文件整天删除；边界当天文件读出过滤后重写（日志量被截断时
   * 若文件无剩余记录则直接删除）。
   */
  async deleteBeforeTime(time: number): Promise<number> {
    await this.ensureInitialized();
    const fs = this.fs;
    if (!fs) {
      return 0;
    }

    const boundaryDate = this.dateString(time);
    let deleted = 0;

    for (const fileName of this.listLogFiles(fs)) {
      const date = this.fileDate(fileName);
      if (date > boundaryDate) {
        continue;
      }

      const filePath = `${this.rootPath}/${fileName}`;
      if (date < boundaryDate) {
        deleted += this.countFileLines(fs, fileName);
        try {
          fs.unlinkSync(filePath);
        }
        catch {
          // 删除失败忽略，下轮清理重试
        }
        continue;
      }

      // 边界文件：精确过滤后重写
      const before = this.countFileLines(fs, fileName);
      const kept = this.readFileRecords(fs, fileName).filter(record => record.timestamp >= time);
      deleted += before - kept.length;

      try {
        if (kept.length === 0) {
          fs.unlinkSync(filePath);
        }
        else {
          fs.writeFileSync(filePath, this.serializeRecords(kept));
        }
      }
      catch {
        // 重写失败忽略，下轮清理重试
      }
    }

    return deleted;
  }

  /** 获取日志总数（实时扫描数行，文件数 ≤ retentionDays + 1，成本可控） */
  async count(): Promise<number> {
    await this.ensureInitialized();
    const fs = this.fs;
    if (!fs) {
      return 0;
    }

    let total = 0;
    for (const fileName of this.listLogFiles(fs)) {
      total += this.countFileLines(fs, fileName);
    }
    return total;
  }

  /** 清空所有日志（删除全部日志文件，保留目录） */
  async clear(): Promise<void> {
    await this.ensureInitialized();
    const fs = this.fs;
    if (!fs) {
      return;
    }

    for (const fileName of this.listLogFiles(fs)) {
      try {
        fs.unlinkSync(`${this.rootPath}/${fileName}`);
      }
      catch {
        // 删除失败忽略，下轮清理重试
      }
    }
  }

  /** 无运行时警告（只输出一次） */
  private warnUnavailable(): void {
    if (!this.hasWarnedUnavailable) {
      this.hasWarnedUnavailable = true;
      console.warn('[MPStorageAdapter] No mini-program runtime detected (wx/my/tt/swan/qq), log storage is disabled.');
    }
  }

  /**
   * 追加写入一个日期文件
   *
   * append 抛错（典型为用户文件限额写满）时先删除最旧日期文件重试一次；
   * 重试仍失败则向上抛，由 StorageTransport 回填缓冲区下轮重试。
   */
  private appendLines(fs: MPFileSystemLike, fileName: string, records: LogRecord[]): void {
    const filePath = `${this.rootPath}/${fileName}`;
    const content = this.serializeRecords(records);
    try {
      fs.appendFileSync(filePath, content);
    }
    catch {
      this.deleteOldestFile(fs);
      fs.appendFileSync(filePath, content);
    }
  }

  /** 删除最旧日期的日志文件（文件名 yyyy-MM-dd 字典序即日期序） */
  private deleteOldestFile(fs: MPFileSystemLike): void {
    const oldest = this.listLogFiles(fs)[0];
    if (oldest) {
      try {
        fs.unlinkSync(`${this.rootPath}/${oldest}`);
      }
      catch {
        // 删除失败忽略，append 重试失败后会向上抛
      }
    }
  }

  /** 列出全部日志文件名（按日期升序） */
  private listLogFiles(fs: MPFileSystemLike): string[] {
    try {
      return fs
        .readdirSync(this.rootPath)
        .filter(name => name.endsWith(MP_LOG_FILE_EXTENSION))
        .sort();
    }
    catch {
      return [];
    }
  }

  /** 读取一个文件的全部记录，损坏行跳过 */
  private readFileRecords(fs: MPFileSystemLike, fileName: string): LogRecord[] {
    let content: string;
    try {
      content = fs.readFileSync(`${this.rootPath}/${fileName}`);
    }
    catch {
      return [];
    }

    const records: LogRecord[] = [];
    for (const line of content.split('\n')) {
      if (!line) {
        continue;
      }
      try {
        records.push(JSON.parse(line) as LogRecord);
      }
      catch {
        // 跳过损坏行
      }
    }
    return records;
  }

  /** 统计一个文件的非空行数 */
  private countFileLines(fs: MPFileSystemLike, fileName: string): number {
    try {
      const content = fs.readFileSync(`${this.rootPath}/${fileName}`);
      return content.split('\n').filter(line => line.length > 0).length;
    }
    catch {
      return 0;
    }
  }

  /** 序列化为 JSONL（每行一条 JSON，尾部带换行） */
  private serializeRecords(records: LogRecord[]): string {
    return `${records.map(record => JSON.stringify(record)).join('\n')}\n`;
  }

  /** 从文件名提取日期串（去掉 .jsonl 扩展名） */
  private fileDate(fileName: string): string {
    return fileName.slice(0, -MP_LOG_FILE_EXTENSION.length);
  }

  /** 时间戳对应的日志文件名 */
  private dateFileName(timestamp: number): string {
    return `${this.dateString(timestamp)}${MP_LOG_FILE_EXTENSION}`;
  }

  /** 时间戳转本地时区日期串（yyyy-MM-dd） */
  private dateString(timestamp: number): string {
    const date = new Date(timestamp);
    const yyyy = date.getFullYear();
    const MM = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${MM}-${dd}`;
  }
}
