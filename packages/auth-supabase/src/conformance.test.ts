import type { CookieStore } from "@clubedge/auth";
import { describeAuthProvider } from "@clubedge/auth/conformance";
import { createSupabaseAuth } from "./index";

// Against a real Supabase Auth: the local stack (`supabase start`), as the Starter's CI runs it with
// these variables set. Emails go to the stack's inbox (Mailpit), where the reset link is read.
const url = process.env.SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY || undefined;
const inbox = (process.env.SUPABASE_INBOX_URL ?? "http://127.0.0.1:54324").replace(/\/$/, "");

/** A browser's cookie jar, as the framework would expose it through CookieStore. */
function cookieJar(): CookieStore {
  const values = new Map<string, string>();
  return {
    getAll: () => [...values].map(([name, value]) => ({ name, value })),
    setAll(cookies) {
      for (const { name, value, options } of cookies) {
        if (options?.maxAge === 0 || value === "") values.delete(name);
        else values.set(name, value);
      }
    },
  };
}

/** The first link in the newest email to `to`, from Mailpit's API. */
async function emailedLink(to: string): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const search = await fetch(`${inbox}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
    const { messages = [] } = (await search.json()) as { messages?: Array<{ ID: string }> };
    if (messages[0]) {
      const message = (await (await fetch(`${inbox}/api/v1/message/${messages[0].ID}`)).json()) as {
        Text: string;
        HTML: string;
      };
      const link =
        /https?:\/\/[^\s"<>]+/.exec(message.Text ?? "")?.[0] ??
        /href="([^"]+)"/.exec(message.HTML ?? "")?.[1];
      if (link) return link.replaceAll("&amp;", "&");
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`No email to ${to} arrived in ${inbox}.`);
}

describeAuthProvider(
  "supabase",
  () => ({
    browser: () =>
      createSupabaseAuth({
        url: url!,
        publishableKey: publishableKey!,
        cookies: cookieJar(),
        ...(secretKey ? { secretKey } : {}),
      }),
    async openResetLink(email, browser) {
      // Supabase's link verifies the token and redirects to the auth callback with a code, which
      // the callback exchanges for the session resetPassword uses.
      const verify = await fetch(await emailedLink(email), { redirect: "manual" });
      const code = new URL(
        verify.headers.get("location") ?? "",
        "http://localhost",
      ).searchParams.get("code");
      if (!code) throw new Error("The reset link did not redirect with a code.");
      const exchanged = await browser.exchangeCodeForSession(code);
      if (!exchanged.ok) throw new Error("The reset link's code was refused.");
      return undefined;
    },
  }),
  { skip: !(url && publishableKey) && "SUPABASE_URL is not set", timeoutMs: 60_000 },
);
