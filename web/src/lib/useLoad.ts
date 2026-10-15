import { useCallback, useEffect, useState } from "react";

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "エラーが発生しました";
}

/** 画面の表示用に API を呼ぶ。deps が変わるか reload() で取り直す */
export function useLoad<T>(fn: () => Promise<T>, deps: readonly unknown[]) {
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: undefined }));
    fn().then(
      (data) => alive && setState({ data, loading: false }),
      (e) => alive && setState({ error: errorMessage(e), loading: false }),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}
