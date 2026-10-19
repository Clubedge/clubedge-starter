import { getSupabaseBearerUser } from "@clubedge/auth-supabase";
import type { User } from "@clubedge/contract";

export async function getCurrentUser(
  request: Request,
  config: { url: string; publishableKey: string },
): Promise<User | null> {
  const authorization = request.headers.get("authorization");
  const match = /^Bearer\s+(.+)$/i.exec(authorization ?? "");
  if (!match || !config.url || !config.publishableKey) return null;
  return getSupabaseBearerUser(config.url, config.publishableKey, match[1]!);
}
