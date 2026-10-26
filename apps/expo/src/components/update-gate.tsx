import * as Linking from "expo-linking";
import { ArrowCircleDownIcon } from "phosphor-react-native/src/icons/ArrowCircleDown";
import { ArrowDownIcon } from "phosphor-react-native/src/icons/ArrowDown";
import { ClockIcon } from "phosphor-react-native/src/icons/Clock";
import { ShieldCheckIcon } from "phosphor-react-native/src/icons/ShieldCheck";
import { XIcon } from "phosphor-react-native/src/icons/X";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { AppState, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import site from "@/config/site.json";
import { Body, Button, Screen } from "@/components/ui";
import { installedVersion, updates } from "@/lib/app-update";
import { font, radius, type, useColors } from "@/lib/theme";

/** What the versions the API serves call for, for the dashboard to say so: null until known. */
export const useUpdate = () => useSyncExternalStore(updates.subscribe, updates.current);

const openUpdate = (url: string) => void Linking.openURL(url);

/**
 * Starts the app's update checks (lib/app-update.ts): when the app starts, when it comes back to
 * the foreground (at most every UPDATE_CHECK_INTERVAL), and whenever the API refuses this
 * version. Below the minimum, the app cannot continue and only offers the update. Before an
 * announced minimum's date, a dialog over any screen says when the app stops working; below the
 * latest, the dashboard shows a banner (UpdateBanner).
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
    return (
      <UpdateRequired
        minimumVersion={update.versions?.minimumVersion}
        updateUrl={update.versions?.updateUrl}
      />
    );
  }
  const deadline = update?.status === "upcoming" ? update.versions?.nextMinimumFrom : null;
  return (
    <>
      {children}
      {deadline ? (
        <UpdateDeadline deadline={deadline} updateUrl={update?.versions?.updateUrl} />
      ) : null}
    </>
  );
}

/** Below the minimum: the only screen the app shows, until it is updated. */
function UpdateRequired({
  minimumVersion,
  updateUrl,
}: {
  minimumVersion: string | null | undefined;
  updateUrl: string | null | undefined;
}) {
  const colors = useColors();
  // A block remembered offline has no versions until the API answers again.
  const rows: [string, string][] = [["Your version", installedVersion || "unknown"]];
  if (minimumVersion) rows.push(["Required", `${minimumVersion} or later`]);
  return (
    <Screen
      footer={
        updateUrl ? (
          <Button title="Update now" onPress={() => openUpdate(updateUrl)} />
        ) : (
          <Body muted>Update it from the App Store or Google Play.</Body>
        )
      }
    >
      <View style={styles.required}>
        <View style={[styles.requiredBadge, { backgroundColor: colors.primary }]}>
          <ArrowCircleDownIcon size={38} color={colors.onPrimary} weight="fill" />
        </View>
        <Text accessibilityRole="header" style={[styles.requiredTitle, { color: colors.text }]}>
          Update to continue
        </Text>
        <Text style={[styles.requiredBody, { color: colors.textSecondary }]}>
          This version of {site.name} can no longer connect.
        </Text>
        <View style={[styles.versions, { borderColor: colors.divider }]}>
          {rows.map(([label, value], index) => (
            <View
              key={label}
              style={[
                styles.versionRow,
                index > 0 && { borderTopWidth: 1, borderTopColor: colors.hairline },
              ]}
            >
              <Text style={[type.callout, { color: colors.textMuted }]}>{label}</Text>
              <Text style={[styles.versionValue, { color: colors.text }]}>{value}</Text>
            </View>
          ))}
        </View>
        <View style={styles.reassurance}>
          <ShieldCheckIcon size={20} color={colors.accent} weight="fill" />
          <Text style={[styles.reassuranceText, { color: colors.textSecondary }]}>
            Your account and your data are safe, and will be there after you update.
          </Text>
        </View>
      </View>
    </Screen>
  );
}

/**
 * Before an announced minimum's date: how many days this version has left. "Remind me
 * tomorrow" is the update checks' Not now, which brings it back the next day.
 */
function UpdateDeadline({
  deadline,
  updateUrl,
}: {
  deadline: string;
  updateUrl: string | null | undefined;
}) {
  const colors = useColors();
  const date = new Date(deadline);
  const day = date.toLocaleDateString(undefined, { month: "long", day: "numeric" });
  const daysLeft = Math.max(0, Math.ceil((date.getTime() - Date.now()) / 86_400_000));
  return (
    <Modal animationType="fade" onRequestClose={updates.notNow} statusBarTranslucent transparent>
      <View style={[styles.dialogScrim, { backgroundColor: colors.scrim }]}>
        <View
          accessibilityViewIsModal
          style={[styles.dialog, { backgroundColor: colors.background }]}
        >
          <View style={[styles.dialogBadge, { backgroundColor: colors.dangerTint }]}>
            <ClockIcon size={28} color={colors.danger} />
          </View>
          <View style={styles.dialogText}>
            <Text accessibilityRole="header" style={[styles.dialogTitle, { color: colors.text }]}>
              Update by {day}
            </Text>
            <Text style={[styles.dialogBody, { color: colors.textSecondary }]}>
              After {day}, version {installedVersion} can no longer connect.
            </Text>
          </View>
          <View style={[styles.daysLeft, { backgroundColor: colors.fill }]}>
            <Text style={[styles.daysLeftCount, { color: colors.text }]}>{daysLeft}</Text>
            <Text style={[styles.daysLeftText, { color: colors.textSecondary }]}>
              {daysLeft === 1 ? "day" : "days"} left. Your data stays as it is.
            </Text>
          </View>
          <View style={styles.dialogActions}>
            {updateUrl ? <Button title="Update now" onPress={() => openUpdate(updateUrl)} /> : null}
            <Pressable
              accessibilityRole="button"
              onPress={updates.notNow}
              style={({ pressed }) => [
                styles.remind,
                { backgroundColor: pressed ? colors.fill : "transparent" },
              ]}
            >
              <Text style={[type.headline, { color: colors.text }]}>Remind me tomorrow</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/**
 * Below the latest version: an update is out, inline where the dashboard puts it. Not now hides it
 * until a newer one is out. A dark capsule in both appearances, like the tab bar.
 */
export function UpdateBanner({
  version,
  updateUrl,
}: {
  version: string | null | undefined;
  updateUrl: string | null | undefined;
}) {
  const colors = useColors();
  return (
    <View accessibilityRole="summary" style={[styles.banner, { backgroundColor: colors.nav }]}>
      <View style={[styles.bannerBadge, { backgroundColor: colors.primary }]}>
        <ArrowDownIcon size={20} color={colors.onPrimary} weight="bold" />
      </View>
      <View style={styles.bannerText}>
        <Text style={[styles.bannerTitle, { color: colors.navActive }]}>Update available</Text>
        {version ? (
          <Text numberOfLines={1} style={[styles.bannerVersion, { color: colors.navInactive }]}>
            Version {version}
          </Text>
        ) : null}
      </View>
      {updateUrl ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => openUpdate(updateUrl)}
          style={({ pressed }) => [
            styles.bannerUpdate,
            { backgroundColor: colors.navActive, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Text style={[styles.bannerUpdateText, { color: colors.onNavActive }]}>Update</Text>
        </Pressable>
      ) : null}
      <Pressable
        accessibilityLabel="Not now"
        accessibilityRole="button"
        hitSlop={10}
        onPress={updates.notNow}
        style={styles.bannerClose}
      >
        <XIcon size={18} color={colors.navInactive} weight="bold" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  required: { paddingTop: 50, gap: 16 },
  requiredBadge: {
    width: 72,
    height: 72,
    borderRadius: radius.xl,
    alignItems: "center",
    justifyContent: "center",
  },
  requiredTitle: { ...type.title, marginTop: 12, letterSpacing: -0.8 },
  requiredBody: { fontFamily: font.regular, fontSize: 17, lineHeight: 25 },
  versions: { marginTop: 8, borderWidth: 1, borderRadius: radius.xl },
  versionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  versionValue: { fontFamily: font.semibold, fontSize: 15, fontVariant: ["tabular-nums"] },
  reassurance: { flexDirection: "row", gap: 12, paddingHorizontal: 2 },
  reassuranceText: { flex: 1, fontFamily: font.regular, fontSize: 14, lineHeight: 20 },
  dialogScrim: { flex: 1, justifyContent: "center", padding: 20 },
  dialog: { borderRadius: radius.hero, padding: 24, gap: 14 },
  dialogBadge: {
    width: 52,
    height: 52,
    borderRadius: radius.xl,
    alignItems: "center",
    justifyContent: "center",
  },
  dialogText: { gap: 6 },
  dialogTitle: { fontFamily: font.bold, fontSize: 22, letterSpacing: -0.3 },
  dialogBody: { fontFamily: font.regular, fontSize: 15, lineHeight: 22 },
  daysLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: radius.lg,
  },
  daysLeftCount: { fontFamily: font.bold, fontSize: 28, fontVariant: ["tabular-nums"] },
  daysLeftText: { flex: 1, fontFamily: font.regular, fontSize: 14 },
  dialogActions: { gap: 6 },
  remind: { height: 48, borderRadius: radius.lg, alignItems: "center", justifyContent: "center" },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: radius.card,
    paddingVertical: 14,
    paddingLeft: 14,
    paddingRight: 8,
  },
  bannerBadge: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  bannerText: { flex: 1, gap: 2 },
  bannerTitle: { fontFamily: font.semibold, fontSize: 15 },
  bannerVersion: { fontFamily: font.regular, fontSize: 13 },
  bannerUpdate: {
    height: 34,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    justifyContent: "center",
  },
  bannerUpdateText: { fontFamily: font.semibold, fontSize: 14 },
  bannerClose: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
});
