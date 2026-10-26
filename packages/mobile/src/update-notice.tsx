import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { useSyncExternalStore } from "react";
import {
  appPlatform,
  appVersionMiddleware,
  createUpdateChecks,
  type ApiClient,
  type AppUpdate,
  type UpdateChecks,
} from "@clubedge/contract";
import { Button, buttonVariants } from "@clubedge/ui/components/button";
import { showAbovePage } from "./above-page";
import { appVersion, storage } from "./index";

/**
 * What the user sees for an update (packages/contract, app-update.ts): below the minimum, a screen
 * that keeps the app closed until it is updated; before an announced minimum's date, and below the
 * latest, a notice they can dismiss. The update opens in the system browser: the app's WebView
 * opens other sites there.
 */
export function UpdateScreen({ update, onDismiss }: { update: AppUpdate; onDismiss: () => void }) {
  const url = update.versions?.updateUrl;
  const link = url && (
    <a className={buttonVariants()} href={url} target="_blank" rel="noreferrer">
      Update
    </a>
  );
  if (update.status === "required") {
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
            {!url && " Get the update where you installed the app."}
          </p>
          {link}
        </div>
      </div>
    );
  }
  const from = update.status === "upcoming" ? update.versions?.nextMinimumFrom : null;
  return (
    <div
      className="flex items-center justify-between gap-3 border-b bg-muted px-4 py-2 text-sm"
      role="status"
    >
      <span>
        {from
          ? `This version of the app stops working on ${new Date(from).toLocaleDateString(undefined, { dateStyle: "long" })}. Update it before then.`
          : "A new version of the app is available."}
      </span>
      <span className="flex shrink-0 items-center gap-1">
        {link}
        <Button onClick={onDismiss} size="sm" variant="ghost">
          Not now
        </Button>
      </span>
    </div>
  );
}

/** Draws what the app's update checks (packages/contract, app-update.ts) call for. */
export function UpdateNotice({ updates }: { updates: UpdateChecks }) {
  const update = useSyncExternalStore(updates.subscribe, updates.current);
  if (!update || update.status === "current") return null;
  return <UpdateScreen onDismiss={updates.notNow} update={update} />;
}

/**
 * Starts the app's update checks above its page: when the app starts, on each return to it, and
 * whenever the API refuses this version. Each of `api`'s requests from then on says which version
 * and platform the app is, so the API can refuse one it no longer serves; requests the app made
 * before carry neither, and the check it starts covers them.
 */
export function showUpdateNotice(api: ApiClient) {
  // A device that can't say its version still reaches the API, without the version.
  const installed = appVersion().catch(() => "");
  const updates = createUpdateChecks({
    installed,
    versions: async () => (await api.GET("/api/app-version")).data ?? null,
    storage,
  });
  api.use(
    appVersionMiddleware({
      version: () => installed,
      platform: appPlatform(Capacitor.getPlatform()),
      onRefused: updates.refused,
    }),
  );
  void App.addListener("resume", updates.resume);
  updates.start();
  showAbovePage(<UpdateNotice updates={updates} />);
}
