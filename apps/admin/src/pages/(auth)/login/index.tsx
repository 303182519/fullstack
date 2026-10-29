import { createFileRoute, Link } from '@tanstack/react-router';

/**
 * 登录页占位。阶段 2 接入真实登录流程（captcha / MFA / refresh cookie）。
 */
export const Route = createFileRoute('/(auth)/login/')({
  component: LoginPage,
});

function LoginPage() {
  return (
    <div
      style={{
        padding: 48,
        background: '#fff',
        borderRadius: 8,
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        textAlign: 'center',
      }}
    >
      <h1>登录页</h1>
      <p style={{ color: '#888' }}>阶段 1 占位 — 阶段 2 接入真实登录</p>
      <div style={{ marginTop: 16 }}>
        <Link to="/home">去后台首页</Link>
      </div>
    </div>
  );
}
