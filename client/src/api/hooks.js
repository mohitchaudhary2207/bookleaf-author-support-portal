import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * useFetch(fn, deps) - loads data, keeps the previous data on screen while reloading (so live
 * updates do not flicker), ignores out-of-order responses, and exposes reload().
 */
export function useFetch(fn, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const seq = useRef(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const load = useCallback(async ({ silent = false } = {}) => {
    const id = ++seq.current;
    if (!silent) setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await fnRef.current();
      if (id === seq.current) setState({ data, error: null, loading: false });
    } catch (error) {
      if (error.name === 'AbortError') return;
      if (id === seq.current) setState((s) => ({ data: silent ? s.data : null, error: silent ? s.error : error, loading: false }));
    }
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, deps);

  return { ...state, reload: () => load(), refresh: () => load({ silent: true }), setData: (data) => setState((s) => ({ ...s, data })) };
}

/** Debounce a callback so a burst of live events triggers one refetch. */
export function useDebouncedCallback(fn, ms = 250) {
  const timer = useRef();
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => () => clearTimeout(timer.current), []);
  return useCallback((...args) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => ref.current(...args), ms);
  }, [ms]);
}
