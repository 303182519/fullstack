import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';
import relativeTime from 'dayjs/plugin/relativeTime';

// 扩展 dayjs 插件
dayjs.extend(duration);
dayjs.extend(relativeTime);

// 导出 dayjs 实例，方便外部使用
export { dayjs };
