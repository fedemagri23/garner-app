/** One email to send: plain text, with any headers it needs (List-Unsubscribe…). */
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  headers: Record<string, string>;
}

/** Hands an email to a mail server. Throws when it is not accepted. */
export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

/**
 * The app's email sender: SMTP when `SMTP_URL` is set; otherwise none is
 * configured and `EMAIL_SENDER` resolves to null.
 */
export const EMAIL_SENDER = Symbol('EMAIL_SENDER');
