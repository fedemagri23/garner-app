/**
 * Recognizing Prisma failures without importing a generated client, so the
 * check works the same for all three databases.
 */

/** Prisma's code for a unique constraint violation. */
const UNIQUE_VIOLATION = 'P2002';

export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === UNIQUE_VIOLATION
  );
}
