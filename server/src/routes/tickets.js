import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { config } from '../config/index.js';
import { requireRole } from '../middleware/auth.js';
import { createUploader } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import { authorTicketSchemas as schemas } from '../schemas/index.js';
import { asyncHandler } from '../utils/async-handler.js';
import { notFound } from '../utils/errors.js';

/** Remove already-stored uploads when a request is rejected after multer ran. */
function discardUploads(err, req, _res, next) {
  for (const f of req.files ?? []) fs.promises.unlink(f.path).catch(() => {});
  next(err);
}

/** Author-facing ticket endpoints. Everything is scoped to the signed-in author by the service. */
export function ticketRoutes({ tickets }) {
  const router = Router();
  const authorOnly = requireRole('author');
  const upload = createUploader();

  router.post('/', authorOnly, upload, validate(schemas.create), (req, res) => {
    const ticket = tickets.createTicket(req.user, req.valid.body, req.files ?? []);
    res.status(201).json(ticket);
  }, discardUploads);

  router.get('/', authorOnly, validate(schemas.list), (req, res) => {
    const { status, page, pageSize } = req.valid.query;
    const result = tickets.listForAuthor(req.user, { status: status ? [status] : undefined, page, pageSize });
    res.json({ ...result, page, pageSize });
  });

  router.get('/:id', authorOnly, validate(schemas.one), (req, res) => {
    res.json(tickets.getForAuthor(req.user, req.valid.params.id));
  });

  router.post('/:id/messages', authorOnly, validate(schemas.message), (req, res) => {
    res.status(201).json(tickets.authorReply(req.user, req.valid.params.id, req.valid.body.body));
  });

  router.post('/:id/close', authorOnly, validate(schemas.one), (req, res) => {
    res.json(tickets.authorClose(req.user, req.valid.params.id));
  });

  // Attachment download: the ticket owner or any admin; always served as a download.
  router.get('/:id/attachments/:attachmentId', validate(schemas.attachment), asyncHandler(async (req, res) => {
    const { id, attachmentId } = req.valid.params;
    // Authorization (owner or admin, attachment belongs to the ticket) is enforced in the service layer.
    const att = tickets.getAttachmentForDownload(req.user, id, attachmentId);
    const file = path.join(config.uploadDir, path.basename(att.storedName));
    if (!fs.existsSync(file)) throw notFound('Attachment file is no longer available');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.download(file, att.originalName);
  }));

  return router;
}
