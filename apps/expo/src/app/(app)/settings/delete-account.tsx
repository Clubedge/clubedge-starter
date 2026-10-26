import { useState } from "react";
import { Alert } from "react-native";
import { Button, Field, Heading, Notice, Screen } from "@/components/ui";
import { useAccount, useAccountAction, type Message } from "@/lib/account";
import { api } from "@/lib/api";
import { authClient } from "@/lib/auth";
import { useSession } from "@/lib/session";

/** Deleting the account and its data, which the API does once it has checked the password. */
export default function DeleteAccount() {
  const { setSignedIn } = useSession();
  const account = useAccount();
  const [password, setPassword] = useState("");
  const { busy, message, run } = useAccountAction();

  const deleteAccount = async (): Promise<Message | null> => {
    const { response, error } = await api.POST("/api/account/delete", { body: { password } });
    if (response.status === 204) {
      await authClient.signOut();
      setSignedIn(false);
      return null;
    }
    const text: Record<string, string> = {
      invalid_password: "The password is not correct.",
      active_subscription: "Cancel your subscription on the website first.",
    };
    return {
      tone: "error",
      text:
        (error && text[error.error.code]) ||
        (response.status === 429
          ? "Too many attempts. Wait a minute, then try again."
          : "The account could not be deleted."),
    };
  };

  const confirmDeletion = () =>
    Alert.alert("Delete your account?", "This deletes your account and its data for good.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => void run(deleteAccount) },
    ]);

  if (account && !account.canDeleteAccount) {
    return (
      <Screen back>
        <Heading title="Delete account">
          Deleting accounts is not set up on this server yet.
        </Heading>
      </Screen>
    );
  }

  return (
    <Screen back>
      <Heading title="Delete account">
        Enter your password to delete your account and its data.
      </Heading>
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      <Field
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
      />
      <Button
        title="Delete account"
        variant="danger"
        busy={busy}
        disabled={!password}
        onPress={confirmDeletion}
      />
    </Screen>
  );
}
