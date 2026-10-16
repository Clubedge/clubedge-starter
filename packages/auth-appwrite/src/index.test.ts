import { randomBytes } from "node:crypto";
import { vi } from "vitest";
import { linkToken, type CookieStore } from "@clubedge/auth";
import { describeAuthProvider } from "@clubedge/auth/conformance";

// The conformance suite against an in-memory stand-in for node-appwrite, which follows Appwrite
// 2.5's behaviour for what the provider calls: sessions and their secrets, account creation,
// recovery and verification tokens (with the emails Appwrite would send), and its error types.
// conformance.live.test.ts runs the same suite against a real Appwrite when one is configured.
const appwrite = vi.hoisted(() => {
  interface User {
    $id: string;
    email: string;
    password: string;
    emailVerification: boolean;
  }
  interface Session {
    $id: string;
    secret: string;
    userId: string;
    expire: string;
  }
  const state = {
    users: new Map<string, User>(),
    sessions: new Map<string, Session>(),
    tokens: new Map<string, { userId: string; kind: "recovery" | "verification" }>(),
    emails: [] as Array<{ to: string; url: string; kind: "recovery" | "verification" }>,
  };
  class AppwriteException extends Error {
    constructor(
      message: string,
      readonly code: number,
      readonly type: string,
    ) {
      super(message);
    }
  }
  const fail = (code: number, type: string): never => {
    throw new AppwriteException(type, code, type);
  };
  const random = () => randomId();
  function randomId() {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
  class Client {
    key?: string;
    session?: string;
    setEndpoint() {
      return this;
    }
    setProject() {
      return this;
    }
    setKey(key: string) {
      this.key = key;
      return this;
    }
    setSession(secret: string) {
      this.session = secret;
      return this;
    }
  }
  const byEmail = (email: string) => [...state.users.values()].find((user) => user.email === email);
  const sessionOf = (client: Client) =>
    [...state.sessions.values()].find((session) => session.secret === client.session);
  function issue(userId: string, kind: "recovery" | "verification", base: string, to: string) {
    const secret = random();
    state.tokens.set(secret, { userId, kind });
    const url = new URL(base);
    url.searchParams.set("userId", userId);
    url.searchParams.set("secret", secret);
    url.searchParams.set("expire", new Date(Date.now() + 3600_000).toISOString());
    state.emails.push({ to, url: url.toString(), kind });
  }
  function consume(userId: string, secret: string, kind: "recovery" | "verification") {
    const token = state.tokens.get(secret);
    if (!token || token.userId !== userId || token.kind !== kind) fail(401, "user_invalid_token");
    state.tokens.delete(secret);
  }
  class Account {
    constructor(private client: Client) {}
    private me() {
      const session = sessionOf(this.client);
      const user = session && state.users.get(session.userId);
      return user && session ? { user, session } : fail(401, "general_unauthorized_scope");
    }
    async create({ userId, email, password }: { userId: string; email: string; password: string }) {
      if (byEmail(email)) fail(409, "user_already_exists");
      if (password.length < 8) fail(400, "general_argument_invalid");
      state.users.set(userId, { $id: userId, email, password, emailVerification: false });
      return { $id: userId, email };
    }
    async createEmailPasswordSession({ email, password }: { email: string; password: string }) {
      const user = byEmail(email);
      if (!user || user.password !== password) fail(401, "user_invalid_credentials");
      const session = {
        $id: random(),
        secret: randomBytes(16).toString("hex"),
        userId: user!.$id,
        expire: new Date(Date.now() + 86400_000).toISOString(),
      };
      state.sessions.set(session.$id, session);
      return session;
    }
    async get() {
      const { user } = this.me();
      return { $id: user.$id, email: user.email, emailVerification: user.emailVerification };
    }
    async createEmailVerification({ url }: { url: string }) {
      const { user } = this.me();
      issue(user.$id, "verification", url, user.email);
    }
    async updateEmailVerification({ userId, secret }: { userId: string; secret: string }) {
      consume(userId, secret, "verification");
      state.users.get(userId)!.emailVerification = true;
    }
    async createRecovery({ email, url }: { email: string; url: string }) {
      const user = byEmail(email);
      if (user) issue(user.$id, "recovery", url, email);
    }
    async updateRecovery({
      userId,
      secret,
      password,
    }: {
      userId: string;
      secret: string;
      password: string;
    }) {
      consume(userId, secret, "recovery");
      state.users.get(userId)!.password = password;
    }
    async updatePassword({ password, oldPassword }: { password: string; oldPassword: string }) {
      const { user } = this.me();
      if (user.password !== oldPassword) fail(401, "user_invalid_credentials");
      user.password = password;
    }
    async deleteSessions({ current = true }: { current?: boolean } = {}) {
      const { user, session } = this.me();
      for (const [id, other] of state.sessions) {
        if (other.userId === user.$id && (current || id !== session.$id)) state.sessions.delete(id);
      }
    }
    async deleteSession({ sessionId }: { sessionId: string }) {
      const { session } = this.me();
      state.sessions.delete(sessionId === "current" ? session.$id : sessionId);
    }
  }
  class Users {
    async deleteSessions({ userId }: { userId: string }) {
      for (const [id, session] of state.sessions)
        if (session.userId === userId) state.sessions.delete(id);
    }
    async deleteSession({ sessionId }: { userId: string; sessionId: string }) {
      state.sessions.delete(sessionId);
    }
    async delete({ userId }: { userId: string }) {
      state.users.delete(userId);
      await this.deleteSessions({ userId });
    }
  }
  const ID = { unique: random };
  return { state, module: { AppwriteException, Client, Account, Users, ID } };
});

vi.mock("node-appwrite", () => appwrite.module);

const { createAppwriteAuth } = await import("./index");

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

describeAuthProvider("appwrite (SDK stand-in)", () => ({
  browser: () =>
    createAppwriteAuth({
      endpoint: "https://appwrite.test/v1",
      projectId: "test",
      apiKey: "key",
      cookies: cookieJar(),
      baseUrl: "http://localhost:3000",
    }),
  async openResetLink(email) {
    const recovery = appwrite.state.emails.findLast(
      (sent) => sent.to === email && sent.kind === "recovery",
    );
    if (!recovery) throw new Error(`No recovery email to ${email}.`);
    const url = new URL(recovery.url);
    // The reset page reads the link the same way.
    if (url.pathname !== "/reset-password")
      throw new Error(`The recovery link opens ${url.pathname}.`);
    return linkToken(url.searchParams, "token") ?? undefined;
  },
}));
