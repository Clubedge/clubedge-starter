import type { Account } from "@clubedge/contract";
import { useEffect, useState } from "react";
import { Alert } from "react-native";
import { Body, Button, Card, Field, Notice, Screen } from "@/components/ui";
import { api } from "@/lib/api";
import { authClient } from "@/lib/auth";
import { AccountError } from "@/lib/auth-client";
import { useSession } from "@/lib/session";

type Message = { tone: "error" | "success"; text: string };

/** The words for an account action the provider or the API refused. */
function failure(error: unknown): Message {
  if (error instanceof AccountError) {
    const text = {
      "invalid-password": "The current password is not correct.",
      "invalid-input": "Choose a password of 8 to 128 characters, different from the current one.",
      "rate-limited": "Too many attempts. Wait a minute, then try again.",
    }[error.code];
    return { tone: "error", text };
  }
  return { tone: "error", text: error instanceof Error ? error.message : "Something went wrong." };
}

export default function Settings() {
  const { setSignedIn } = useSession();
  const [account, setAccount] = useState<Account | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [deletionPassword, setDeletionPassword] = useState("");
  const [busy, setBusy] = useState<"profile" | "password" | "delete" | "sign-out" | null>(null);
  const [message, setMessage] = useState<Message | null>(null);

  useEffect(() => {
    void api.GET("/api/account").then(({ data }) => {
      if (!data) return;
      setAccount(data);
      setDisplayName(data.displayName ?? "");
    });
  }, []);

  const run = async (action: NonNullable<typeof busy>, work: () => Promise<Message | null>) => {
    setBusy(action);
    setMessage(null);
    try {
      setMessage(await work());
    } catch (error) {
      setMessage(failure(error));
    } finally {
      setBusy(null);
    }
  };

  const saveProfile = () =>
    run("profile", async () => {
      const { response } = await api.POST("/api/account/profile", { body: { displayName } });
      if (!response.ok) return { tone: "error", text: "The name could not be saved." };
      return { tone: "success", text: "Saved." };
    });

  const changePassword = () =>
    run("password", async () => {
      await authClient.changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      return { tone: "success", text: "Password changed. Your other devices are signed out." };
    });

  const signOut = () =>
    run("sign-out", async () => {
      await authClient.signOut();
      setSignedIn(false);
      return null;
    });

  const deleteAccount = async () => {
    const { response, error } = await api.POST("/api/account/delete", {
      body: { password: deletionPassword },
    });
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
      tone: "error" as const,
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
      { text: "Delete", style: "destructive", onPress: () => void run("delete", deleteAccount) },
    ]);

  return (
    <Screen header>
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      <Card title="Profile">
        <Body muted>{account?.email ?? "Loading…"}</Body>
        <Field
          label="Display name"
          value={displayName}
          onChangeText={setDisplayName}
          maxLength={80}
          autoComplete="name"
        />
        <Button title="Save" busy={busy === "profile"} onPress={saveProfile} />
      </Card>
      <Card title="Password">
        <Field
          label="Current password"
          value={currentPassword}
          onChangeText={setCurrentPassword}
          secureTextEntry
          autoComplete="current-password"
        />
        <Field
          label="New password"
          value={newPassword}
          onChangeText={setNewPassword}
          secureTextEntry
          autoComplete="new-password"
        />
        <Button
          title="Change password"
          busy={busy === "password"}
          disabled={!currentPassword || newPassword.length < 8}
          onPress={changePassword}
        />
      </Card>
      <Button title="Sign out" variant="secondary" busy={busy === "sign-out"} onPress={signOut} />
      <Card title="Delete account">
        {account && !account.canDeleteAccount ? (
          <Body muted>Deleting accounts is not set up on this server yet.</Body>
        ) : (
          <>
            <Body muted>Enter your password to delete your account and its data.</Body>
            <Field
              label="Password"
              value={deletionPassword}
              onChangeText={setDeletionPassword}
              secureTextEntry
              autoComplete="current-password"
            />
            <Button
              title="Delete account"
              variant="danger"
              busy={busy === "delete"}
              disabled={!deletionPassword}
              onPress={confirmDeletion}
            />
          </>
        )}
      </Card>
    </Screen>
  );
}
