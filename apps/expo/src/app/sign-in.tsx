import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import site from "@/config/site.json";
import { Button, Field, Heading, LinkPrompt, Notice, Screen, TextLink } from "@/components/ui";
import { authClient } from "@/lib/auth";
import { useSession } from "@/lib/session";

export default function SignIn() {
  const { setSignedIn } = useSession();
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
      setSignedIn(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Sign in failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      back
      footer={
        <LinkPrompt
          text={`New to ${site.shortName}?`}
          link="Create account"
          onPress={() => router.replace("/sign-up")}
        />
      }
    >
      <Heading title="Welcome back">Sign in to your {site.shortName} account.</Heading>
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
      <View style={styles.forgot}>
        <TextLink title="Forgot password?" onPress={() => router.push("/forgot-password")} />
      </View>
      <View style={styles.submit}>
        <Button
          title="Sign in"
          busy={busy}
          disabled={!authClient.configured || !email || !password}
          onPress={signIn}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  forgot: { alignSelf: "flex-end", paddingHorizontal: 4, paddingTop: 4 },
  submit: { marginTop: 12 },
});
