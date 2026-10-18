import { useCallback, useEffect, useRef, useState } from 'react';

/** Loads one independent dashboard section; a failure only affects that section. */
export function useSection<T>(load: () => Promise<T>, deps: unknown[], refreshKey: number) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const fn = useRef(load);
  fn.current = load;

  const run = useCallback(async () => {
    const my = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const res = await fn.current();
      if (my === seq.current) setData(res);
    } catch (e) {
      if (my === seq.current) setError(e instanceof Error ? e.message : 'Could not load this section.');
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, refreshKey]);

  return { data, loading, error, reload: run };
}
