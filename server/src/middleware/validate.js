import { ZodError } from 'zod';
import { validationError } from '../utils/errors.js';

const formatIssues = (error) => error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));

/**
 * validate({ body, query, params }) - parses each part with a zod schema. On success the parsed
 * (trimmed, coerced, defaulted) values are placed on req.valid; on failure a 422 with a per-field
 * list is returned so the UI can show errors next to the right input.
 */
export const validate = (schemas) => (req, _res, next) => {
  try {
    req.valid = {};
    for (const part of ['params', 'query', 'body']) {
      if (schemas[part]) req.valid[part] = schemas[part].parse(req[part] ?? {});
    }
    next();
  } catch (err) {
    if (err instanceof ZodError) return next(validationError(formatIssues(err)));
    next(err);
  }
};
