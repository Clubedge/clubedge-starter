import { createSupabaseBearerClient, getSupabaseBearerUser } from "@clubedge/auth-supabase";
import type { User } from "@clubedge/contract";
import type { AccountDeletionResult, ProviderAccountDeletion } from "@/routes/account";

export async function getCurrentUser(
  request: Request,
  config: { url: string; publishableKey: string },
): Promise<User | null> {
  const authorization = request.headers.get("authorization");
  const match = /^Bearer\s+(.+)$/i.exec(authorization ?? "");
  if (!match || !config.url || !config.publishableKey) return null;
  return getSupabaseBearerUser(config.url, config.publishableKey, match[1]!);
}

/** Deleting a user is an admin operation, so it needs the project's secret key. */
export function canDeleteAccount(): boolean {
  const env = process.env;
  return Boolean(env.SUPABASE_URL && env.SUPABASE_PUBLISHABLE_KEY && env.SUPABASE_SECRET_KEY);
}

export async function deleteAccount({
  user,
  password,
  beforeDelete,
}: ProviderAccountDeletion): Promise<AccountDeletionResult> {
  const url = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !publishableKey || !secretKey) return "not-supported";
  // Signing in checks the password; the session it creates ends with the user below.
  const { data, error } = await createSupabaseBearerClient(
    url,
    publishableKey,
  ).auth.signInWithPassword({ email: user.email, password });
  if (error?.status === 429) return "rate-limited";
  if (error || data.user?.id !== user.id) return "invalid-password";
  await beforeDelete();
  const admin = createSupabaseBearerClient(url, secretKey);
  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) throw deleteError;
  return "deleted";
}
