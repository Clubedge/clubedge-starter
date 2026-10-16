import { randomBytes } from "node:crypto";
import { memoryAdapter } from "better-auth/adapters/memory";
import type { CookieStore } from "@clubedge/auth";
import { describeAuthProvider } from "@clubedge/auth/conformance";
import { createBetterAuth, createBetterAuthServer, type AuthEmail } from "./index";

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

// Real Better Auth on its in-memory database, with the emails it sends kept for the reset link.
describeAuthProvider("better-auth", () => {
  const sent: AuthEmail[] = [];
  const server = createBetterAuthServer({
    database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
    secret: randomBytes(32).toString("hex"),
    baseUrl: "http://localhost:3000",
    sendEmail: async (email) => {
      sent.push(email);
    },
  });
  return {
    browser: () => createBetterAuth({ server, cookies: cookieJar() }),
    async openResetLink(email) {
      // Emails are sent in the background.
      for (let attempt = 0; attempt < 100; attempt++) {
        const reset = sent.findLast(
          (message) => message.to === email && /reset/i.test(message.subject),
        );
        if (reset)
          return (
            new URL(/https?:\/\/\S+/.exec(reset.text)![0]).searchParams.get("token") ?? undefined
          );
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      throw new Error(`No reset email to ${email}.`);
    },
  };
});
