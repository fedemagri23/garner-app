import { createHash, randomInt } from 'node:crypto';
import type { Language } from '../../common/i18n/language.js';

/** How long an emailed code works. */
export const RESET_CODE_TTL_MS = 30 * 60_000;
/** Wrong guesses a code survives: six digits are a million, five guesses are nothing. */
export const MAX_RESET_ATTEMPTS = 5;
/** Codes one account may ask for in an hour, so nobody floods someone's inbox. */
export const MAX_RESET_REQUESTS_PER_HOUR = 3;

/** A six-digit code, from a cryptographic source. */
export const generateResetCode = () => String(randomInt(0, 1_000_000)).padStart(6, '0');

/** What is stored: the code bound to its account, never the code itself. */
export const hashResetCode = (code: string, userId: string) =>
  createHash('sha256').update(`${userId}:${code}`).digest('hex');

export interface ResetCodeRecord {
  id: string;
  userId: string;
  codeHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  attempts: number;
}

/** Whether a code may still be tried. */
export const isResetCodeUsable = (record: ResetCodeRecord, now: Date) =>
  record.usedAt === null && record.expiresAt > now && record.attempts < MAX_RESET_ATTEMPTS;

export interface PasswordResetRepository {
  create(input: { userId: string; codeHash: string; expiresAt: Date }): Promise<ResetCodeRecord>;
  /** The newest code for the account, used or not. */
  latest(userId: string): Promise<ResetCodeRecord | null>;
  countSince(userId: string, since: Date): Promise<number>;
  recordFailedAttempt(id: string): Promise<void>;
  markUsed(id: string, at: Date): Promise<void>;
}

export const PASSWORD_RESET_REPOSITORY = Symbol('PASSWORD_RESET_REPOSITORY');

const TEXT: Record<Language, { subject: string; body: (code: string) => string }> = {
  es: {
    subject: 'Tu código para cambiar la contraseña de Garner',
    body: (code) =>
      `Tu código es ${code}.\n\nEscribilo en la app para elegir una contraseña nueva. Vale por 30 minutos y una sola vez.\n\nSi no lo pediste vos, ignorá este email: tu contraseña no cambia.`,
  },
  en: {
    subject: 'Your code to reset your Garner password',
    body: (code) =>
      `Your code is ${code}.\n\nEnter it in the app to choose a new password. It works for 30 minutes, once.\n\nIf you did not ask for it, ignore this email: your password does not change.`,
  },
  de: {
    subject: 'Dein Code zum Zurücksetzen deines Garner-Passworts',
    body: (code) =>
      `Dein Code lautet ${code}.\n\nGib ihn in der App ein, um ein neues Passwort zu wählen. Er gilt 30 Minuten und nur einmal.\n\nWenn du ihn nicht angefordert hast, ignoriere diese E-Mail: dein Passwort bleibt unverändert.`,
  },
  pt: {
    subject: 'Seu código para redefinir a senha do Garner',
    body: (code) =>
      `Seu código é ${code}.\n\nDigite-o no app para escolher uma senha nova. Vale por 30 minutos e uma única vez.\n\nSe você não pediu, ignore este e-mail: sua senha não muda.`,
  },
};

/** The reset email, in the account's language. */
export const resetEmail = (language: Language, code: string) => ({
  subject: TEXT[language].subject,
  text: TEXT[language].body(code),
});
