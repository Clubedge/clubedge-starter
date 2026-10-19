import type { User } from "@clubedge/contract";

export async function getCurrentUser(request: Request): Promise<User | null> {
  const authUrl = process.env.BETTER_AUTH_URL;
  const cookie = request.headers.get("cookie");
  if (!authUrl || !cookie) return null;
  try {
    const response = await fetch(new URL("/api/auth/get-session", authUrl), {
      headers: { cookie },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== "object") return null;
    const user = (payload as { user?: unknown }).user;
    if (!user || typeof user !== "object") return null;
    const record = user as { id?: unknown; email?: unknown; name?: unknown };
    if (typeof record.id !== "string" || typeof record.email !== "string") return null;
    return {
      id: record.id,
      email: record.email,
      displayName: typeof record.name === "string" ? record.name : null,
    };
  } catch {
    return null;
  }
}
