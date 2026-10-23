import { Account, Client, Query, Users } from "node-appwrite";
import { afterAll } from "vitest";
import type { AuthProvider, CookieStore } from "@clubedge/auth";
import { describeAuthProvider } from "@clubedge/auth/conformance";
import { createAppwriteAuth } from "./index";

// Against a real Appwrite: the Starter's CI runs it on an Appwrite Cloud test project with
// APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, and APPWRITE_API_KEY: the app's scopes, sessions.write
// and users.write, plus users.read, which only this test's cleanup needs to find its users.
// Appwrite emails the recovery link to the real address, so the test asks for a recovery token
// with the key instead: with users.write, Appwrite returns its secret.
const endpoint = process.env.APPWRITE_ENDPOINT;
const projectId = process.env.APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;
const configured = Boolean(endpoint && projectId && apiKey);
const baseUrl = "http://localhost:3000";

const admin = () => new Client().setEndpoint(endpoint!).setProject(projectId!).setKey(apiKey!);

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

// Every address this run signs up, so it removes its own users and no other run's.
const signedUp = new Set<string>();

afterAll(async () => {
  if (!configured) return;
  const users = new Users(admin());
  for (const email of signedUp) {
    const { users: found } = await users
      .list({ queries: [Query.equal("email", email)] })
      .catch(() => ({ users: [] }));
    for (const user of found) await users.delete({ userId: user.$id }).catch(() => {});
  }
}, 120_000);

describeAuthProvider(
  "appwrite",
  () => ({
    browser(): AuthProvider {
      const auth = createAppwriteAuth({
        endpoint: endpoint!,
        projectId: projectId!,
        apiKey: apiKey!,
        cookies: cookieJar(),
        baseUrl,
      });
      return {
        ...auth,
        async signUp(input) {
          signedUp.add(input.email);
          return auth.signUp(input);
        },
      };
    },
    async openResetLink(email) {
      const token = await new Account(admin()).createRecovery({
        email,
        url: `${baseUrl}/reset-password`,
      });
      if (!token.secret)
        throw new Error(
          "Appwrite returned no recovery secret: the API key needs the users.write scope.",
        );
      return `${token.userId}:${token.secret}`;
    },
  }),
  {
    skip: !configured && "APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, and APPWRITE_API_KEY are not set",
    timeoutMs: 90_000,
  },
);
