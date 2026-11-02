import { z } from 'zod';
import { CATEGORIES, PRIORITIES, STATUSES } from '../config/constants.js';

const trimmed = (min, max, label) =>
  z.string({ required_error: `${label} is required`, invalid_type_error: `${label} must be text` })
    .trim()
    .min(min, min === 1 ? `${label} is required` : `${label} must be at least ${min} characters`)
    .max(max, `${label} must be ${max} characters or fewer`);

const idParam = z.object({ id: z.coerce.number().int().positive('Invalid ticket id') });

export const authSchemas = {
  login: {
    body: z.object({
      email: z.string({ required_error: 'Email is required' }).trim().toLowerCase().email('Enter a valid email address').max(254),
      password: z.string({ required_error: 'Password is required' }).min(1, 'Password is required').max(200),
    }),
  },
};

export const bookSchemas = {
  list: { query: z.object({ authorId: z.string().trim().max(20).optional() }) },
  one: { params: z.object({ bookId: z.string().trim().min(1).max(20) }) },
};

export const authorTicketSchemas = {
  // bookId may arrive as '' / 'general' from a form's "General / Account Level" option.
  create: {
    body: z.object({
      bookId: z.preprocess((v) => (v === '' || v === 'general' || v === 'null' ? null : v), z.string().trim().max(20).nullable().optional()),
      subject: trimmed(3, 150, 'Subject'),
      description: trimmed(10, 5000, 'Description'),
    }),
  },
  list: {
    query: z.object({
      status: z.enum(STATUSES).optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(50),
    }),
  },
  one: { params: idParam },
  message: { params: idParam, body: z.object({ body: trimmed(1, 5000, 'Message') }) },
  attachment: { params: idParam.extend({ attachmentId: z.coerce.number().int().positive() }) },
};

// Date filters accept YYYY-MM-DD; "to" is inclusive, so it is converted to the start of the next day.
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const nextDay = (d) => new Date(new Date(`${d}T00:00:00.000Z`).getTime() + 86_400_000).toISOString();

export const adminTicketSchemas = {
  list: {
    query: z.object({
      status: z.string().optional().transform((s) => (s ? s.split(',').map((x) => x.trim()).filter(Boolean) : undefined))
        .pipe(z.array(z.enum(STATUSES)).optional()),
      category: z.enum(CATEGORIES).optional(),
      priority: z.enum(PRIORITIES).optional(),
      assignee: z.string().trim().regex(/^(me|unassigned|\d+)$/, 'Use "me", "unassigned" or an admin id').optional(),
      q: z.string().trim().max(100).optional(),
      from: dateOnly.optional().transform((d) => (d ? `${d}T00:00:00.000Z` : undefined)),
      to: dateOnly.optional().transform((d) => (d ? nextDay(d) : undefined)),
      sort: z.enum(['urgency', 'oldest', 'newest', 'updated']).default('urgency'),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(25),
    }),
  },
  one: { params: idParam },
  update: {
    params: idParam,
    body: z.object({
      status: z.enum(STATUSES).optional(),
      category: z.enum(CATEGORIES).optional(),
      priority: z.enum(PRIORITIES).optional(),
      // null = unassign, "me" = assign to the caller, number = another admin's user id
      assignedTo: z.union([z.null(), z.literal('me'), z.number().int().positive()]).optional(),
    }).strict().refine((b) => Object.keys(b).length > 0, 'Provide at least one field to update'),
  },
  message: {
    params: idParam,
    body: z.object({
      body: trimmed(1, 5000, 'Reply'),
      aiAssisted: z.boolean().default(false),
      setStatus: z.enum(['In Progress', 'Resolved']).optional(),
    }),
  },
  note: { params: idParam, body: z.object({ body: trimmed(1, 2000, 'Note') }) },
};
