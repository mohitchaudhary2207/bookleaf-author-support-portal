import { Router } from 'express';

/** GET /events - Server-Sent Events stream of ticket changes relevant to the signed-in user. */
export function eventRoutes({ events }) {
  const router = Router();
  router.get('/', (req, res) => {
    req.socket.setTimeout(0);
    req.socket.setNoDelay(true);
    events.subscribe(req.user, res);
  });
  return router;
}
