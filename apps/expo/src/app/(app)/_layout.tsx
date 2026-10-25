import { router, Stack } from "expo-router";
import site from "@/config/site.json";
import { TextLink } from "@/components/ui";
import { authEnabled } from "@/lib/auth-enabled";
import { useColors } from "@/lib/theme";

// The app's own screens, under a header: the dashboard and, with sign-in, the settings.
export default function AppLayout() {
  const colors = useColors();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: site.shortName,
          headerRight: authEnabled
            ? () => <TextLink title="Settings" onPress={() => router.push("/settings")} />
            : undefined,
        }}
      />
      {authEnabled ? <Stack.Screen name="settings" options={{ title: "Settings" }} /> : null}
    </Stack>
  );
}
