import { createSupabaseBrowserClient } from "@clubedge/auth-supabase/browser";
import type { AuthClient } from "@/lib/auth-client";

const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const supabase =
  url && publishableKey ? createSupabaseBrowserClient(url, publishableKey) : null;

export const authClient: AuthClient = {
  configured: Boolean(supabase),
  async getAccessToken() {
    const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
    return data.session?.access_token;
  },
  async signIn(email, password) {
    const { error } = await supabase!.auth.signInWithPassword({ email, password });
    if (error) throw error;
  },
  async signUp(email, password, returnUrl) {
    const { data, error } = await supabase!.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: returnUrl },
    });
    if (error) throw error;
    return { needsConfirmation: !data.session };
  },
  async requestPasswordReset(email, returnUrl) {
    const { error } = await supabase!.auth.resetPasswordForEmail(email, { redirectTo: returnUrl });
    if (error) throw error;
  },
  async resetPassword(password) {
    const { error } = await supabase!.auth.updateUser({ password });
    if (error) throw error;
  },
  async completeEmailVerification(params) {
    const code = params.get("code");
    if (!code) return;
    const { error } = await supabase!.auth.exchangeCodeForSession(code);
    if (error) throw error;
  },
  async signOut() {
    const { error } = await supabase!.auth.signOut();
    if (error) throw error;
  },
};

export const getAccessToken = () => authClient.getAccessToken();
