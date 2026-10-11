// Reads emails from a local inbox: Mailpit (Docker Compose, and newer Supabase CLI stacks) or
// Inbucket (older Supabase CLI stacks). E2E_MAIL_API is the inbox's web address.

type Message = { subject: string; text: string; html: string };

async function json<T>(url: string): Promise<T | null> {
  const response = await fetch(url).catch(() => null);
  return response?.ok ? ((await response.json()) as T) : null;
}

async function mailpitMessages(api: string, to: string): Promise<Message[] | null> {
  const search = await json<{ messages: Array<{ ID: string; Subject: string }> }>(
    `${api}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`,
  );
  if (!search) return null;
  return Promise.all(
    search.messages.map(async ({ ID, Subject }) => {
      const message = await json<{ Text: string; HTML: string }>(`${api}/api/v1/message/${ID}`);
      return { subject: Subject, text: message?.Text ?? "", html: message?.HTML ?? "" };
    }),
  );
}

async function inbucketMessages(api: string, to: string): Promise<Message[] | null> {
  const mailbox = to.split("@")[0]!;
  const list = await json<Array<{ id: string; subject: string }>>(
    `${api}/api/v1/mailbox/${mailbox}`,
  );
  if (!list) return null;
  return Promise.all(
    list.reverse().map(async ({ id, subject }) => {
      const message = await json<{ body: { text: string; html: string } }>(
        `${api}/api/v1/mailbox/${mailbox}/${id}`,
      );
      return { subject, text: message?.body.text ?? "", html: message?.body.html ?? "" };
    }),
  );
}

/** The first link in the newest email to `to` whose subject matches, waiting for it to arrive. */
export async function emailedLink(to: string, subject: RegExp): Promise<string> {
  const api = process.env.E2E_MAIL_API!.replace(/\/$/, "");
  for (let attempt = 0; attempt < 30; attempt++) {
    const messages = (await mailpitMessages(api, to)) ?? (await inbucketMessages(api, to)) ?? [];
    const message = messages.find((candidate) => subject.test(candidate.subject));
    const link =
      message &&
      (/https?:\/\/[^\s"<>]+/.exec(message.text)?.[0] ?? /href="([^"]+)"/.exec(message.html)?.[1]);
    if (link) return link.replaceAll("&amp;", "&");
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`No email to ${to} matching ${subject} arrived in ${api}.`);
}
