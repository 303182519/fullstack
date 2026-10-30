import { createFileRoute, Link, useLocation } from '@tanstack/react-router';
import { Button, Result } from 'antd';

/**
 * (admin) 分组内的通配路由：菜单指向但尚未注册的页面在此兜底。
 *
 * A 方案下菜单只负责导航，路由注册由文件路由静态提供。菜单先行配置、页面后续
 * 补齐期间，未匹配路径必须在布局内显示占位——否则整棵布局树会被 root 级 404
 * 视图替换，侧栏/顶栏消失，菜单选中态也无从谈起。
 */
export const Route = createFileRoute('/(admin)/$')({
  component: CatchAllPage,
});

function CatchAllPage() {
  const pathname = useLocation({ select: location => location.pathname });

  return (
    <Result
      extra={(
        <Link to="/home">
          <Button type="primary">返回首页</Button>
        </Link>
      )}
      status="404"
      subTitle={`路径 ${pathname} 对应的页面尚未注册`}
      title="页面不存在"
    />
  );
}
