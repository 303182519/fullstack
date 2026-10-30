import useCountDownTimer from './use-count-down-timer';
import useLoading from './use-loading';

const REG_PHONE
  = /^1(?:3\d|4[014-9]|5[0-35-9]|6[25-7]|7[0-8]|8\d|9[0-35-9])\d{8}$/;

export type CaptchaCountingLabelGetter = (count: number) => string;
export type CaptchaRequest = (target: string) => Promise<void> | void;
export type CaptchaTargetValidator = (target: string) => boolean;

export interface UseCaptchaOptions {
  /** 发送验证码的实际请求逻辑 */
  request?: CaptchaRequest;
  /** 倒计时时长，按秒计算 */
  seconds?: number;
  /** 发送前校验接收验证码的目标 */
  validateTarget?: CaptchaTargetValidator;
}

export interface UseCaptchaReturn {
  /** 剩余秒数 */
  count: number;
  /** 触发发送验证码 */
  getCaptcha: (target: string) => Promise<void>;
  /** 是否处于倒计时 */
  isCounting: boolean;
  /** 按钮展示文案 */
  label: string;
  /** 请求中 */
  loading: boolean;
}

function defaultRequest(): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, 500);
  });
}

function defaultValidateTarget(target: string): boolean {
  return REG_PHONE.test(target.trim());
}

function getDefaultCountingLabel(count: number): string {
  return `${count}秒后重新获取`;
}

export default function useCaptcha(
  defaultLabel = '获取验证码',
  getCountingLabel: CaptchaCountingLabelGetter = getDefaultCountingLabel,
  options: UseCaptchaOptions = {},
): UseCaptchaReturn {
  const { request = defaultRequest, seconds = 10, validateTarget = defaultValidateTarget } = options;
  const { count, isCounting, start } = useCountDownTimer(seconds);
  const { endLoading, loading, startLoading } = useLoading();

  let label = defaultLabel;
  if (loading)
    label = '';

  if (isCounting)
    label = getCountingLabel(count);

  async function getCaptcha(target: string): Promise<void> {
    const valid = validateTarget(target);
    if (!valid || loading)
      return;

    startLoading();
    try {
      await request(target);
      start();
    }
    finally {
      endLoading();
    }
  }

  return {
    count,
    getCaptcha,
    isCounting,
    label,
    loading,
  };
}
