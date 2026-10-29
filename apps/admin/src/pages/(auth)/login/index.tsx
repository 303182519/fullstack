import type { CaptchaResponse } from '@/service/api/auth';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { Button, Form, Input, message } from 'antd';

import { useCallback, useState } from 'react';
import { AuthBizCode, fetchCaptcha, login, resolveApiError, verifyMfa } from '@/service/api/auth';
import { useAuthStore } from '@/store/auth';

// 必须导出：routeTree.gen.ts 引用路由的 search 类型，未导出会触发 TS4023
export interface LoginSearch {
  redirect?: string;
}

export const Route = createFileRoute('/(auth)/login/')({
  // redirect 只允许站内路径： startsWith('/') 且排除 '//'（协议相对 URL 会跳出站外）
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({
    redirect:
      typeof search.redirect === 'string' && search.redirect.startsWith('/') && !search.redirect.startsWith('//')
        ? search.redirect
        : undefined,
  }),
  component: LoginPage,
});

interface LoginFormValues {
  captchaText?: string;
  password: string;
  tenantCode: string;
  username: string;
}

function LoginPage() {
  const router = useRouter();
  const { redirect } = Route.useSearch();

  // password = 账号密码表单；mfa = 二次验证表单（登录返回 mfaRequired 时切换）
  const [step, setStep] = useState<'mfa' | 'password'>('password');
  const [pendingToken, setPendingToken] = useState('');
  const [captcha, setCaptcha] = useState<CaptchaResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [passwordForm] = Form.useForm<LoginFormValues>();
  const [mfaForm] = Form.useForm<{ code: string }>();

  const loadCaptcha = useCallback(async () => {
    try {
      setCaptcha(await fetchCaptcha());
    }
    catch {
      message.error('验证码加载失败，请稍后重试');
    }
  }, []);

  function enterApp(accessToken: string) {
    useAuthStore.getState().setToken(accessToken);
    // redirect 已在 validateSearch 里做过站内校验
    if (redirect) {
      router.history.replace(redirect);
    }
    else {
      router.navigate({ replace: true, to: '/home' });
    }
  }

  async function handleLogin(values: LoginFormValues) {
    setSubmitting(true);
    try {
      const res = await login({
        password: values.password,
        tenantCode: values.tenantCode,
        username: values.username,
        // 验证码出现后才回传；ID 与答案必须同一次签发，所以只在 captcha 存在时携带
        ...(captcha && values.captchaText
          ? { captchaId: captcha.captchaId, captchaText: values.captchaText }
          : {}),
      });
      if ('mfaRequired' in res) {
        setPendingToken(res.pendingToken);
        setStep('mfa');
        return;
      }
      enterApp(res.accessToken);
    }
    catch (error) {
      const { bizCode, message: msg } = resolveApiError(error);
      // 达阈值被要求验证码 / 验证码答错：都换一张新的（答案一次性消费，旧图已失效）
      if (bizCode === AuthBizCode.CAPTCHA_REQUIRED || bizCode === AuthBizCode.CAPTCHA_INVALID) {
        passwordForm.setFieldValue('captchaText', '');
        await loadCaptcha();
      }
      message.error(msg);
    }
    finally {
      setSubmitting(false);
    }
  }

  async function handleMfa({ code }: { code: string }) {
    setSubmitting(true);
    try {
      const res = await verifyMfa({ code, pendingToken });
      enterApp(res.accessToken);
    }
    catch (error) {
      const { message: msg } = resolveApiError(error);
      message.error(msg);
    }
    finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 8,
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
        padding: '40px 48px',
        width: 400,
      }}
    >
      <h1 style={{ fontSize: 20, marginBottom: 24, textAlign: 'center' }}>Fedstack Admin 登录</h1>

      {step === 'password' && (
        <Form<LoginFormValues>
          form={passwordForm}
          initialValues={{ tenantCode: 'default' }}
          onFinish={handleLogin}
          size="large"
        >
          <Form.Item name="tenantCode" rules={[{ message: '请输入租户编码', required: true }]}>
            <Input autoComplete="organization" placeholder="租户编码" />
          </Form.Item>
          <Form.Item name="username" rules={[{ message: '请输入用户名', required: true }]}>
            <Input autoComplete="username" placeholder="用户名" />
          </Form.Item>
          <Form.Item name="password" rules={[{ message: '请输入密码', required: true }]}>
            <Input.Password autoComplete="current-password" placeholder="密码" />
          </Form.Item>

          {captcha && (
            <Form.Item name="captchaText" rules={[{ message: '请输入图形验证码', required: true }]}>
              <Input
                placeholder="图形验证码"
                suffix={(
                  <span
                    // eslint-disable-next-line react/dom-no-dangerously-set-innerhtml -- SVG 是 admin-api 签发的验证码，来源可信
                    dangerouslySetInnerHTML={{ __html: captcha.svg }}
                    onClick={loadCaptcha}
                    style={{ cursor: 'pointer', display: 'inline-flex', height: 32 }}
                    title="点击刷新"
                  />
                )}
              />
            </Form.Item>
          )}

          <Form.Item style={{ marginBottom: 0 }}>
            <Button block htmlType="submit" loading={submitting} type="primary">
              登录
            </Button>
          </Form.Item>
        </Form>
      )}

      {step === 'mfa' && (
        <Form form={mfaForm} onFinish={handleMfa} size="large">
          <p style={{ color: '#666', marginBottom: 16 }}>
            该账号已开启两步验证，请输入身份验证器中的动态验证码（或恢复码）。
          </p>
          <Form.Item name="code" rules={[{ message: '请输入动态验证码或恢复码', required: true }]}>
            <Input autoComplete="one-time-code" autoFocus maxLength={12} placeholder="动态验证码 / 恢复码" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button block htmlType="submit" loading={submitting} type="primary">
              验证并登录
            </Button>
            <Button block onClick={() => setStep('password')} style={{ marginTop: 12 }} type="link">
              返回账号登录
            </Button>
          </Form.Item>
        </Form>
      )}
    </div>
  );
}
