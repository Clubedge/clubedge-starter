import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { betterAuth } from "better-auth/minimal";
import { bearer } from "better-auth/plugins"; // clubedge:only shell!=none
import { expo } from "@better-auth/expo"; // clubedge:only mobile!=none
import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { passwordResetEmail, verificationEmail } from "@clubedge/auth";
// clubedge:if email=smtp|resend
import { createConsoleEmail } from "@clubedge/email";
// clubedge:end
// clubedge:if email=smtp
import { createSmtpEmail } from "@clubedge/email-smtp";
// clubedge:end
// clubedge:if email=resend
import { createResendEmail } from "@clubedge/email-resend";
// clubedge:end
import { clientIp } from "./client-ip.mjs";
import site from "./src/config/site.json" with { type: "json" };

// clubedge:if mobile!=none
// The native app's address scheme, such as my-product://, which its sign-in requests carry: made
// from the site config the way the app's app.config.ts makes it, so the two stay in step.
const scheme =
  site.serviceId
    .toLowerCase()
    .replace(/[^a-z0-9+.-]/g, "")
    .replace(/^[^a-z]+/, "") || "app";
const appScheme = `${scheme}://`;
// clubedge:end

const id = () =>
  uuid("id")
    .default(sql`gen_random_uuid()`)
    .primaryKey();
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
  userId: uuid("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});
const account = pgTable("auth_account", {
  id: id(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: uuid("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
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
const maxAuthBodyBytes = 1024 * 1024;

class RequestBodyTooLargeError extends Error {
  constructor() {
    super("Authentication request body exceeds the 1 MiB limit.");
    this.name = "RequestBodyTooLargeError";
  }
}

// clubedge:if email=none
// Without the email module, auth emails go through Resend's API when RESEND_API_KEY and
// EMAIL_FROM are both set; otherwise verification and password reset are off.
async function sendWithResend({ to, subject, text, html }) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [to], subject, text, html }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Auth email provider returned ${response.status}.`);
}
// clubedge:end

// clubedge:if email=smtp|resend
/** Refuses to send, for production without an email provider; `pnpm check:env` reports it. */
function unconfigured(variable) {
  return async () => {
    throw new Error(`Email is not configured: set ${variable} to send email in production.`);
  };
}
// clubedge:end

/**
 * How verification and password reset emails are sent: through the email module, or null to
 * turn both features off. The first configured sender wins.
 */
function authEmailSender() {
  const env = process.env;
  // A list, so the code reads the same with and without each provider's block.
  const senders = [];
  // clubedge:if email=smtp|resend
  const from = env.EMAIL_FROM || "App <no-reply@example.com>";
  const production = env.NODE_ENV === "production";
  // clubedge:end
  // clubedge:if email=smtp
  // Email over SMTP: any provider's SMTP endpoint, or a local inbox such as Mailpit.
  if (env.SMTP_URL) {
    const smtp = createSmtpEmail({ url: env.SMTP_URL, from });
    senders.push((message) => smtp.send(message));
  } else if (production) senders.push(unconfigured("SMTP_URL"));
  // clubedge:end
  // clubedge:if email=resend
  // Email through Resend's API. EMAIL_FROM must use a domain verified in Resend.
  if (env.RESEND_API_KEY) {
    const resend = createResendEmail({ apiKey: env.RESEND_API_KEY, from });
    senders.push((message) => resend.send(message));
  } else if (production) senders.push(unconfigured("RESEND_API_KEY"));
  // clubedge:end
  // clubedge:if email=smtp|resend
  // Without a provider, development prints emails to the server log.
  const logged = createConsoleEmail();
  senders.push((message) => logged.send(message));
  // clubedge:end
  // clubedge:if email=none
  if (env.RESEND_API_KEY && env.EMAIL_FROM) senders.push(sendWithResend);
  // clubedge:end
  return senders[0] ?? null;
}

function getAuthServer() {
  if (authServer) return authServer;
  const databaseUrl = process.env.DATABASE_URL;
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!databaseUrl || !secret) return null;
  const sendEmail = authEmailSender();
  const appName = site.name;
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
  const trustedOrigins = [];
  const plugins = [];
  // clubedge:if shell!=none
  // The mobile shell signs in from its own origins (MOBILE_ORIGINS, as server.mjs reads them),
  // and its WebView keeps no cookie for this server: the bearer plugin answers with the session
  // token in a header, and takes it back as a bearer token.
  trustedOrigins.push(
    ...(process.env.MOBILE_ORIGINS ?? "capacitor://localhost,https://localhost")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
  plugins.push(bearer());
  // clubedge:end
  // clubedge:if mobile!=none
  // The native app signs in with its own scheme, which it sends as expo-origin, and keeps the
  // session cookie on the device: the expo plugin takes expo-origin as the request's origin.
  trustedOrigins.push(appScheme);
  plugins.push(expo());
  // clubedge:end
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
        Boolean(sendEmail) && process.env.BETTER_AUTH_REQUIRE_EMAIL_VERIFICATION === "true",
      ...(sendEmail
        ? {
            resetPasswordTokenExpiresIn: 60 * 60,
            sendResetPassword: async ({ user, token }) => {
              const url = new URL("/reset-password", baseURL);
              url.searchParams.set("token", token);
              await sendEmail(passwordResetEmail({ to: user.email, url: url.toString(), appName }));
            },
          }
        : {}),
    },
    ...(sendEmail
      ? {
          emailVerification: {
            sendOnSignUp: true,
            autoSignInAfterVerification: true,
            sendVerificationEmail: async ({ user, url }) =>
              sendEmail(verificationEmail({ to: user.email, url, appName })),
          },
        }
      : {}),
    // The API deletes accounts (POST /api/account/delete), removing the app's data with them, so
    // Better Auth's own delete-user endpoint stays off.
    user: { deleteUser: { enabled: false } },
    advanced: { database: { generateId: "uuid" } },
    rateLimit: {
      enabled: true,
      // The settings page's password changes: 10 a minute per address, as the API allows
      // account deletions per user. The limits are kept in this process, so they cannot fail open.
      customRules: { "/change-password": { window: 60, max: 10 } },
    },
    trustedOrigins,
    plugins,
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
  // Better Auth limits requests per client address, which it reads from this header: give it the
  // address this server finds (client-ip.mjs), never a copy the client sent.
  headers.set("x-forwarded-for", clientIp(request));
  const method = request.method ?? "GET";
  let body;
  if (method !== "GET" && method !== "HEAD") {
    const contentLength = Number(request.headers["content-length"]);
    if (Number.isFinite(contentLength) && contentLength > maxAuthBodyBytes) {
      request.resume();
      throw new RequestBodyTooLargeError();
    }
    body = await new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      let tooLarge = false;
      request.on("data", (chunk) => {
        if (tooLarge) return;
        size += chunk.length;
        if (size > maxAuthBodyBytes) {
          tooLarge = true;
          reject(new RequestBodyTooLargeError());
          return;
        }
        chunks.push(chunk);
      });
      request.on("end", () => {
        if (!tooLarge) resolve(Buffer.concat(chunks));
      });
      request.on("error", reject);
    });
  }
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
  } catch (error) {
    if (response.headersSent) {
      response.destroy();
      return;
    }
    const tooLarge = error instanceof RequestBodyTooLargeError;
    response.writeHead(tooLarge ? 413 : 500, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        error: tooLarge
          ? "Authentication request body is too large."
          : "Authentication request failed.",
      }),
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.AUTH_PORT ?? 3002);
  createServer(serveAuthRequest).listen(port, "127.0.0.1", () =>
    console.log(`Better Auth listening on ${port}.`),
  );
}
