import {
  UPDATE_CHECK_INTERVAL,
  checkForUpdate,
  rememberedUpdate,
  type AppUpdate,
} from "@clubedge/contract";
import * as Linking from "expo-linking";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import site from "@/config/site.json";
import { Body, Button, Screen, Title } from "@/components/ui";
import { api } from "@/lib/api";
import { installedVersion, onUpdateRequired, updateStorage } from "@/lib/app-update";

const UpdateContext = createContext<AppUpdate | null>(null);

/**
 * Asks the API which versions of the app it serves (GET /api/app-version) when the app starts,
 * when it comes back to the foreground (at most every UPDATE_CHECK_INTERVAL), and whenever the
 * API refuses this version. Below the minimum, the app cannot continue and only offers the
 * update. Before an announced minimum's date, and below the latest, the dashboard says so.
 * Offline, a block the API answered before holds, and anything else waits for the API.
 */
export function UpdateGate({ children }: { children: ReactNode }) {
  const [update, setUpdate] = useState<AppUpdate | null>(null);

  useEffect(() => {
    let active = true;
    let checkedAt = 0;
    const check = async () => {
      checkedAt = Date.now();
      const versions = () => api.GET("/api/app-version").then(({ data }) => data ?? null);
      const next = await checkForUpdate(installedVersion, versions, updateStorage);
      if (next && active) setUpdate(next);
    };

    void rememberedUpdate(installedVersion, updateStorage).then((remembered) => {
      if (remembered && active) setUpdate((current) => current ?? remembered);
    });
    void check();

    const stopListening = onUpdateRequired(() => {
      setUpdate((current) => ({ status: "required", versions: current?.versions ?? null }));
      void check();
    });
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active" && Date.now() - checkedAt >= UPDATE_CHECK_INTERVAL) void check();
    });
    return () => {
      active = false;
      stopListening();
      subscription.remove();
    };
  }, []);

  if (update?.status === "required") {
    const updateUrl = update.versions?.updateUrl;
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
  return <UpdateContext.Provider value={update}>{children}</UpdateContext.Provider>;
}

/** What the versions the API serves call for, for the dashboard to say so: null until known. */
export const useUpdate = () => useContext(UpdateContext);
