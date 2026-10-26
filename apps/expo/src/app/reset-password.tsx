import * as Linking from "expo-linking";
import { router } from "expo-router";
import { useState } from "react";
import { Body, Button, Field, Notice, Screen, TextLink, Title } from "@/components/ui";
import { authClient } from "@/lib/auth";
import { AccountError } from "@/lib/auth-client";
import { useSession } from "@/lib/session";

/** The words for a reset the provider refused. */
function failureMessage(failure: unknown): string {
  if (failure instanceof AccountError) {
    return {
      "invalid-password": "The password could not be reset.",
      "invalid-input": "Choose a password of 8 to 128 characters, different from your current one.",
      "rate-limited": "Too many attempts. Wait a minute, then try again.",
    }[failure.code];
  }
  return failure instanceof Error ? failure.message : "The password could not be reset.";
}

/**
 * The emailed reset link opens this screen through the app's address scheme, once the server has
 * checked it: the new password is set with what the link carries.
 */
export default function ResetPassword() {
  const link = Linking.useURL();
  const { setSignedIn } = useSession();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const reset = async () => {
    if (!link) return;
    setBusy(true);
    setError(null);
    try {
      const { signedIn } = await authClient.resetPassword(link, password);
      setDone(true);
      if (signedIn) setSignedIn(true);
    } catch (failure) {
      setError(failureMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <Screen>
        <Title>Password changed</Title>
        <Notice tone="success">Your new password is set.</Notice>
        <TextLink title="Continue" onPress={() => router.replace("/")} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Title>Set a new password</Title>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Field
        label="New password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
      />
      <Body muted>At least 8 characters.</Body>
      <Button
        title="Set password"
        busy={busy}
        disabled={!link || password.length < 8}
        onPress={reset}
      />
      <TextLink title="Back to sign in" onPress={() => router.replace("/sign-in")} />
    </Screen>
  );
}
