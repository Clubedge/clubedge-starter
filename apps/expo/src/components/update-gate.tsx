import type { AppVersion } from "@clubedge/contract";
import * as Application from "expo-application";
import * as Linking from "expo-linking";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import site from "@/config/site.json";
import { Body, Button, Screen, Title } from "@/components/ui";
import { api } from "@/lib/api";
import { updateFor } from "@/lib/update";

/** The version the stores show, from app.config.ts: what the API's versions are compared with. */
export const installedVersion = Application.nativeApplicationVersion ?? "";

const UpdateContext = createContext<{ update: "available" | null; updateUrl: string | null }>({
  update: null,
  updateUrl: null,
});

/**
 * Asks the API which versions of the app it serves (GET /api/app-version) when the app starts.
 * Below the minimum, the app cannot continue and only offers the update. Below the latest, the
 * dashboard says one is available. Without an answer, as offline, the app carries on.
 */
export function UpdateGate({ children }: { children: ReactNode }) {
  const [versions, setVersions] = useState<AppVersion | null>(null);
  useEffect(() => {
    api.GET("/api/app-version").then(
      ({ data }) => setVersions(data ?? null),
      () => setVersions(null),
    );
  }, []);

  const update = updateFor(installedVersion, versions);
  const updateUrl = versions?.updateUrl ?? null;
  if (update === "required") {
    return (
      <Screen>
        <Title>Update required</Title>
        <Body>
          This version of {site.name} is no longer supported. Install the latest version to
          continue.
        </Body>
        {updateUrl ? (
          <Button title="Update" onPress={() => void Linking.openURL(updateUrl)} />
        ) : (
          <Body muted>Update it from the App Store or Google Play.</Body>
        )}
      </Screen>
    );
  }
  return <UpdateContext.Provider value={{ update, updateUrl }}>{children}</UpdateContext.Provider>;
}

/** Whether a newer version is available, for the dashboard to say so. */
export const useUpdate = () => useContext(UpdateContext);
