import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { UpdateGate } from "@/components/update-gate";
import { useColors, useFontsReady } from "@/lib/theme";

// The splash screen stays up until the app's fonts are loaded.
void SplashScreen.preventAutoHideAsync();

// The app without sign-in: every screen is open.
export default function RootLayout() {
  const colors = useColors();
  const fontsReady = useFontsReady();
  useEffect(() => {
    if (fontsReady) void SplashScreen.hideAsync();
  }, [fontsReady]);
  if (!fontsReady) return null;

  return (
    <UpdateGate>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}
      />
    </UpdateGate>
  );
}
