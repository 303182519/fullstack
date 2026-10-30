import { useBoolean } from 'ahooks';

export interface UseLoadingReturn {
  /** 置为 false */
  endLoading: () => void;
  /** 当前 loading */
  loading: boolean;
  /** 置为 true */
  startLoading: () => void;
}

/**
 * Loading state hook
 *
 * @param initValue - Initial loading state, defaults to false
 */
export default function useLoading(initValue = false): UseLoadingReturn {
  const [loading, { setFalse: endLoading, setTrue: startLoading }] = useBoolean(initValue);
  return {
    endLoading,
    loading,
    startLoading,
  };
}
