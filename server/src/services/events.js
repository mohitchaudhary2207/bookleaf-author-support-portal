/**
 * In-process Server-Sent Events hub.
 *
 * Why SSE (not WebSockets/polling): updates are one-directional (server -> browser), SSE rides on
 * plain HTTP (auth cookies, proxies, no extra protocol), and the browser's EventSource reconnects
 * automatically. Events carry only ids + type - clients re-fetch through the normal REST API, so
 * authorization is enforced in exactly one place and a bus bug can never leak ticket content.
 *
 * Limitation: subscribers live in this process's memory. Running several instances would need a
 * shared pub/sub (Redis) behind `publish` - the call sites would not change.
 */
export function createEventBus({ heartbeatMs = 25_000 } = {}) {
  const clients = new Set();

  const write = (client, event, data) => {
    try {
      client.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch {
      clients.delete(client);
    }
  };

  const heartbeat = setInterval(() => {
    for (const c of clients) {
      try { c.res.write(': ping\n\n'); } catch { clients.delete(c); }
    }
  }, heartbeatMs);
  heartbeat.unref();

  return {
    subscribe(user, res) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no', // stop nginx-style proxies from buffering the stream
      });
      res.write('retry: 3000\n\n');
      const client = { res, user };
      clients.add(client);
      write(client, 'ready', { at: new Date().toISOString() });
      const unsubscribe = () => clients.delete(client);
      res.on('close', unsubscribe);
      return unsubscribe;
    },

    /**
     * @param {string} type       e.g. 'ticket.message'
     * @param {object} payload    { ticketId, authorId, ...small extras } - no private content
     * @param {{adminOnly?: boolean}} opts  adminOnly events are never delivered to authors
     */
    publish(type, payload, { adminOnly = false } = {}) {
      for (const client of clients) {
        const { user } = client;
        const allowed = user.role === 'admin' || (!adminOnly && user.authorId === payload.authorId);
        if (allowed) write(client, type, { ...payload, at: new Date().toISOString() });
      }
    },

    clientCount: () => clients.size,
    close() {
      clearInterval(heartbeat);
      for (const c of clients) { try { c.res.end(); } catch { /* already closed */ } }
      clients.clear();
    },
  };
}
