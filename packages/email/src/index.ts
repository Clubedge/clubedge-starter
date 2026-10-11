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
  // Plain string handling rather than a regular expression, so no input can make it slow.
  const value = from.trim();
  const open = value.lastIndexOf("<");
  const named = open !== -1 && value.endsWith(">");
  const name = named ? value.slice(0, open).trim() : "";
  const address = named ? value.slice(open + 1, -1).trim() : value;
  const at = address.indexOf("@");
  const valid =
    at > 0 && at === address.lastIndexOf("@") && at < address.length - 1 && !/[\s<>]/.test(address);
  if (!valid) throw new Error(`EMAIL_FROM must be an address or "Name <address>", got "${from}".`);
  return { ...(name ? { name } : {}), address };
}
