import * as Linking from "expo-linking"; // clubedge:only framework=none
import { router } from "expo-router";
import { useState } from "react";
import { Button, Field, Heading, Notice, Screen } from "@/components/ui";
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
      await authClient.requestPasswordReset({
        email: email.trim(),
        // The emailed link opens this app's reset screen once it has been checked. // clubedge:only framework=none
        redirectTo: Linking.createURL("/reset-password"), // clubedge:only framework=none
      });
      setSent(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The link could not be sent.");
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <Screen
        back
        footer={
          <Button
            title="Back to sign in"
            variant="secondary"
            onPress={() => router.dismissTo("/sign-in")}
          />
        }
      >
        <Heading title="Check your email" />
        {/* clubedge:if framework!=none */}
        <Notice tone="success">
          If {email.trim()} has an account, we sent it a link. It opens the website, where you set a
          new password; then sign in here.
        </Notice>
        {/* clubedge:end */}
        {/* clubedge:if framework=none */}
        <Notice tone="success">
          If {email.trim()} has an account, we sent it a link. Open it on this phone to set a new
          password.
        </Notice>
        {/* clubedge:end */}
      </Screen>
    );
  }

  return (
    <Screen back>
      <Heading title="Reset your password">We'll email you a link to set a new password.</Heading>
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
    </Screen>
  );
}
