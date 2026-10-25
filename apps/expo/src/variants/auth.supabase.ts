import { createSupabaseBrowserClient } from "@clubedge/auth-supabase/browser";
import deviceStorage from "expo-sqlite/kv-store";
import { AppState } from "react-native";
import { AccountError, type AuthClient } from "@/lib/auth-client";
import { apiUrl } from "@/lib/config";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

// The session stays in the app's own storage on the device (Supabase's sessions outgrow the
// secure store's values). Its address never carries one: emailed links open the website.
const supabase =
  url && publishableKey
    ? createSupabaseBrowserClient(url, publishableKey, {
        storage: {
          getItem: (key) => deviceStorage.getItem(key),
          setItem: (key, value) => deviceStorage.setItem(key, value),
          removeItem: async (key) => {
            await deviceStorage.removeItem(key);
          },
        },
        detectSessionInUrl: false,
      })
    : null;

// Supabase renews the session only while the app is on screen, as it recommends on phones.
if (supabase) {
  AppState.addEventListener("change", (state) => {
    if (state === "active") void supabase.auth.startAutoRefresh();
    else void supabase.auth.stopAutoRefresh();
  });
}

const client = () => {
  if (!supabase) throw new Error("Add the Supabase settings to apps/mobile/.env.local.");
  return supabase;
};

export const authClient: AuthClient = {
  configured: Boolean(supabase),
  async hasSession() {
    const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
    return Boolean(data.session);
  },
  onChange(listener) {
    const subscription = supabase?.auth.onAuthStateChange(() => listener()).data.subscription;
    return () => subscription?.unsubscribe();
  },
  async sessionHeaders(): Promise<Record<string, string>> {
    const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
    const token = data.session?.access_token;
    return token ? { authorization: `Bearer ${token}` } : {};
  },
  async signIn(email, password) {
    const { error } = await client().auth.signInWithPassword({ email, password });
    if (error) throw error;
  },
  async signUp(email, password) {
    // The confirmation link opens the website (Supabase's Site URL), which signs in there.
    const { data, error } = await client().auth.signUp({ email, password });
    if (error) throw error;
    return { needsConfirmation: !data.session };
  },
  async requestPasswordReset(email) {
    // The link opens the website's reset page. Supabase only follows redirect URLs it allows:
    // add the website's to Redirect URLs, as for the website itself.
    const { error } = await client().auth.resetPasswordForEmail(email, {
      redirectTo: `${apiUrl}/reset-password`,
    });
    if (error) throw error;
  },
  async changePassword(currentPassword, newPassword) {
    const auth = client().auth;
    const { data } = await auth.getUser();
    if (!data.user?.email) throw new Error("Not signed in.");
    // Signing in again checks the current password, and gives this device a fresh session.
    const { error } = await auth.signInWithPassword({
      email: data.user.email,
      password: currentPassword,
    });
    if (error?.status === 429) throw new AccountError("rate-limited");
    if (error) throw new AccountError("invalid-password");
    const { error: updateError } = await auth.updateUser({ password: newPassword });
    if (updateError?.code === "weak_password" || updateError?.code === "same_password") {
      throw new AccountError("invalid-input");
    }
    if (updateError) throw updateError;
    // Sessions on other devices end; this one stays signed in.
    const { error: signOutError } = await auth.signOut({ scope: "others" });
    if (signOutError) throw signOutError;
  },
  async signOut() {
    // "local" forgets the session on this device even when Supabase cannot be reached.
    await client().auth.signOut({ scope: "local" });
  },
};
