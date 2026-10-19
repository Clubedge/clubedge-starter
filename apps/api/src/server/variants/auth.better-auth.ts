import type { User } from "@clubedge/contract";

export async function getCurrentUser(request: Request): Promise<User | null> {
  const authUrl = process.env.BETTER_AUTH_URL;
  const cookie = request.headers.get("cookie");
  if (!authUrl || !cookie) return null;
  try {
    const response = await fetch(new URL("/api/auth/get-session", authUrl), {
      headers: { cookie }, signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as {
      user?: { id?: unknown; email?: unknown; name?: unknown } | null;
    };
    const user = payload.user;
    if (!user || typeof user.id !== "string" || typeof user.email !== "string") return null;
    return {
      id: user.id,
      email: user.email,
      displayName: typeof user.name === "string" ? user.name : null,
    };
  } catch {
    return null;
  }
}
