import { Stack } from "expo-router";
import { useColors } from "@/lib/theme";

// The Settings tab: the profile and its settings, then the forms they open.
export default function SettingsLayout() {
  const colors = useColors();
  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}
    />
  );
}
