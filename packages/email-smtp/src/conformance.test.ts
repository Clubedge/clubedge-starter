import { describeEmail } from "@clubedge/email/conformance";
import { createSmtpEmail } from "./index";

// Against a real SMTP server: SMTP_URL, as docker-compose.dev.yml (Mailpit) and the Supabase
// stack provide it. Mail caught in an inbox API (Mailpit's) proves the message really went out.
const url = process.env.SMTP_URL;
const from = process.env.EMAIL_FROM || "App <no-reply@example.com>";
const inbox = (process.env.SMTP_INBOX_URL ?? "http://127.0.0.1:8025").replace(/\/$/, "");

/** Polls the inbox for a message to `to` carrying `subject`, as a person watching for it would. */
async function delivered(to: string, subject: string) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const search = await fetch(`${inbox}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
    const { messages = [] } = (await search.json()) as { messages?: Array<{ ID: string }> };
    for (const { ID } of messages) {
      const message = (await (await fetch(`${inbox}/api/v1/message/${ID}`)).json()) as {
        Subject?: string;
      };
      if (message.Subject === subject) return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

describeEmail(
  "smtp",
  () => ({
    from,
    email: (from) => createSmtpEmail({ url: url!, from }),
    delivered,
    broken: () => createSmtpEmail({ url: "smtp://127.0.0.1:1", from }),
  }),
  { skip: !url && "SMTP_URL is not set", timeoutMs: 60_000 },
);
