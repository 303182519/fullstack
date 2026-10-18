/**
 * 操作日志的参数掩码与结果截断（纯函数，便于单测）。
 *
 * 掩码是审计合规要求：日志表含敏感字段的明文会放大泄露面（见 AGENTS.md §15），
 * 因此凡是进入 sys_oper_log.params 的内容一律先过本模块。
 */

/** 需要掩码的请求字段（小写比对，嵌套对象同样生效） */
const SENSITIVE_KEYS: ReadonlySet<string> = new Set([
  'password',
  'newpassword',
  'oldpassword',
  'confirmpassword',
  'passwordhistory',
  'captchatext',
]);

/** 掩码占位值 */
export const MASK_PLACEHOLDER = '******';

/** 嵌套遍历深度上限：防御循环引用之外的畸形深结构 */
const MAX_MASK_DEPTH = 6;

/** 递归掩码：命中敏感键的叶子值整体替换为占位符，其余原样保留 */
export function maskSensitive(value: unknown, depth = MAX_MASK_DEPTH): unknown {
  if (depth <= 0)
    return MASK_PLACEHOLDER;
  if (Array.isArray(value))
    return value.map(item => maskSensitive(item, depth - 1));
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEYS.has(key.toLowerCase())
        ? MASK_PLACEHOLDER
        : maskSensitive(item, depth - 1);
    }
    return out;
  }
  return value;
}

/** 响应结果截断上限（字符数，对应 ADR-009 的「2KB」口径） */
export const OPER_LOG_RESULT_LIMIT = 2048;

/**
 * 结果截断：序列化后不超限直接存原对象；超限存
 * `{ __truncated__: true, preview }`，保证 Json 列里始终是合法 JSON。
 */
export function truncateResult(result: unknown): unknown {
  let json: string;
  try {
    json = JSON.stringify(result) ?? 'null';
  }
  catch {
    return { __truncated__: true, preview: '[unserializable]' };
  }
  if (json.length <= OPER_LOG_RESULT_LIMIT)
    return result;
  return {
    __truncated__: true,
    preview: json.slice(0, OPER_LOG_RESULT_LIMIT),
  };
}
