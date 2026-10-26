import * as Linking from "expo-linking"; // clubedge:only framework=none
import { router } from "expo-router";
import { useState } from "react";
import site from "@/config/site.json";
import {
  Button,
  Field,
  Heading,
  LegalLink,
  LegalNote,
  Notice,
  Requirement,
  Screen,
} from "@/components/ui";
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
      const { needsConfirmation } = await authClient.signUp({
        email: email.trim(),
        password,
        // The emailed link opens this app's sign-in once it has confirmed the address. // clubedge:only framework=none
        redirectTo: Linking.createURL("/sign-in"), // clubedge:only framework=none
      });
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
      <Screen
        back
        footer={
          <Button
            title="Back to sign in"
            variant="secondary"
            onPress={() => router.replace("/sign-in")}
          />
        }
      >
        <Heading title="Check your email" />
        <Notice tone="success">
          We sent a link to {email.trim()}. Open it to confirm your address, then sign in here.
        </Notice>
      </Screen>
    );
  }

  return (
    <Screen
      back
      footer={
        <>
          <Button
            title="Create account"
            busy={busy}
            disabled={!authClient.configured || !email || password.length < 8}
            onPress={signUp}
          />
          <LegalNote>
            By creating an account, you agree to our{" "}
            <LegalLink title="Terms" url={site.links.terms} /> and acknowledge our{" "}
            <LegalLink title="Privacy Policy" url={site.links.privacy} />.
          </LegalNote>
        </>
      }
    >
      <Heading title="Create your account" />
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
      <Requirement met={password.length >= 8}>At least 8 characters</Requirement>
    </Screen>
  );
}
