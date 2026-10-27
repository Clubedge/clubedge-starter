import type { Health, User } from "@clubedge/contract";
import { useFocusEffect } from "expo-router";
import { useCallback, useState, type ReactNode } from "react";
import { RefreshControl, StyleSheet, Text, View } from "react-native";
import site from "@/config/site.json";
import { OtaBanner } from "@/components/ota-banner"; // clubedge:only ota=eas
import { Avatar, Mark, Notice, Screen } from "@/components/ui";
import { UpdateBanner, useUpdate } from "@/components/update-gate";
import { api } from "@/lib/api";
import { installedVersion } from "@/lib/app-update";
import { authEnabled } from "@/lib/auth-enabled";
import { font, radius, type, useColors } from "@/lib/theme";

// user is undefined when the API did not answer, and null when it found no session.
type Overview = { health: Health | null; user: User | null | undefined };

/** The first screen signed in: a greeting, what the app is, and how the app and its API are. */
export default function Dashboard() {
  const colors = useColors();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const update = useUpdate();

  // The API's health and the signed-in user, from the API's contract (packages/contract). The
  // name set in Settings is the app's own, in its account, and wins over the sign-in provider's.
  const load = useCallback(async () => {
    const [health, session, account] = await Promise.all([
      api.GET("/api/health").catch(() => null),
      api.GET("/api/session").catch(() => null),
      authEnabled ? api.GET("/api/account").catch(() => null) : null,
    ]);
    const user = session?.data ? session.data.user : undefined;
    const displayName = account?.data?.displayName;
    setOverview({
      health: health?.data ?? null,
      user: user && displayName ? { ...user, displayName } : user,
    });
  }, []);

  // Asked again each time Home shows, so a name changed in Settings shows on return.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const user = overview?.user;
  const firstName = user?.displayName?.trim().split(/\s+/)[0];
  const today = new Date().toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const health = overview?.health;
  return (
    <Screen
      layout="dashboard"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
    >
      <View style={styles.header}>
        {user ? (
          <Avatar name={user.displayName || user.email} size={40} primary />
        ) : (
          <View style={[styles.headerMark, { backgroundColor: colors.primary }]}>
            <Mark size={20} color={colors.onPrimary} />
          </View>
        )}
        <View style={styles.headerText}>
          <Text style={[type.footnote, { color: colors.textMuted }]}>{today}</Text>
          <Text accessibilityRole="header" style={[styles.hello, { color: colors.text }]}>
            {firstName ? `Hey ${firstName}` : "Hey there"}
          </Text>
        </View>
      </View>
      <View style={[styles.hero, { backgroundColor: colors.primary }]}>
        <View style={styles.heroText}>
          <Text style={[styles.heroLabel, { color: colors.onPrimary }]}>WELCOME TO</Text>
          <Text style={[styles.heroTitle, { color: colors.onPrimary }]}>{site.name}</Text>
          <Text style={[styles.heroBody, { color: colors.onPrimary }]}>{site.description}</Text>
        </View>
        <View style={styles.heroBadge}>
          <Mark size={26} color={colors.onPrimary} />
        </View>
      </View>
      {update?.status === "available" ? (
        <UpdateBanner
          version={update.versions?.latestVersion}
          updateUrl={update.versions?.updateUrl}
        />
      ) : null}
      <OtaBanner /> {/* clubedge:only ota=eas */}
      {authEnabled && user === null ? (
        <Notice tone="error">The API did not find your session. Pull down to try again.</Notice>
      ) : null}
      <View style={styles.stats}>
        <Stat
          label="API"
          value={overview ? (health ? "Online" : "Offline") : "…"}
          tone={overview ? (health ? "good" : "bad") : "neutral"}
        >
          {overview ? (health ? health.service : "No answer") : ""}
        </Stat>
        <Stat
          label="App version"
          value={installedVersion || "—"}
          tone={update?.status === "current" ? "good" : update ? "notice" : "neutral"}
        >
          {update?.status === "current"
            ? "Up to date"
            : update?.status === "available"
              ? "Update available"
              : update?.status === "upcoming"
                ? "Update required soon"
                : ""}
        </Stat>
      </View>
    </Screen>
  );
}

/** One figure about the app, large, with its label above and its status below. */
function Stat({
  label,
  value,
  tone,
  children,
}: {
  label: string;
  value: string;
  tone: "good" | "bad" | "notice" | "neutral";
  children: ReactNode;
}) {
  const colors = useColors();
  const dot = { good: colors.success, bad: colors.danger, notice: colors.accent, neutral: null }[
    tone
  ];
  return (
    <View style={[styles.stat, { backgroundColor: colors.surfaceTint }]}>
      <Text style={[type.footnote, { color: colors.onSurfaceTintMuted }]}>{label}</Text>
      <Text numberOfLines={1} style={[styles.statValue, { color: colors.onSurfaceTint }]}>
        {value}
      </Text>
      <View style={styles.statStatus}>
        {dot && children ? <View style={[styles.dot, { backgroundColor: dot }]} /> : null}
        <Text numberOfLines={1} style={[styles.statText, { color: colors.onSurfaceTintMuted }]}>
          {children}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingTop: 4 },
  headerMark: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: { flex: 1, gap: 1 },
  hello: { fontFamily: font.bold, fontSize: 20, letterSpacing: -0.3 },
  hero: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 16,
    borderRadius: radius.hero,
    padding: 20,
  },
  heroText: { flex: 1, gap: 4 },
  heroLabel: { fontFamily: font.semibold, fontSize: 13, letterSpacing: 0.8 },
  heroTitle: { fontFamily: font.bold, fontSize: 24, letterSpacing: -0.4 },
  heroBody: { fontFamily: font.regular, fontSize: 14, lineHeight: 20 },
  heroBadge: {
    width: 48,
    height: 48,
    borderRadius: radius.xl,
    backgroundColor: "rgba(255, 255, 255, 0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  stats: { flexDirection: "row", gap: 10 },
  stat: { flex: 1, borderRadius: radius.card, padding: 16, gap: 4 },
  statValue: { fontFamily: font.bold, fontSize: 28, letterSpacing: -0.6 },
  statStatus: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statText: { flex: 1, fontFamily: font.regular, fontSize: 13 },
});
