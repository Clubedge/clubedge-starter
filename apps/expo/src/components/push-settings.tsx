import { BellIcon } from "phosphor-react-native/src/icons/Bell";
import { PaperPlaneTiltIcon } from "phosphor-react-native/src/icons/PaperPlaneTilt";
import { useState } from "react";
import { ListRow, Notice } from "@/components/ui";
import { disablePush, enablePush, PushError, sendTestPush, usePushEnabled } from "@/lib/push";

/** Notifications on this device, on or off, and a test notification while they are on. */
export function PushSettings() {
  const enabled = usePushEnabled();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  // One action at a time; its outcome shows below the rows.
  const run = async (action: () => Promise<string | null>) => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const done = await action();
      if (done) setMessage({ tone: "success", text: done });
    } catch (error) {
      const text = error instanceof PushError ? error.message : "Something went wrong. Try again.";
      setMessage({ tone: "error", text });
    } finally {
      setBusy(false);
    }
  };

  const toggle = (on: boolean) =>
    run(async () => {
      await (on ? enablePush() : disablePush());
      return null;
    });

  const test = () =>
    run(async () => {
      const sent = await sendTestPush();
      return sent > 0
        ? `Sent to ${sent} ${sent === 1 ? "device" : "devices"}.`
        : "No device got it: check the server's push settings.";
    });

  return (
    <>
      <ListRow
        icon={BellIcon}
        label="Notifications"
        toggle={{ value: enabled, onChange: toggle }}
      />
      {enabled ? (
        <ListRow icon={PaperPlaneTiltIcon} label="Send a test notification" onPress={test} />
      ) : null}
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
    </>
  );
}
