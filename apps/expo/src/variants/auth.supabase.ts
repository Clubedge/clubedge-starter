import { createSupabaseBrowserClient } from "@clubedge/auth-supabase/browser";
import deviceStorage from "expo-sqlite/kv-store";
import { AppState } from "react-native";
import { AccountError, signOutEverywhereFailed, type AuthClient } from "@/lib/auth-client";
import { apiUrl } from "@/lib/config";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

// The session stays in the app's own storage on the device (Supabase's sessions outgrow the
// secure store's values), under this key.
// Its address never carries one: emailed links open the website. // clubedge:only framework!=none
// Only the reset screen takes one from an address, an emailed link's. // clubedge:only framework=none
const storageKey = "supabase-session";

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
        storageKey,
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
    if (!supabase) return false;
    const { data, error } = await supabase.auth.getSession();
    // Supabase could not renew an expired session. Unless it refused it, it keeps the session to
    // renew once it can be reached, and the device still holds one.
    if (error) return (await deviceStorage.getItem(storageKey)) !== null;
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
  async signUp({ email, password, redirectTo }) {
    // The confirmation link confirms the address, then opens redirectTo; Supabase's Site URL
    // without it. Supabase only follows redirect URLs it allows: add it to Redirect URLs.
    const { data, error } = await client().auth.signUp({
      email,
      password,
      options: { emailRedirectTo: redirectTo },
    });
    if (error) throw error;
    return { needsConfirmation: !data.session };
  },
  async requestPasswordReset({ email, redirectTo }) {
    // The link opens redirectTo; the website's reset page without it. Supabase only follows
    // redirect URLs it allows: add it to Redirect URLs.
    const { error } = await client().auth.resetPasswordForEmail(email, {
      redirectTo: redirectTo ?? `${apiUrl}/reset-password`,
    });
    if (error) throw error;
  },
  // clubedge:if framework=none
  async resetPassword(link, newPassword) {
    // Supabase checked the emailed link, then opened this app with a session in the address's
    // fragment, or with an error: this device signs in with it, then sets the new password.
    const params = new URLSearchParams(link.split("#")[1] ?? "");
    const failure = params.get("error_description");
    if (failure) throw new Error(failure);
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    if (!accessToken || !refreshToken) {
      throw new Error("This link has expired or was already used: ask for a new one.");
    }
    const auth = client().auth;
    const { error } = await auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) throw error;
    const { error: updateError } = await auth.updateUser({ password: newPassword });
    if (updateError) {
      // Without its new password, the link's session goes too, so this device is not left signed
      // in. Supabase took the link, so the user asks for a new one.
      const { error: signOutError } = await auth.signOut({ scope: "local" });
      if (signOutError) await deviceStorage.removeItem(storageKey);
      if (updateError.code === "weak_password" || updateError.code === "same_password") {
        throw new Error(
          "Choose a password of 8 to 128 characters, different from your current one, then ask for a new link: this one has been used.",
        );
      }
      throw updateError;
    }
    return { signedIn: true };
  },
  // clubedge:end
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
  async signOut(options) {
    // "local" ends this device's session only, and "global" the user's sessions everywhere.
    const scope = options?.everywhere ? "global" : "local";
    const { error } = await client().auth.signOut({ scope });
    if (error && options?.everywhere) throw new Error(signOutEverywhereFailed);
    // When Supabase cannot be reached, it can keep the session to renew later, so the device
    // forgets it here.
    if (error) await deviceStorage.removeItem(storageKey);
  },
};
