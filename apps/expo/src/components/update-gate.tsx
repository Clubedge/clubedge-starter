import * as Linking from "expo-linking";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { AppState } from "react-native";
import site from "@/config/site.json";
import { Body, Button, Screen, Title } from "@/components/ui";
import { updates } from "@/lib/app-update";

/** What the versions the API serves call for, for the dashboard to say so: null until known. */
export const useUpdate = () => useSyncExternalStore(updates.subscribe, updates.current);

/**
 * Starts the app's update checks (lib/app-update.ts): when the app starts, when it comes back to
 * the foreground (at most every UPDATE_CHECK_INTERVAL), and whenever the API refuses this
 * version. Below the minimum, the app cannot continue and only offers the update. Before an
 * announced minimum's date, and below the latest, the dashboard says so.
 */
export function UpdateGate({ children }: { children: ReactNode }) {
  const update = useUpdate();

  useEffect(() => {
    updates.start();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") updates.resume();
    });
    return () => subscription.remove();
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
  return <>{children}</>;
}
