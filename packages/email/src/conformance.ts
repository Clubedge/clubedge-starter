// The behaviour every EmailProvider must have, as one test suite. A provider's tests call
// describeEmail with a harness, so a new provider is proven by passing it rather than by review,
// and providers can't drift apart on construction, sending, or failure:
//
//   describeEmail("resend", () => ({ from, email: (from) => createResendEmail({ apiKey, from }) }));
//
// It runs in Vitest, which is why it is a separate entry (`@clubedge/email/conformance`) that
// only tests import. Delivery is only asserted when the harness can observe it; otherwise the
// suite proves what the interface promises: a send either resolves or rejects.
import { describe, expect, it } from "vitest";
import type { EmailProvider } from "./index";

export interface EmailHarness {
  /** A provider that sends from `from`. Throws when `from` is not a valid sender. */
  email(from: string): EmailProvider | Promise<EmailProvider>;
  /** The sender the suite sends with, on a domain the provider may send from. */
  from: string;
  /** The address to send to, when the provider needs a particular one. Default: a new inbox. */
  recipient?(): string;
  /** Whether a message to `to` carrying `subject` arrived. Omit when delivery can't be observed. */
  delivered?(to: string, subject: string): Promise<boolean>;
  /** A provider that cannot send (a dead server, a refused key), to prove failures reject. */
  broken?(): EmailProvider | Promise<EmailProvider>;
}

export interface EmailConformanceOptions {
  /** Skip the whole suite, for example when the provider's server isn't running. */
  skip?: boolean | string;
  /** Per-test timeout in milliseconds, for providers behind a network round trip. Default 30s. */
  timeoutMs?: number;
}

/** A new address per test, in a domain no mail is delivered to unless the harness catches it. */
let counter = 0;
const uniqueRecipient = () => `user-${Date.now().toString(36)}-${counter++}@example.com`;

export function describeEmail(
  provider: string,
  setup: () => EmailHarness | Promise<EmailHarness>,
  options: EmailConformanceOptions = {},
) {
  const timeout = options.timeoutMs ?? 30_000;
  const suite = options.skip ? describe.skip : describe;

  suite(`EmailProvider conformance: ${provider}`, () => {
    it(
      "sends a message with a plain-text and an HTML body",
      async () => {
        const harness = await setup();
        const email = await harness.email(harness.from);
        const to = harness.recipient?.() ?? uniqueRecipient();
        const subject = `Clubedge conformance ${Date.now().toString(36)}`;

        await expect(
          email.send({
            to,
            subject,
            text: "A plain-text body, for clients that do not render HTML.",
            html: "<p>An <strong>HTML</strong> body.</p>",
          }),
        ).resolves.toBeUndefined();

        if (harness.delivered) expect(await harness.delivered(to, subject)).toBe(true);
      },
      timeout,
    );

    it(
      "refuses an invalid sender at construction",
      async () => {
        const harness = await setup();
        await expect(Promise.resolve().then(() => harness.email("not-an-address"))).rejects.toThrow(
          /EMAIL_FROM/,
        );
      },
      timeout,
    );

    it(
      "rejects when the provider cannot send, rather than hanging",
      async () => {
        const harness = await setup();
        const broken = await harness.broken?.();
        if (!broken) return;
        await expect(
          broken.send({
            to: uniqueRecipient(),
            subject: "Refused",
            text: "The provider cannot send this.",
          }),
        ).rejects.toThrow();
      },
      timeout,
    );
  });
}
