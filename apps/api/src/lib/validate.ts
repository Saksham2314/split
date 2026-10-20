import { z } from 'zod';
import { badRequest } from './errors.js';

/** Parses untrusted input with a zod schema; turns validation failures into a 400 response. */
export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    throw badRequest('Validation failed', details);
  }
  return result.data;
}

export const id = z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER);
