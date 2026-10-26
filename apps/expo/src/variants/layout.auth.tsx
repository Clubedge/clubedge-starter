import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { UpdateGate } from "@/components/update-gate";
import { SessionProvider, useSession } from "@/lib/session";
import { useColors, useFontsReady } from "@/lib/theme";

// The splash screen stays up until the app's fonts are loaded and it knows whether this device
// is signed in.
void SplashScreen.preventAutoHideAsync();

/**
 * Hides the splash screen once the fonts are loaded and the session is known, whichever screen
 * then shows.
 */
function HideSplashScreen({ fontsReady }: { fontsReady: boolean }) {
  const { status } = useSession();
  useEffect(() => {
    if (fontsReady && status !== "loading") void SplashScreen.hideAsync();
  }, [fontsReady, status]);
  return null;
}

/**
 * The app's screens open signed in, and the welcome and sign-in screens signed out: signed out,
 * the app starts on the welcome screen.
 */
function Routes() {
  const { status } = useSession();
  const colors = useColors();
  if (status === "loading") return null;

  const signedIn = status === "signed-in";
  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}
    >
      <Stack.Protected guard={signedIn} redirectTo="/welcome">
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="welcome" />
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="sign-up" />
        <Stack.Screen name="forgot-password" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const fontsReady = useFontsReady();
  // The session is checked outside the update gate, so the splash screen also hides when the
  // gate shows its update screen in place of the app. Both wait for the fonts.
  return (
    <SessionProvider>
      <StatusBar style="auto" />
      <HideSplashScreen fontsReady={fontsReady} />
      {fontsReady ? (
        <UpdateGate>
          <Routes />
        </UpdateGate>
      ) : null}
    </SessionProvider>
  );
}
