import { useEffect, useState } from "react";
import type { AppVersion } from "@clubedge/contract";
import { Button, buttonVariants } from "@clubedge/ui/components/button";
import { showAbovePage } from "./above-page";
import { appVersion } from "./index";
import { updateFor } from "./version";

type Update = { kind: "required" | "available"; url: string | null };

/**
 * What the user sees when the API serves newer versions of the app: below the minimum, a screen
 * that keeps the app closed until it is updated; below the latest, a notice they can dismiss.
 * The update opens in the system browser: the app's WebView opens other sites there.
 */
export function UpdateScreen({ update, onDismiss }: { update: Update; onDismiss: () => void }) {
  const link = update.url && (
    <a className={buttonVariants()} href={update.url} target="_blank" rel="noreferrer">
      Update
    </a>
  );
  if (update.kind === "required") {
    return (
      <div
        aria-labelledby="update-required"
        aria-modal="true"
        className="fixed inset-0 z-60 grid place-items-center bg-background px-6 text-center"
        role="alertdialog"
      >
        <div className="grid max-w-sm justify-items-center gap-4">
          <h1 className="text-2xl font-semibold tracking-tight" id="update-required">
            Update required
          </h1>
          <p className="text-sm text-muted-foreground">
            This version of the app is no longer supported. Update it to continue.
            {!update.url && " Get the update where you installed the app."}
          </p>
          {link}
        </div>
      </div>
    );
  }
  return (
    <div
      className="flex items-center justify-between gap-3 border-b bg-muted px-4 py-2 text-sm"
      role="status"
    >
      <span>A new version of the app is available.</span>
      <span className="flex shrink-0 items-center gap-1">
        {link}
        <Button onClick={onDismiss} size="sm" variant="ghost">
          Not now
        </Button>
      </span>
    </div>
  );
}

/**
 * Compares the installed app's version with the versions the API serves, once, and shows what
 * that calls for. Nothing shows while either is unknown: offline, or an API from before
 * /api/app-version, the app keeps working.
 */
export function UpdateNotice({ versions }: { versions: () => Promise<AppVersion | null> }) {
  const [update, setUpdate] = useState<Update | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([appVersion(), versions()])
      .then(([installed, served]) => {
        const kind = updateFor(installed, served);
        if (active && kind) setUpdate({ kind, url: served?.updateUrl ?? null });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [versions]);

  return update && <UpdateScreen onDismiss={() => setUpdate(null)} update={update} />;
}

/**
 * Starts the check above the app's page. `versions` asks the API for GET /api/app-version, and
 * answers null when it cannot tell.
 */
export function showUpdateNotice(versions: () => Promise<AppVersion | null>) {
  showAbovePage(<UpdateNotice versions={versions} />);
}
