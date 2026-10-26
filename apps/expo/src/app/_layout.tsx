import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { UpdateGate } from "@/components/update-gate";
import { useColors } from "@/lib/theme";

// The app without sign-in: every screen is open.
export default function RootLayout() {
  const colors = useColors();
  return (
    <UpdateGate>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}
      />
    </UpdateGate>
  );
}
