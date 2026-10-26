import type { Health, User } from "@clubedge/contract";
import * as Linking from "expo-linking";
import type { Icon } from "phosphor-react-native";
import { ArrowCircleUpIcon } from "phosphor-react-native/src/icons/ArrowCircleUp";
import { DeviceMobileIcon } from "phosphor-react-native/src/icons/DeviceMobile";
import { PulseIcon } from "phosphor-react-native/src/icons/Pulse";
import { UserCircleIcon } from "phosphor-react-native/src/icons/UserCircle";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { RefreshControl, StyleSheet, Text, View } from "react-native";
import site from "@/config/site.json";
import { Avatar, Mark, PillButton, Screen } from "@/components/ui";
import { useUpdate } from "@/components/update-gate";
import { api } from "@/lib/api";
import { installedVersion, updates } from "@/lib/app-update";
import { authEnabled } from "@/lib/auth-enabled";
import { apiUrl } from "@/lib/config";
import { font, radius, type, useColors } from "@/lib/theme";

type Overview = { health: Health | null; user: User | null };

export default function Dashboard() {
  const colors = useColors();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const update = useUpdate();
  const updateUrl = update?.versions?.updateUrl;
  const deadline = update?.versions?.nextMinimumFrom;

  // The API's health and the signed-in user, from the API's contract (packages/contract).
  const load = useCallback(async () => {
    const [health, session] = await Promise.all([
      api.GET("/api/health").catch(() => null),
      api.GET("/api/session").catch(() => null),
    ]);
    setOverview({ health: health?.data ?? null, user: session?.data?.user ?? null });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const user = overview?.user;
  return (
    <Screen
      layout="dashboard"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
    >
      <View style={styles.header}>
        <Text accessibilityRole="header" style={[type.largeTitle, { color: colors.text }]}>
          Home
        </Text>
        {user ? <Avatar name={user.displayName || user.email} size={40} primary /> : null}
      </View>
      <View style={[styles.hero, { backgroundColor: colors.primary }]}>
        <View style={styles.heroText}>
          <Text style={[styles.greeting, { color: colors.onPrimary }]}>
            {user?.displayName ? `Welcome back, ${user.displayName}` : "Welcome to"}
          </Text>
          <Text style={[styles.heroTitle, { color: colors.onPrimary }]}>{site.name}</Text>
          <Text style={[styles.heroBody, { color: colors.onPrimary }]}>{site.description}</Text>
        </View>
        <View style={styles.heroBadge}>
          <Mark size={26} color={colors.onPrimary} />
        </View>
      </View>
      {update?.status === "upcoming" && deadline ? (
        <UpdateNotice title="Update required soon" updateUrl={updateUrl}>
          This version of the app stops working on{" "}
          {new Date(deadline).toLocaleDateString(undefined, { dateStyle: "long" })}. Update it
          before then.
        </UpdateNotice>
      ) : null}
      {update?.status === "available" ? (
        <UpdateNotice title="Update available" updateUrl={updateUrl}>
          A newer version of the app is out.
        </UpdateNotice>
      ) : null}
      <View style={styles.tiles}>
        <Tile icon={UserCircleIcon} title="Account">
          {!authEnabled
            ? "This app has no sign-in."
            : user
              ? `Signed in as ${user.displayName || user.email}`
              : overview
                ? "The API did not find your session."
                : "Loading…"}
        </Tile>
        <Tile icon={PulseIcon} title="API">
          {overview?.health
            ? `Available (${overview.health.service})`
            : overview
              ? `The app cannot reach ${apiUrl || "the API"}.`
              : "Loading…"}
        </Tile>
        <Tile icon={DeviceMobileIcon} title="App">
          Version {installedVersion || "unknown"}
        </Tile>
      </View>
    </Screen>
  );
}

/** What the versions the API serves call for, with the update's link and Not now. */
function UpdateNotice({
  title,
  updateUrl,
  children,
}: {
  title: string;
  updateUrl: string | null | undefined;
  children: ReactNode;
}) {
  const colors = useColors();
  return (
    <View style={[styles.notice, { backgroundColor: colors.primaryTint }]}>
      <View style={styles.noticeRow}>
        <ArrowCircleUpIcon size={26} color={colors.accent} weight="duotone" />
        <View style={styles.noticeText}>
          <Text
            accessibilityRole="header"
            style={[styles.noticeTitle, { color: colors.onPrimaryTint }]}
          >
            {title}
          </Text>
          <Text style={[styles.noticeBody, { color: colors.onPrimaryTint }]}>{children}</Text>
        </View>
      </View>
      <View style={styles.noticeActions}>
        {updateUrl ? (
          <PillButton title="Update" onPress={() => void Linking.openURL(updateUrl)} />
        ) : null}
        <PillButton title="Not now" variant="outline" onPress={updates.notNow} />
      </View>
    </View>
  );
}

/** One fact about the app, such as who is signed in. */
function Tile({
  icon: TileIcon,
  title,
  children,
}: {
  icon: Icon;
  title: string;
  children: ReactNode;
}) {
  const colors = useColors();
  return (
    <View style={[styles.tile, { backgroundColor: colors.surfaceTint }]}>
      <TileIcon size={26} color={colors.accent} weight="duotone" />
      <View style={styles.tileText}>
        <Text style={[styles.tileTitle, { color: colors.onSurfaceTint }]}>{title}</Text>
        <Text style={[styles.tileBody, { color: colors.onSurfaceTintMuted }]}>{children}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  hero: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 16,
    borderRadius: radius.hero,
    padding: 20,
  },
  heroText: { flex: 1, gap: 4 },
  greeting: { fontFamily: font.medium, fontSize: 14 },
  heroTitle: { fontFamily: font.semibold, fontSize: 24, letterSpacing: -0.4 },
  heroBody: { fontFamily: font.regular, fontSize: 14, lineHeight: 20 },
  heroBadge: {
    width: 48,
    height: 48,
    borderRadius: radius.xl,
    backgroundColor: "rgba(255, 255, 255, 0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  notice: { borderRadius: radius.card, padding: 18, gap: 14 },
  noticeRow: { flexDirection: "row", alignItems: "flex-start", gap: 14 },
  noticeText: { flex: 1, gap: 4 },
  noticeTitle: { fontFamily: font.semibold, fontSize: 16 },
  noticeBody: { fontFamily: font.regular, fontSize: 14, lineHeight: 20 },
  noticeActions: { flexDirection: "row", gap: 8 },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: { width: "48.5%", flexGrow: 1, borderRadius: radius.xl, padding: 16, gap: 12 },
  tileText: { gap: 2 },
  tileTitle: { fontFamily: font.semibold, fontSize: 15 },
  tileBody: { fontFamily: font.regular, fontSize: 13, lineHeight: 18 },
});
