import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import { config } from '../config/index.js';
import { validationError } from '../utils/errors.js';

const ALLOWED_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.pdf', '.txt']);

/**
 * Attachment uploads (listed as a bonus in the brief). Files are stored under random names - the
 * user-supplied name is only kept as metadata - and are served back only through an authenticated
 * endpoint with `Content-Disposition: attachment`.
 */
export function createUploader() {
  fs.mkdirSync(config.uploadDir, { recursive: true });
  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, config.uploadDir),
    filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
  });
  const upload = multer({
    storage,
    limits: { fileSize: config.uploads.maxFileBytes, files: config.uploads.maxFiles },
    fileFilter: (_req, file, cb) => {
      const ok = config.uploads.allowedMimeTypes.includes(file.mimetype) && ALLOWED_EXT.has(path.extname(file.originalname).toLowerCase());
      if (ok) cb(null, true);
      else cb(validationError([{ path: 'attachments', message: `"${file.originalname}" is not allowed. Use PNG, JPG, WEBP, PDF or TXT` }]));
    },
  });
  return upload.array('attachments', config.uploads.maxFiles);
}
