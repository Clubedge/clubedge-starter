import { router } from "expo-router";
import { useState } from "react";
import site from "@/config/site.json";
import { Body, Button, Field, Notice, Screen, TextLink, Title } from "@/components/ui";
import { authClient } from "@/lib/auth";
import { useSession } from "@/lib/session";

export default function SignIn() {
  const { refresh } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = async () => {
    setBusy(true);
    setError(null);
    try {
      await authClient.signIn(email.trim(), password);
      // Signed in, the app's screens open in place of this one.
      await refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Sign in failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Title>Sign in to {site.shortName}</Title>
      {!authClient.configured ? (
        <Notice tone="error">
          Sign-in is not configured yet. Add your auth provider's settings to
          apps/mobile/.env.local.
        </Notice>
      ) : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
      />
      <Field
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
      />
      <Button
        title="Sign in"
        busy={busy}
        disabled={!authClient.configured || !email || !password}
        onPress={signIn}
      />
      <TextLink title="Forgot your password?" onPress={() => router.push("/forgot-password")} />
      <Body muted>No account yet?</Body>
      <TextLink title="Create one" onPress={() => router.push("/sign-up")} />
    </Screen>
  );
}
