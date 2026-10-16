import { linkToken, type CookieStore } from "@clubedge/auth";
import { describeAuthProvider } from "@clubedge/auth/conformance";
import { createAppwriteAuth } from "./index";

// Against a real Appwrite: the self-hosted server the Starter's CI starts, or any project, with
// APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, and APPWRITE_API_KEY. Appwrite sends the recovery email
// itself; the test reads its link from Mailpit (APPWRITE_INBOX_URL), where that server's SMTP goes.
const endpoint = process.env.APPWRITE_ENDPOINT;
const projectId = process.env.APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;
const inbox = (process.env.APPWRITE_INBOX_URL ?? "http://127.0.0.1:8025").replace(/\/$/, "");

/** A browser's cookie jar, as the framework would expose it through CookieStore. */
function cookieJar(): CookieStore {
  const values = new Map<string, string>();
  return {
    getAll: () => [...values].map(([name, value]) => ({ name, value })),
    setAll(cookies) {
      for (const { name, value, options } of cookies) {
        if (options?.maxAge === 0) values.delete(name);
        else values.set(name, value);
      }
    },
  };
}

/** The recovery link in the newest email to `to`, from Mailpit's API. */
async function recoveryLink(to: string): Promise<URL> {
  for (let attempt = 0; attempt < 60; attempt++) {
    const search = await fetch(`${inbox}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
    const { messages = [] } = (await search.json()) as { messages?: Array<{ ID: string }> };
    for (const { ID } of messages) {
      const message = (await (await fetch(`${inbox}/api/v1/message/${ID}`)).json()) as {
        Text?: string;
        HTML?: string;
      };
      const links =
        `${message.Text ?? ""} ${message.HTML ?? ""}`.match(/https?:\/\/[^\s"<>]+/g) ?? [];
      const link = links
        .map((value) => value.replaceAll("&amp;", "&"))
        .find((value) => value.includes("/reset-password"));
      if (link) return new URL(link);
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`No recovery email to ${to} arrived in ${inbox}.`);
}

describeAuthProvider(
  "appwrite",
  () => ({
    browser: () =>
      createAppwriteAuth({
        endpoint: endpoint!,
        projectId: projectId!,
        apiKey: apiKey!,
        cookies: cookieJar(),
        baseUrl: "http://localhost:3000",
      }),
    async openResetLink(email) {
      return linkToken((await recoveryLink(email)).searchParams, "token") ?? undefined;
    },
  }),
  {
    skip:
      !(endpoint && projectId && apiKey) &&
      "APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, and APPWRITE_API_KEY are not set",
    timeoutMs: 90_000,
  },
);
