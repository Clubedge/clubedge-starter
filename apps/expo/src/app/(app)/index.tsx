import type { Health, User } from "@clubedge/contract";
import * as Linking from "expo-linking";
import { useCallback, useEffect, useState } from "react";
import { RefreshControl } from "react-native";
import site from "@/config/site.json";
import { Body, Button, Card, Screen, Title } from "@/components/ui";
import { useUpdate } from "@/components/update-gate";
import { api } from "@/lib/api";
import { installedVersion } from "@/lib/app-update";
import { authEnabled } from "@/lib/auth-enabled";
import { apiUrl } from "@/lib/config";

type Overview = { health: Health | null; user: User | null };

export default function Dashboard() {
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

  return (
    <Screen header refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
      <Title>Welcome to {site.name}</Title>
      <Body muted>{site.description}</Body>
      {update?.status === "upcoming" && deadline ? (
        <Card title="Update required soon">
          <Body>
            This version of the app stops working on{" "}
            {new Date(deadline).toLocaleDateString(undefined, { dateStyle: "long" })}. Update it
            before then.
          </Body>
          {updateUrl ? (
            <Button title="Update" onPress={() => void Linking.openURL(updateUrl)} />
          ) : null}
        </Card>
      ) : null}
      {update?.status === "available" ? (
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
