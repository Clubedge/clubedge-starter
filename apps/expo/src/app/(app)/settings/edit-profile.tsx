import { useEffect, useState } from "react";
import { Button, Field, Heading, Notice, Screen } from "@/components/ui";
import { useAccount, useAccountAction } from "@/lib/account";
import { api } from "@/lib/api";

/** The display name, which the app keeps in its own database through the API. */
export default function EditProfile() {
  const account = useAccount();
  const [displayName, setDisplayName] = useState("");
  // Once the user types, the account answering again leaves their name as they wrote it.
  const [edited, setEdited] = useState(false);
  const { busy, message, run } = useAccountAction();

  useEffect(() => {
    if (account && !edited) setDisplayName(account.displayName ?? "");
  }, [account, edited]);

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
        onChangeText={(name) => {
          setEdited(true);
          setDisplayName(name);
        }}
        maxLength={80}
        autoComplete="name"
        textContentType="name"
      />
      {/* Until the account loads, the field is empty, and saving it would clear the name. */}
      <Button title="Save" busy={busy} disabled={!account} onPress={save} />
    </Screen>
  );
}
