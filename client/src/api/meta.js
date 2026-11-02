import { useEffect, useState } from 'react';
import { api } from './client.js';

let cache = null;
let inflight = null;

/** Enumerations (categories, priorities, ...) come from the server so UI and API never drift apart. */
export function useMeta() {
  const [meta, setMeta] = useState(cache);
  useEffect(() => {
    if (cache) return;
    inflight ??= api.get('/meta').then((m) => { cache = m; return m; }).finally(() => { inflight = null; });
    inflight.then(setMeta).catch(() => {});
  }, []);
  return meta;
}

export const clearMetaCache = () => { cache = null; };
