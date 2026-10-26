import { Stack } from "expo-router";
import { useColors } from "@/lib/theme";

// The You tab: the profile, then the settings and the forms they open.
export default function YouLayout() {
  const colors = useColors();
  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}
    />
  );
}
