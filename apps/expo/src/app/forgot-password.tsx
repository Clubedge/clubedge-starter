import { router } from "expo-router";
import { useState } from "react";
import { Body, Button, Field, Notice, Screen, TextLink, Title } from "@/components/ui";
import { authClient } from "@/lib/auth";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await authClient.requestPasswordReset(email.trim());
      setSent(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The link could not be sent.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Title>Reset your password</Title>
      {sent ? (
        <Notice tone="success">
          If {email.trim()} has an account, we sent it a link. It opens the website, where you set a
          new password; then sign in here.
        </Notice>
      ) : (
        <>
          <Body muted>We'll email you a link to set a new password.</Body>
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
          <Button
            title="Send link"
            busy={busy}
            disabled={!authClient.configured || !email}
            onPress={send}
          />
        </>
      )}
      <TextLink title="Back to sign in" onPress={() => router.replace("/sign-in")} />
    </Screen>
  );
}
