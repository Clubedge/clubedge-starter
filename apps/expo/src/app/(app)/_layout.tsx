import { Stack } from "expo-router";
import { useColors } from "@/lib/theme";

// The app's own screens: without sign-in, the dashboard alone, so no tab bar.
export default function AppLayout() {
  const colors = useColors();
  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}
    />
  );
}
