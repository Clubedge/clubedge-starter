import type { AuthEmail, CookieStore } from "@clubedge/auth";
import { describeAuthProvider } from "@clubedge/auth/conformance";
import { createFirebaseAuth } from "./index";

// Against Firebase's Auth Emulator (`firebase emulators:start --only auth`), as the Starter's CI
// runs it: FIREBASE_AUTH_EMULATOR_HOST, and a demo- project id.
const emulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const projectId = process.env.FIREBASE_PROJECT_ID ?? "demo-clubedge";

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

describeAuthProvider(
  "firebase",
  () => {
    const sent: AuthEmail[] = [];
    return {
      browser: () =>
        createFirebaseAuth({
          projectId,
          apiKey: "demo-api-key",
          emulatorHost,
          cookies: cookieJar(),
          baseUrl: "http://localhost:3000",
          sendEmail: async (email) => {
            sent.push(email);
          },
        }),
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
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        throw new Error(`No reset email to ${email}.`);
      },
    };
  },
  { skip: !emulatorHost && "FIREBASE_AUTH_EMULATOR_HOST is not set", timeoutMs: 60_000 },
);
