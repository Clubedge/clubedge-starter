"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { clientEnv } from "@/env/client";
import { createSupabaseServerClient } from "@/lib/auth/supabase";

const credentialsSchema = z.object({
  email: z.email(),
  password: z.string().min(8).max(128),
});

function readCredentials(formData: FormData) {
  return credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
}

export async function signIn(formData: FormData) {
  const parsed = readCredentials(formData);
  if (!parsed.success) redirect("/login?error=invalid-input");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) redirect("/login?error=invalid-credentials");
  redirect("/");
}

export async function signUp(formData: FormData) {
  const parsed = readCredentials(formData);
  if (!parsed.success) redirect("/login?error=invalid-input");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    ...parsed.data,
    options: { emailRedirectTo: `${clientEnv.NEXT_PUBLIC_APP_URL}/auth/callback` },
  });
  if (error) redirect("/login?error=signup-failed");
  if (!data.session) redirect("/login?check-email=1");
  redirect("/");
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
