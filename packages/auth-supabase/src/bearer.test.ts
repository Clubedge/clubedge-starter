import { generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { getSupabaseBearerUser } from "./index";

// A stand-in for a Supabase project's Auth server, with the real Supabase client against it: it
// publishes the project's signing key, and counts the requests that ask it who a token belongs to.
const base64url = (value: Buffer | string) => Buffer.from(value).toString("base64url");

function token(key: KeyObject, kid: string, claims: Record<string, unknown>) {
  const now = Math.floor(Date.now() / 1000);
  const body = { aud: "authenticated", iat: now, exp: now + 3600, ...claims };
  const text = `${base64url(JSON.stringify({ alg: "ES256", typ: "JWT", kid }))}.${base64url(JSON.stringify(body))}`;
  return `${text}.${base64url(sign("sha256", Buffer.from(text), { key, dsaEncoding: "ieee-p1363" }))}`;
}

const servers: Array<{ close(): void }> = [];
afterEach(() => {
  for (const server of servers.splice(0)) server.close();
});

async function project(user?: Record<string, unknown>) {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const kid = "key-1";
  const jwk = { ...publicKey.export({ format: "jwk" }), kid, alg: "ES256", use: "sig" };
  const asked = { keys: 0, user: 0 };
  const server = createServer((request, response) => {
    response.setHeader("content-type", "application/json");
    if (request.url === "/auth/v1/.well-known/jwks.json") {
      asked.keys++;
      response.end(JSON.stringify({ keys: [jwk] }));
    } else if (request.url === "/auth/v1/user") {
      asked.user++;
      if (!user) response.statusCode = 401;
      response.end(JSON.stringify(user ?? { code: 401, msg: "invalid JWT" }));
    } else {
      response.statusCode = 404;
      response.end("{}");
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  servers.push(server);
  const address = server.address();
  const url = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
  return { url, asked, sign: (claims: Record<string, unknown>) => token(privateKey, kid, claims) };
}

const ada = {
  sub: "user-1",
  email: "ada@example.com",
  role: "authenticated",
  user_metadata: { full_name: "Ada Lovelace" },
};

describe("getSupabaseBearerUser, against a project's Auth server", () => {
  it("takes a token signed with the project's key without asking who it belongs to", async () => {
    const supabase = await project();
    for (let request = 0; request < 3; request++) {
      expect(await getSupabaseBearerUser(supabase.url, "pk", supabase.sign(ada))).toEqual({
        id: "user-1",
        email: "ada@example.com",
        displayName: "Ada Lovelace",
      });
    }
    // The keys were fetched once and kept; no request asked Supabase Auth about a token.
    expect(supabase.asked).toEqual({ keys: 1, user: 0 });
  });

  it("refuses a token another key signed, one that expired, and one changed after signing", async () => {
    const supabase = await project();
    const other = await project();
    const expired = supabase.sign({ ...ada, exp: Math.floor(Date.now() / 1000) - 60 });
    const [header, , signature] = supabase.sign(ada).split(".");
    const changed = `${header}.${base64url(JSON.stringify({ ...ada, sub: "user-2", exp: 9e9 }))}.${signature}`;
    for (const refused of [other.sign(ada), expired, changed, "not-a-token"]) {
      expect(await getSupabaseBearerUser(supabase.url, "pk", refused)).toBeNull();
    }
  });

  it("refuses the project's own keys and anonymous sessions, signed as they are", async () => {
    const supabase = await project();
    for (const claims of [
      { role: "anon" },
      { role: "service_role" },
      { role: "authenticated", sub: "user-3", is_anonymous: true },
    ]) {
      expect(await getSupabaseBearerUser(supabase.url, "pk", supabase.sign(claims))).toBeNull();
    }
  });
});
