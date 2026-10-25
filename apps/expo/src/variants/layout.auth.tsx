import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { UpdateGate } from "@/components/update-gate";
import { SessionProvider, useSession } from "@/lib/session";
import { useColors } from "@/lib/theme";

// The splash screen stays up until the app knows whether this device is signed in.
void SplashScreen.preventAutoHideAsync();

/** The app's screens open signed in, and the sign-in screens signed out. */
function Routes() {
  const { status } = useSession();
  const colors = useColors();
  useEffect(() => {
    if (status !== "loading") void SplashScreen.hideAsync();
  }, [status]);
  if (status === "loading") return null;

  const signedIn = status === "signed-in";
  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}
    >
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="sign-up" />
        <Stack.Screen name="forgot-password" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <UpdateGate>
      <SessionProvider>
        <StatusBar style="auto" />
        <Routes />
      </SessionProvider>
    </UpdateGate>
  );
}
