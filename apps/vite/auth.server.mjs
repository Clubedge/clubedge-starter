import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { betterAuth } from "better-auth/minimal";
import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

const id = () => uuid("id").default(sql`gen_random_uuid()`).primaryKey();
const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull();
const user = pgTable("auth_user", {
  id: id(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
const session = pgTable("auth_session", {
  id: id(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: uuid("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
});
const account = pgTable("auth_account", {
  id: id(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: uuid("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
const verification = pgTable("auth_verification", {
  id: id(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

let authServer;

async function sendEmail({ to, subject, text, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    throw new Error("Configure RESEND_API_KEY and EMAIL_FROM to send auth emails.");
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ from, to: [to], subject, text, html }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Auth email provider returned ${response.status}.`);
}

function getAuthServer() {
  if (authServer) return authServer;
  const databaseUrl = process.env.DATABASE_URL;
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!databaseUrl || !secret) return null;
  const hasEmailProvider = Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
  const client = postgres(databaseUrl, {
    prepare: false,
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  const database = drizzle({
    client,
    schema: { user, session, account, verification },
  });
  const baseURL =
    process.env.BETTER_AUTH_URL || process.env.FRONTEND_URL || "http://localhost:3000";
  authServer = betterAuth({
    database: drizzleAdapter(database, {
      provider: "pg",
      schema: { user, session, account, verification },
    }),
    secret,
    baseURL,
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      requireEmailVerification:
        hasEmailProvider && process.env.BETTER_AUTH_REQUIRE_EMAIL_VERIFICATION === "true",
      ...(hasEmailProvider
        ? {
            sendResetPassword: async ({ user, token }) => {
              const url = new URL("/reset-password", baseURL);
              url.searchParams.set("token", token);
              await sendEmail({
                to: user.email,
                subject: "Reset your password",
                text: `Reset your password: ${url.toString()}`,
                html: [
                  "<p>Reset your password:</p>",
                  `<p><a href="${url.toString()}">Choose a new password</a></p>`,
                ].join(""),
              });
            },
          }
        : {}),
      ...(hasEmailProvider
        ? { resetPasswordTokenExpiresIn: 60 * 60 }
        : {}),
    },
    ...(hasEmailProvider
      ? {
          emailVerification: {
            sendOnSignUp: true,
            autoSignInAfterVerification: true,
            sendVerificationEmail: async ({ user, url }) =>
              sendEmail({
                to: user.email,
                subject: "Confirm your email address",
                text: `Confirm your email address: ${url}`,
                html: `<p>Confirm your email address:</p><p><a href="${url}">Confirm email</a></p>`,
              }),
          },
        }
      : {}),
    user: { deleteUser: { enabled: true } },
    advanced: { database: { generateId: "uuid" } },
    rateLimit: { enabled: true },
  });
  return authServer;
}

export async function handleAuthRequest(request) {
  const server = getAuthServer();
  if (!server) return null;
  return server.handler(request);
}

async function toWebRequest(request) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(", ") : value);
  }
  const method = request.method ?? "GET";
  const body = method === "GET" || method === "HEAD"
    ? undefined
    : await new Promise((resolve, reject) => {
        const chunks = [];
        request.on("data", (chunk) => chunks.push(chunk));
        request.on("end", () => resolve(Buffer.concat(chunks)));
        request.on("error", reject);
      });
  return new Request(new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`), {
    method,
    headers,
    body,
  });
}

export async function serveAuthRequest(request, response) {
  try {
    const result = await handleAuthRequest(await toWebRequest(request));
    if (!result) {
      response.writeHead(503, { "content-type": "application/json" });
      response.end(
        JSON.stringify({ error: "Better Auth requires DATABASE_URL and BETTER_AUTH_SECRET." }),
      );
      return;
    }
    const headers = Object.fromEntries(result.headers.entries());
    if (typeof result.headers.getSetCookie === "function") {
      headers["set-cookie"] = result.headers.getSetCookie();
    }
    response.writeHead(result.status, headers);
    response.end(Buffer.from(await result.arrayBuffer()));
  } catch {
    response.writeHead(500, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "Authentication request failed." }));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.AUTH_PORT ?? 3002);
  createServer(serveAuthRequest).listen(port, "127.0.0.1", () =>
    console.log(`Better Auth listening on ${port}.`),
  );
}
