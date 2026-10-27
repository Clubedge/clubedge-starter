// Notifications in the mobile app (push.ts), as a card of the web app's settings page: on or off
// for this device, and a test notification while they are on. The web app loads it only in its
// build for the app, so the website never shows it.
import { useEffect, useState } from "react";
import type { ApiClient } from "@clubedge/contract";
import { Button } from "@clubedge/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@clubedge/ui/components/card";
import { Label } from "@clubedge/ui/components/label";
import { Switch } from "@clubedge/ui/components/switch";
import { disablePush, enablePush, isPushEnabled, PushError, sendTestPush } from "./push";

export function PushSettings({ api }: { api: ApiClient }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "info" | "error"; text: string } | null>(null);

  useEffect(() => {
    void isPushEnabled().then(setEnabled);
  }, []);

  if (enabled === null) return null;

  // One action at a time; its outcome shows below the switch.
  async function run(action: () => Promise<string | null>) {
    setBusy(true);
    setMessage(null);
    try {
      const done = await action();
      if (done) setMessage({ tone: "info", text: done });
    } catch (error) {
      const text = error instanceof PushError ? error.message : "Something went wrong. Try again.";
      setMessage({ tone: "error", text });
    } finally {
      setBusy(false);
    }
  }

  const toggle = (on: boolean) =>
    run(async () => {
      await (on ? enablePush(api) : disablePush(api));
      setEnabled(on);
      return null;
    });

  const test = () =>
    run(async () => {
      const sent = await sendTestPush(api);
      return sent > 0
        ? `Sent to ${sent} ${sent === 1 ? "device" : "devices"}.`
        : "No device got it: check the server's push settings.";
    });

  return (
    <Card id="notifications">
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
        <CardDescription>Notifications from the app on this device.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="push-enabled">Get notifications</Label>
          <Switch
            checked={enabled}
            disabled={busy}
            id="push-enabled"
            onCheckedChange={(on) => void toggle(on)}
          />
        </div>
        {enabled && (
          <Button className="w-fit" disabled={busy} onClick={() => void test()} variant="outline">
            Send a test notification
          </Button>
        )}
        {message && (
          <p
            className={
              message.tone === "error"
                ? "text-sm text-destructive"
                : "text-sm text-muted-foreground"
            }
            role={message.tone === "error" ? "alert" : "status"}
          >
            {message.text}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
