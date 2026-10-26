import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { useEffect, useState } from "react";
import {
  UPDATE_CHECK_INTERVAL,
  appPlatform,
  appVersionMiddleware,
  checkForUpdate,
  dismiss,
  isDismissed,
  rememberedUpdate,
  type ApiClient,
  type AppUpdate,
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

/** The API's refusals of this app's version (426 update_required), from any request. */
const refusals = new EventTarget();

/**
 * Shows what the versions the API serves call for, from a check when the app starts, on each
 * return to it (at most every UPDATE_CHECK_INTERVAL), and whenever the API refuses this version.
 * Offline, a block the API answered before holds, and anything else waits for the API.
 */
export function UpdateNotice({ api }: { api: ApiClient }) {
  const [update, setUpdate] = useState<AppUpdate | null>(null);

  useEffect(() => {
    let active = true;
    let checkedAt = 0;
    const check = async () => {
      checkedAt = Date.now();
      const installed = await appVersion();
      const versions = () => api.GET("/api/app-version").then(({ data }) => data ?? null);
      const next = await checkForUpdate(installed, versions, storage);
      if (next && active) setUpdate((await isDismissed(next, storage)) ? null : next);
    };

    void appVersion()
      .then((installed) => rememberedUpdate(installed, storage))
      .then((remembered) => {
        if (remembered && active) setUpdate((current) => current ?? remembered);
      });
    void check();

    const refused = () => {
      setUpdate((current) => ({ status: "required", versions: current?.versions ?? null }));
      void check();
    };
    refusals.addEventListener("refused", refused);
    const resumed = App.addListener("resume", () => {
      if (Date.now() - checkedAt >= UPDATE_CHECK_INTERVAL) void check();
    });
    return () => {
      active = false;
      refusals.removeEventListener("refused", refused);
      void resumed.then((listener) => listener.remove());
    };
  }, [api]);

  if (!update || update.status === "current") return null;
  const dismissed = () => {
    void dismiss(update, storage);
    setUpdate(null);
  };
  return <UpdateScreen onDismiss={dismissed} update={update} />;
}

/**
 * Starts the checks above the app's page, and has each of `api`'s requests from then on say
 * which version and platform the app is, so the API can refuse one it no longer serves. Requests
 * the app made before carry neither: the check it starts covers them.
 */
export function showUpdateNotice(api: ApiClient) {
  const installed = appVersion();
  api.use(
    appVersionMiddleware({
      version: () => installed,
      platform: appPlatform(Capacitor.getPlatform()),
      onRefused: () => refusals.dispatchEvent(new Event("refused")),
    }),
  );
  showAbovePage(<UpdateNotice api={api} />);
}
