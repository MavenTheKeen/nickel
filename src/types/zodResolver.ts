import type { FieldErrors, FieldValues, Resolver } from 'react-hook-form';
import type { z } from 'zod';

/**
 * Minimal React Hook Form resolver for a Zod schema. Written here instead of
 * depending on @hookform/resolvers, whose optional peer dependencies conflict
 * with this project's install. Only the first message per field is kept.
 * `rename` maps output field names back to form fields (amountCents -> amount).
 */
export function zodResolver<TValues extends FieldValues, TOut>(
  schema: z.ZodType<TOut, TValues>,
  rename: Record<string, string> = {},
): Resolver<TValues, unknown, TOut> {
  return async (values) => {
    const result = await schema.safeParseAsync(values);
    if (result.success) return { values: result.data, errors: {} };
    const errors: Record<string, { type: string; message: string }> = {};
    for (const issue of result.error.issues) {
      const raw = issue.path.join('.') || 'root';
      const path = rename[raw] ?? raw;
      errors[path] ??= { type: issue.code, message: issue.message };
    }
    return { values: {}, errors: errors as unknown as FieldErrors<TValues> };
  };
}
