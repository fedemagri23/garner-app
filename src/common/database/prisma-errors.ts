/**
 * Recognizing Prisma failures without importing a generated client, so the
 * check works the same for all three databases.
 */

/** Prisma's code for a unique constraint violation. */
const UNIQUE_VIOLATION = 'P2002';

/** Prisma's code for a foreign key violation: the row pointed at is gone. */
const FOREIGN_KEY_VIOLATION = 'P2003';

function hasCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === code
  );
}

export function isUniqueViolation(error: unknown): boolean {
  return hasCode(error, UNIQUE_VIOLATION);
}

export function isForeignKeyViolation(error: unknown): boolean {
  return hasCode(error, FOREIGN_KEY_VIOLATION);
}
