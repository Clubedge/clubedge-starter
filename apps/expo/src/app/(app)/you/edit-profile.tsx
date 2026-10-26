import { useEffect, useState } from "react";
import { Button, Field, Heading, Notice, Screen } from "@/components/ui";
import { useAccount, useAccountAction } from "@/lib/account";
import { api } from "@/lib/api";

/** The display name, which the app keeps in its own database through the API. */
export default function EditProfile() {
  const account = useAccount();
  const [displayName, setDisplayName] = useState("");
  const { busy, message, run } = useAccountAction();

  useEffect(() => {
    if (account) setDisplayName(account.displayName ?? "");
  }, [account]);

  const save = () =>
    run(async () => {
      const { response } = await api.POST("/api/account/profile", { body: { displayName } });
      if (!response.ok) return { tone: "error", text: "The name could not be saved." };
      return { tone: "success", text: "Saved." };
    });

  return (
    <Screen back>
      <Heading title="Edit profile">{account?.email ?? "Loading…"}</Heading>
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      <Field
        label="Display name"
        value={displayName}
        onChangeText={setDisplayName}
        maxLength={80}
        autoComplete="name"
        textContentType="name"
      />
      <Button title="Save" busy={busy} onPress={save} />
    </Screen>
  );
}
