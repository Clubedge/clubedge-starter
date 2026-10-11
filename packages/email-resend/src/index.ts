import { parseSender, type EmailProvider } from "@clubedge/email";

export interface ResendEmailConfig {
  apiKey: string;
  /** The sender, on a domain verified in Resend, as "Name <address>" or an address. */
  from: string;
  /** For tests. */
  fetch?: typeof fetch;
}

const API = "https://api.resend.com";

async function failure(response: Response, action: string) {
  const body = await response.text().catch(() => "");
  return new Error(`Resend could not ${action} (${response.status}): ${body.slice(0, 300)}`);
}

/** Sends with Resend's HTTP API (https://resend.com/docs/api-reference), without an SDK. */
export function createResendEmail({
  apiKey,
  from,
  fetch: request = fetch,
}: ResendEmailConfig): EmailProvider & {
  /** Checks the API key without sending anything, for `pnpm check:services`. */
  verify(): Promise<void>;
} {
  const sender = parseSender(from);
  const headers = { authorization: `Bearer ${apiKey}`, "content-type": "application/json" };
  return {
    async send({ to, subject, text, html }) {
      const response = await request(`${API}/emails`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          from: sender.name ? `${sender.name} <${sender.address}>` : sender.address,
          to: [to],
          subject,
          text,
          ...(html ? { html } : {}),
        }),
      });
      if (!response.ok) throw await failure(response, "send the email");
    },
    async verify() {
      const response = await request(`${API}/domains`, { headers });
      if (response.ok) return;
      const body = await response
        .clone()
        .text()
        .catch(() => "");
      // A key limited to sending cannot list domains, which still proves it is valid.
      if (response.status === 401 && body.includes("restricted_api_key")) return;
      throw await failure(response, "verify the API key");
    },
  };
}
