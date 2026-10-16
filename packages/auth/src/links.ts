// What an auth email's link carries, read the same way whichever provider sent it: a `code` for
// the auth callback or a `token` for the reset page (Supabase, Better Auth, Firebase), or
// `userId` and `secret`, which Appwrite appends to the URL it is given.

type Search = URLSearchParams | Record<string, unknown>;

const read = (search: Search, name: string) => {
  const value = search instanceof URLSearchParams ? search.get(name) : search[name];
  return typeof value === "string" && value ? value : null;
};

/** The separator between Appwrite's userId and secret in one token; neither contains it. */
export const TOKEN_SEPARATOR = ":";

/** The link's `name` parameter, or its userId and secret as one token; null without either. */
export function linkToken(search: Search, name: "code" | "token"): string | null {
  const direct = read(search, name);
  if (direct) return direct;
  const userId = read(search, "userId");
  const secret = read(search, "secret");
  return userId && secret ? `${userId}${TOKEN_SEPARATOR}${secret}` : null;
}

/** Splits a token linkToken joined, or null for one it didn't. */
export function splitLinkToken(token: string): { userId: string; secret: string } | null {
  const [userId, secret, ...rest] = token.split(TOKEN_SEPARATOR);
  return userId && secret && rest.length === 0 ? { userId, secret } : null;
}
