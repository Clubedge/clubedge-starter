import { useState } from "react";
import { Button, Field, Heading, Notice, Requirement, Screen } from "@/components/ui";
import { useAccountAction } from "@/lib/account";
import { authClient } from "@/lib/auth";

/** A new password, set with the sign-in provider, which signs out the user's other devices. */
export default function Password() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const { busy, message, run } = useAccountAction();

  const changePassword = () =>
    run(async () => {
      await authClient.changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      return { tone: "success", text: "Password changed. Your other devices are signed out." };
    });

  return (
    <Screen back>
      <Heading title="Change password">Enter your current password, then the new one.</Heading>
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      <Field
        label="Current password"
        value={currentPassword}
        onChangeText={setCurrentPassword}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
      />
      <Field
        label="New password"
        value={newPassword}
        onChangeText={setNewPassword}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
      />
      <Requirement met={newPassword.length >= 8}>At least 8 characters</Requirement>
      <Button
        title="Change password"
        busy={busy}
        disabled={!currentPassword || newPassword.length < 8}
        onPress={changePassword}
      />
    </Screen>
  );
}
