import * as Linking from "expo-linking";
import { ArrowCircleUpIcon } from "phosphor-react-native/src/icons/ArrowCircleUp";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { AppState, StyleSheet, View } from "react-native";
import site from "@/config/site.json";
import { Body, Button, Heading, Screen } from "@/components/ui";
import { updates } from "@/lib/app-update";
import { radius, useColors } from "@/lib/theme";

/** What the versions the API serves call for, for the dashboard to say so: null until known. */
export const useUpdate = () => useSyncExternalStore(updates.subscribe, updates.current);

/**
 * Starts the app's update checks (lib/app-update.ts): when the app starts, when it comes back to
 * the foreground (at most every UPDATE_CHECK_INTERVAL), and whenever the API refuses this
 * version. Below the minimum, the app cannot continue and only offers the update. Before an
 * announced minimum's date, and below the latest, the dashboard says so.
 */
export function UpdateGate({ children }: { children: ReactNode }) {
  const colors = useColors();
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
        <View style={styles.message}>
          <View style={[styles.badge, { backgroundColor: colors.primaryTint }]}>
            <ArrowCircleUpIcon size={30} color={colors.accent} weight="duotone" />
          </View>
          <Heading title="Update required">
            This version of {site.name} is no longer supported. Install the latest version to
            continue.
          </Heading>
        </View>
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

const styles = StyleSheet.create({
  message: { flexGrow: 1, justifyContent: "center", gap: 18 },
  badge: {
    width: 56,
    height: 56,
    borderRadius: radius.xl,
    alignItems: "center",
    justifyContent: "center",
  },
});
