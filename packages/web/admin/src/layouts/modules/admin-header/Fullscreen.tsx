import { FullscreenExitOutlined, FullscreenOutlined } from '@ant-design/icons';
import { useFullscreen } from 'ahooks';
import { Tooltip } from 'antd';

/**
 * 全屏切换按钮。
 *
 * - 基于 ahooks `useFullscreen(document.body)`，内部统一处理浏览器前缀探测、
 *   事件监听与 `.bind` 绑定；壳包代码不再直接操作原生 Fullscreen API，
 *   也不会触发 "Illegal invocation"。
 * - `isEnabled` 表示当前浏览器/环境是否支持全屏（iframe sandbox 下会为 false）；
 *   不支持时按钮依然渲染但点击无反应——避免用户看到一个隐藏按钮困惑，
 *   同时 Tooltip 文案自动反映当前状态。
 */
function Fullscreen() {
  const [isFullscreen, { toggleFullscreen, isEnabled }] = useFullscreen(document.body);

  const label = !isEnabled
    ? '当前环境不支持全屏'
    : (isFullscreen ? '退出全屏' : '进入全屏');

  return (
    <Tooltip title={label}>
      <button
        aria-label={label}
        className="mx-2 inline-flex h-8 w-8 items-center justify-center rounded text-foreground/70 hover:bg-surface-hover hover:text-foreground disabled:opacity-50"
        disabled={!isEnabled}
        type="button"
        onClick={toggleFullscreen}
      >
        {isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
      </button>
    </Tooltip>
  );
}

export default Fullscreen;
