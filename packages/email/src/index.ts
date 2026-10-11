export interface EmailMessage {
  to: string;
  subject: string;
  /** Plain-text body; every message has one, for clients that do not render HTML. */
  text: string;
  html?: string;
}

/** Application code depends on this interface, never on a provider SDK. */
export interface EmailProvider {
  send(message: EmailMessage): Promise<void>;
}

/**
 * Prints messages instead of sending them, for development without an email service: links in
 * verification and password reset emails can be opened from the terminal.
 */
export function createConsoleEmail(log: (text: string) => void = console.info): EmailProvider {
  return {
    async send({ to, subject, text }) {
      log(`Email to ${to}: ${subject}\n\n${text}\n`);
    },
  };
}

/** Keeps sent messages in memory, for tests. */
export function createMemoryEmail(): EmailProvider & { sent: EmailMessage[] } {
  const sent: EmailMessage[] = [];
  return {
    sent,
    async send(message) {
      sent.push(message);
    },
  };
}

/** The sender as "Name <address>" or a bare address, checked before any provider uses it. */
export function parseSender(from: string): { name?: string; address: string } {
  const named = /^\s*(.*?)\s*<([^<>\s]+@[^<>\s]+)>\s*$/.exec(from);
  if (named) return { ...(named[1] ? { name: named[1] } : {}), address: named[2]! };
  const address = from.trim();
  if (!/^[^<>\s@]+@[^<>\s@]+$/.test(address)) {
    throw new Error(`EMAIL_FROM must be an address or "Name <address>", got "${from}".`);
  }
  return { address };
}
