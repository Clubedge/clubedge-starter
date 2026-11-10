import { createTransport } from "nodemailer";
import { parseSender, type EmailProvider } from "@clubedge/email";

export interface SmtpEmailConfig {
  /** smtp://user:password@host:port, or smtps:// for TLS from the start. */
  url: string;
  /** The sender, as "Name <address>" or an address. */
  from: string;
  /** How long to wait on the server, in milliseconds (TIMEOUTS when left out). */
  timeouts?: Partial<SmtpTimeouts>;
}

export interface SmtpTimeouts {
  /** To connect. */
  connectMs: number;
  /** For the server's greeting once connected. */
  greetingMs: number;
  /** Of silence in the middle of a send. */
  idleMs: number;
}

/**
 * Seconds, not nodemailer's minutes (2 to connect, 10 of silence), so that a host blocking SMTP's
 * ports, as some free plans do, fails a send at once rather than keeping whoever waits on it. A URL
 * can still say its own, as a query: ?connectionTimeout=30000.
 */
export const TIMEOUTS: SmtpTimeouts = { connectMs: 10_000, greetingMs: 10_000, idleMs: 20_000 };

/** Sends through any SMTP server: a provider's SMTP endpoint, or a local inbox such as Mailpit. */
export function createSmtpEmail({ url, from, timeouts }: SmtpEmailConfig): EmailProvider & {
  /** Connects and authenticates without sending anything, for `pnpm check:services`. */
  verify(): Promise<void>;
} {
  const sender = parseSender(from);
  const wait = { ...TIMEOUTS, ...timeouts };
  const transport = createTransport({
    url,
    connectionTimeout: wait.connectMs,
    greetingTimeout: wait.greetingMs,
    socketTimeout: wait.idleMs,
  });
  return {
    async send({ to, subject, text, html }) {
      await transport.sendMail({ from: sender, to, subject, text, ...(html ? { html } : {}) });
    },
    async verify() {
      await transport.verify();
    },
  };
}
