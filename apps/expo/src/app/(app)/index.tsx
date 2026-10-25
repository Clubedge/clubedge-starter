import type { Health, User } from "@clubedge/contract";
import * as Linking from "expo-linking";
import { useCallback, useEffect, useState } from "react";
import { RefreshControl } from "react-native";
import site from "@/config/site.json";
import { Body, Button, Card, Screen, Title } from "@/components/ui";
import { installedVersion, useUpdate } from "@/components/update-gate";
import { api } from "@/lib/api";
import { authEnabled } from "@/lib/auth-enabled";
import { apiUrl } from "@/lib/config";

type Overview = { health: Health | null; user: User | null };

export default function Dashboard() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const { update, updateUrl } = useUpdate();

  // The API's health and the signed-in user, from the same contract the website uses.
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

  return (
    <Screen header refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
      <Title>Welcome to {site.name}</Title>
      <Body muted>{site.description}</Body>
      {update === "available" ? (
        <Card title="Update available">
          <Body>A newer version of the app is out.</Body>
          {updateUrl ? (
            <Button title="Update" onPress={() => void Linking.openURL(updateUrl)} />
          ) : null}
        </Card>
      ) : null}
      <Card title="Account">
        {!authEnabled ? (
          <Body muted>This app has no sign-in.</Body>
        ) : overview?.user ? (
          <Body>Signed in as {overview.user.displayName || overview.user.email}</Body>
        ) : (
          <Body muted>{overview ? "The API did not find your session." : "Loading…"}</Body>
        )}
      </Card>
      <Card title="API">
        {overview?.health ? (
          <Body>Available ({overview.health.service})</Body>
        ) : (
          <Body muted>
            {overview ? `The app cannot reach ${apiUrl || "the API"}.` : "Loading…"}
          </Body>
        )}
      </Card>
      <Card title="App">
        <Body muted>Version {installedVersion || "unknown"}</Body>
      </Card>
    </Screen>
  );
}
