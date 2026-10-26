import * as Linking from "expo-linking";
import { router } from "expo-router";
import { useState } from "react";
import { Button, Field, Heading, Notice, Requirement, Screen } from "@/components/ui";
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
      <Screen footer={<Button title="Continue" onPress={() => router.replace("/")} />}>
        <Heading title="Password changed" />
        <Notice tone="success">Your new password is set.</Notice>
      </Screen>
    );
  }

  return (
    <Screen back>
      <Heading title="Set a new password" />
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Field
        label="New password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
      />
      <Requirement met={password.length >= 8}>At least 8 characters</Requirement>
      <Button
        title="Set password"
        busy={busy}
        disabled={!link || password.length < 8}
        onPress={reset}
      />
    </Screen>
  );
}
