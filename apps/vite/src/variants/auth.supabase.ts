import { createSupabaseBrowserClient } from "@clubedge/auth-supabase/browser";
import { AccountError, type AuthClient } from "@/lib/auth-client";

const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

function createClient() {
  if (!url || !publishableKey) return null;
  // clubedge:if shell!=none
  if (import.meta.env.MODE === "app") {
    // The mobile app keeps its session in the device's storage, and its address never carries
    // one: emailed links open the website.
    const device = () => import("@clubedge/mobile").then((mobile) => mobile.storage);
    return createSupabaseBrowserClient(url, publishableKey, {
      storage: {
        getItem: async (key) => (await device()).get(key),
        setItem: async (key, value) => (await device()).set(key, value),
        removeItem: async (key) => (await device()).remove(key),
      },
      detectSessionInUrl: false,
    });
  }
  // clubedge:end
  return createSupabaseBrowserClient(url, publishableKey);
}

export const supabase = createClient();

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
  async changePassword(currentPassword, newPassword) {
    const { data } = await supabase!.auth.getUser();
    if (!data.user?.email) throw new Error("Not signed in.");
    // Signing in again checks the current password, and gives this browser a fresh session.
    const { error } = await supabase!.auth.signInWithPassword({
      email: data.user.email,
      password: currentPassword,
    });
    if (error?.status === 429) throw new AccountError("rate-limited");
    if (error) throw new AccountError("invalid-password");
    const { error: updateError } = await supabase!.auth.updateUser({ password: newPassword });
    if (updateError?.code === "weak_password" || updateError?.code === "same_password") {
      throw new AccountError("invalid-input");
    }
    if (updateError) throw updateError;
    // Sessions on other devices end; this one stays signed in.
    const { error: signOutError } = await supabase!.auth.signOut({ scope: "others" });
    if (signOutError) throw signOutError;
  },
  async signOut() {
    const { error } = await supabase!.auth.signOut();
    if (error) throw error;
  },
};

export const getAccessToken = () => authClient.getAccessToken();
