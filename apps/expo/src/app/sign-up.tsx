import { router } from "expo-router";
import { useState } from "react";
import { Body, Button, Field, Notice, Screen, TextLink, Title } from "@/components/ui";
import { authClient } from "@/lib/auth";
import { useSession } from "@/lib/session";

export default function SignUp() {
  const { setSignedIn } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);

  const signUp = async () => {
    setBusy(true);
    setError(null);
    try {
      const { needsConfirmation } = await authClient.signUp(email.trim(), password);
      if (needsConfirmation) setEmailSent(true);
      else setSignedIn(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Sign up failed.");
    } finally {
      setBusy(false);
    }
  };

  if (emailSent) {
    return (
      <Screen>
        <Title>Check your email</Title>
        <Notice tone="success">
          We sent a link to {email.trim()}. Open it to confirm your address, then sign in here.
        </Notice>
        <TextLink title="Back to sign in" onPress={() => router.replace("/sign-in")} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Title>Create your account</Title>
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
        autoComplete="new-password"
        textContentType="newPassword"
      />
      <Body muted>At least 8 characters.</Body>
      <Button
        title="Create account"
        busy={busy}
        disabled={!authClient.configured || !email || password.length < 8}
        onPress={signUp}
      />
      <TextLink title="I already have an account" onPress={() => router.replace("/sign-in")} />
    </Screen>
  );
}
