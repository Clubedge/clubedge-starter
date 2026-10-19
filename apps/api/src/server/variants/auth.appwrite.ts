import type { User } from "@clubedge/contract";

export async function getCurrentUser(
  request: Request,
  _config?: { url: string; publishableKey: string },
): Promise<User | null> {
  const token = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "")?.[1];
  const endpoint = process.env.APPWRITE_ENDPOINT;
  const projectId = process.env.APPWRITE_PROJECT_ID;
  if (!token || !endpoint || !projectId) return null;
  try {
    const response = await fetch(`${endpoint.replace(/\/$/, "")}/account`, {
      headers: { "X-Appwrite-Project": projectId, "X-Appwrite-JWT": token },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const account = (await response.json()) as {
      $id?: unknown;
      email?: unknown;
      name?: unknown;
      emailVerification?: unknown;
    };
    if (
      typeof account.$id !== "string" ||
      typeof account.email !== "string" ||
      account.emailVerification !== true
    )
      return null;
    return {
      id: account.$id,
      email: account.email,
      displayName: typeof account.name === "string" ? account.name : null,
    };
  } catch {
    return null;
  }
}
