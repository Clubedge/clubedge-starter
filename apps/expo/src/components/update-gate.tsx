import type { AppVersion } from "@clubedge/contract";
import * as Linking from "expo-linking";
import type { Icon } from "phosphor-react-native";
import { ArrowCircleDownIcon } from "phosphor-react-native/src/icons/ArrowCircleDown";
import { ArrowDownIcon } from "phosphor-react-native/src/icons/ArrowDown";
import { ClockIcon } from "phosphor-react-native/src/icons/Clock";
import { ShieldCheckIcon } from "phosphor-react-native/src/icons/ShieldCheck";
import { XIcon } from "phosphor-react-native/src/icons/X";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { AppState, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import site from "@/config/site.json";
import { Body, Button, Screen } from "@/components/ui";
import { installedVersion, updates } from "@/lib/app-update";
import { checkForOtaUpdate } from "@/lib/ota"; // clubedge:only ota=eas
import { font, radius, type, useColors } from "@/lib/theme";

/** What the versions the API serves call for, for the dashboard to say so: null until known. */
export const useUpdate = () => useSyncExternalStore(updates.subscribe, updates.current);

const openUpdate = (url: string) => void Linking.openURL(url);

/**
 * Starts the app's update checks (lib/app-update.ts): when the app starts, when it comes back to
 * the foreground (at most every UPDATE_CHECK_INTERVAL), and whenever the API refuses this
 * version. Below the minimum, the app cannot continue and only offers the update. Before an
 * announced minimum's date, a sheet over any screen says when the app stops working; below the
 * latest, the dashboard shows a banner (UpdateBanner).
 */
export function UpdateGate({ children }: { children: ReactNode }) {
  const update = useUpdate();

  useEffect(() => {
    updates.start();
    void checkForOtaUpdate(); // clubedge:only ota=eas
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      updates.resume();
      void checkForOtaUpdate(); // clubedge:only ota=eas
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
  const versions = update?.status === "upcoming" ? update.versions : null;
  return (
    <>
      {children}
      {versions?.nextMinimumFrom ? (
        <UpdateSheet versions={versions} deadline={versions.nextMinimumFrom} />
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
 * Before an announced minimum's date: a sheet from the bottom with the version to install, when
 * this one stops working, and the update. Not now is the update checks' own, which brings it back
 * the next day.
 */
function UpdateSheet({ versions, deadline }: { versions: AppVersion; deadline: string }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const date = new Date(deadline);
  const day = date.toLocaleDateString(undefined, { month: "long", day: "numeric" });
  const daysLeft = Math.max(0, Math.ceil((date.getTime() - Date.now()) / 86_400_000));
  const version = versions.latestVersion ?? versions.nextMinimumVersion;
  const updateUrl = versions.updateUrl;
  const points: { icon: Icon; title: string; body: string }[] = [
    {
      icon: ClockIcon,
      title: `Update by ${day}`,
      body: `${daysLeft} ${daysLeft === 1 ? "day" : "days"} left. After that, version ${installedVersion} can no longer connect.`,
    },
    {
      icon: ShieldCheckIcon,
      title: "Your data stays as it is",
      body: "Your account and everything in it will be there after you update.",
    },
  ];
  return (
    <Modal
      animationType="slide"
      navigationBarTranslucent
      onRequestClose={updates.notNow}
      statusBarTranslucent
      transparent
    >
      {/* The scrim fills the screen, behind the sheet too, so its rounded corners show. */}
      <Pressable
        accessibilityLabel="Not now"
        onPress={updates.notNow}
        style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }]}
      />
      <View style={styles.sheetAbove} />
      <View
        style={[
          styles.sheet,
          { backgroundColor: colors.background, paddingBottom: insets.bottom + 16 },
        ]}
      >
        <View style={[styles.grabber, { backgroundColor: colors.border }]} />
        <View style={styles.sheetHeader}>
          <View style={[styles.sheetBadge, { backgroundColor: colors.primary }]}>
            <ArrowCircleDownIcon size={30} color={colors.onPrimary} weight="fill" />
          </View>
          <View style={styles.sheetTitles}>
            <Text accessibilityRole="header" style={[styles.sheetTitle, { color: colors.text }]}>
              {version ? `${site.shortName} ${version}` : site.shortName}
            </Text>
            {installedVersion ? (
              <Text style={[styles.sheetSubtitle, { color: colors.textMuted }]}>
                You have {installedVersion}
              </Text>
            ) : null}
          </View>
        </View>
        <Text style={[styles.sheetLabel, { color: colors.textMuted }]}>WHAT TO KNOW</Text>
        {points.map(({ icon: PointIcon, title, body }) => (
          <View key={title} style={styles.point}>
            <View style={[styles.pointBadge, { backgroundColor: colors.primaryTint }]}>
              <PointIcon size={22} color={colors.accent} weight="fill" />
            </View>
            <View style={styles.pointText}>
              <Text style={[styles.pointTitle, { color: colors.text }]}>{title}</Text>
              <Text style={[styles.pointBody, { color: colors.textSecondary }]}>{body}</Text>
            </View>
          </View>
        ))}
        <View style={styles.sheetActions}>
          {updateUrl ? <Button title="Update now" onPress={() => openUpdate(updateUrl)} /> : null}
          <Pressable
            accessibilityRole="button"
            onPress={updates.notNow}
            style={({ pressed }) => [
              styles.later,
              { backgroundColor: pressed ? colors.fill : "transparent" },
            ]}
          >
            <Text style={[type.headline, { color: colors.text }]}>Not now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

/**
 * Below the latest version: an update is out, inline where the dashboard puts it. Not now hides it
 * until a newer one is out. The brand's light blue, like the notices on the dashboard.
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
    <View
      accessibilityRole="summary"
      style={[styles.banner, { backgroundColor: colors.primaryTint }]}
    >
      <View style={[styles.bannerBadge, { backgroundColor: colors.primary }]}>
        <ArrowDownIcon size={20} color={colors.onPrimary} weight="bold" />
      </View>
      <View style={styles.bannerText}>
        <Text style={[styles.bannerTitle, { color: colors.onPrimaryTint }]}>Update available</Text>
        {version ? (
          <Text numberOfLines={1} style={[styles.bannerVersion, { color: colors.onPrimaryTint }]}>
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
            { backgroundColor: pressed ? colors.primaryPressed : colors.primary },
          ]}
        >
          <Text style={[styles.bannerUpdateText, { color: colors.onPrimary }]}>Update</Text>
        </Pressable>
      ) : null}
      <Pressable
        accessibilityLabel="Not now"
        accessibilityRole="button"
        hitSlop={10}
        onPress={updates.notNow}
        style={styles.bannerClose}
      >
        <XIcon size={18} color={colors.onPrimaryTint} weight="bold" />
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
  // The sheet: the design's UpdateSheet.
  sheetAbove: { flex: 1, pointerEvents: "none" },
  sheet: {
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: 24,
    paddingTop: 10,
    gap: 14,
  },
  grabber: { alignSelf: "center", width: 36, height: 5, borderRadius: 3, marginBottom: 6 },
  sheetHeader: { flexDirection: "row", alignItems: "center", gap: 14 },
  sheetBadge: {
    width: 56,
    height: 56,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetTitles: { flex: 1, gap: 2 },
  sheetTitle: { fontFamily: font.bold, fontSize: 20 },
  sheetSubtitle: { fontFamily: font.regular, fontSize: 14 },
  sheetLabel: { fontFamily: font.semibold, fontSize: 13, marginTop: 4 },
  point: { flexDirection: "row", gap: 14 },
  pointBadge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  pointText: { flex: 1, gap: 2 },
  pointTitle: { fontFamily: font.semibold, fontSize: 16 },
  pointBody: { fontFamily: font.regular, fontSize: 14, lineHeight: 20 },
  sheetActions: { gap: 6, marginTop: 8 },
  later: { height: 48, borderRadius: radius.lg, alignItems: "center", justifyContent: "center" },
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
  bannerVersion: { fontFamily: font.regular, fontSize: 13, opacity: 0.8 },
  bannerUpdate: {
    height: 34,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    justifyContent: "center",
  },
  bannerUpdateText: { fontFamily: font.semibold, fontSize: 14 },
  bannerClose: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
});
