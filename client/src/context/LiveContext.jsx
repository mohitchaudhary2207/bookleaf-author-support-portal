import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext.jsx';

const LiveContext = createContext({ status: 'offline', subscribe: () => () => {} });
export const useLive = () => useContext(LiveContext);

const EVENT_TYPES = ['ticket.created', 'ticket.updated', 'ticket.message', 'ticket.triaged', 'ticket.note'];

/**
 * One Server-Sent Events connection per signed-in session, shared by every page. Pages call
 * subscribe(handler) and re-fetch through the REST API when an event concerns them; events only
 * carry ids, never content. EventSource reconnects by itself; after a reconnect we emit a
 * synthetic 'resync' event so pages pick up anything they missed while offline.
 */
export function LiveProvider({ children }) {
  const { user } = useAuth();
  const [status, setStatus] = useState('offline'); // 'live' | 'reconnecting' | 'offline'
  const handlers = useRef(new Set());
  const hadError = useRef(false);

  const emit = useCallback((evt) => handlers.current.forEach((h) => { try { h(evt); } catch { /* one bad listener must not break the others */ } }), []);
  const subscribe = useCallback((handler) => { handlers.current.add(handler); return () => handlers.current.delete(handler); }, []);

  useEffect(() => {
    if (!user) { setStatus('offline'); return undefined; }
    let es; let retry; let closed = false;

    const connect = () => {
      es = new EventSource('/api/v1/events');
      es.addEventListener('ready', () => {
        setStatus('live');
        if (hadError.current) { hadError.current = false; emit({ type: 'resync' }); }
      });
      for (const type of EVENT_TYPES) es.addEventListener(type, (e) => emit({ type, ...JSON.parse(e.data) }));
      es.onerror = () => {
        hadError.current = true;
        setStatus('reconnecting');
        // CLOSED means the browser gave up (e.g. 401/expired session): retry on our own schedule.
        if (es.readyState === EventSource.CLOSED && !closed) { es.close(); retry = setTimeout(connect, 5000); }
      };
    };
    connect();
    return () => { closed = true; clearTimeout(retry); es?.close(); setStatus('offline'); };
  }, [user, emit]);

  const value = useMemo(() => ({ status, subscribe }), [status, subscribe]);
  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

/** Run `onEvent` for live events. `ticketId` narrows to one ticket (a 'resync' always passes). */
export function useLiveEvents(onEvent, { ticketId } = {}) {
  const { subscribe } = useLive();
  const ref = useRef(onEvent);
  ref.current = onEvent;
  useEffect(() => subscribe((evt) => {
    if (ticketId && evt.type !== 'resync' && evt.ticketId !== ticketId) return;
    ref.current(evt);
  }), [subscribe, ticketId]);
}
