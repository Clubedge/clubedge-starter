// Each weight from its own entry: the package's index would bring all 18 of Inter's fonts into the
// app.
import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular";
import { Inter_500Medium } from "@expo-google-fonts/inter/500Medium";
import { Inter_600SemiBold } from "@expo-google-fonts/inter/600SemiBold";
import { Inter_700Bold } from "@expo-google-fonts/inter/700Bold";
import { useFonts } from "expo-font";
import deviceStorage from "expo-sqlite/kv-store";
import { Appearance, useColorScheme } from "react-native";

// The appearance chosen in Settings (useDarkMode), over the phone's own: kept on the device, and set
// before the first screen draws.
const appearanceKey = "appearance";
const chosenAppearance = deviceStorage.getItemSync(appearanceKey);
if (chosenAppearance === "light" || chosenAppearance === "dark") {
  Appearance.setColorScheme?.(chosenAppearance);
}

/** Whether the app is dark, and the user's choice of it, which holds over the phone's. */
export function useDarkMode(): [boolean, (dark: boolean) => void] {
  const dark = useColorScheme() === "dark";
  const choose = (next: boolean) => {
    const appearance = next ? "dark" : "light";
    Appearance.setColorScheme?.(appearance);
    deviceStorage.setItemSync(appearanceKey, appearance);
  };
  return [dark, choose];
}

// The brand's blue on cool grays, in light and dark. Screens take their colors from here, so a
// rebrand changes this file only.
const light = {
  background: "#FFFFFF",
  backgroundPressed: "#F9FAFB",
  // The dashboard's background and its tiles: a hint of the brand's blue.
  backgroundTint: "#FAFBFF",
  surfaceTint: "#EEF2FB",
  surfaceTintHigh: "#E5EBF7",
  onSurfaceTint: "#111827",
  onSurfaceTintMuted: "#44474F",
  text: "#0A0A0A",
  textSecondary: "#4B5563",
  textMuted: "#6B7280",
  textFaint: "#9CA3AF",
  border: "#D1D5DB",
  divider: "#E5E7EB",
  hairline: "#F3F4F6",
  chevron: "#C4C4C7",
  outline: "#74777F",
  fill: "#F3F4F6",
  fillPressed: "#E5E7EB",
  primary: "#2563EB",
  primaryPressed: "#1D4ED8",
  onPrimary: "#FFFFFF",
  primaryTint: "#DBEAFE",
  onPrimaryTint: "#1E3A8A",
  // The brand's blue as text and icons, such as links: lighter in dark, to read on dark grays.
  accent: "#2563EB",
  danger: "#DC2626",
  dangerTint: "#FEF2F2",
  dangerTintPressed: "#FEE2E2",
  success: "#15803D",
  successTint: "#F0FDF4",
  // The black button.
  inverse: "#0A0A0A",
  inversePressed: "#262626",
  onInverse: "#FFFFFF",
  // The tab bar: frosted glass, nearly opaque where Android blurs less, with a hairline edge; the
  // current tab is a pill of the brand's blue.
  nav: "rgba(255, 255, 255, 0.72)",
  navOpaque: "rgba(255, 255, 255, 0.96)",
  navBorder: "rgba(0, 0, 0, 0.08)",
  navPressed: "rgba(0, 0, 0, 0.05)",
  navActive: "#2563EB",
  onNavActive: "#FFFFFF",
  navInactive: "#4B5563",
  // Behind a sheet.
  scrim: "rgba(0, 0, 0, 0.35)",
};

const dark: typeof light = {
  background: "#151515",
  backgroundPressed: "#1C1C1E",
  backgroundTint: "#121419",
  surfaceTint: "#1A2030",
  surfaceTintHigh: "#222A3D",
  onSurfaceTint: "#F3F4F6",
  onSurfaceTintMuted: "#B4B8C2",
  text: "#FAFAFA",
  textSecondary: "#D1D5DB",
  textMuted: "#9CA3AF",
  textFaint: "#6B7280",
  border: "#3F3F46",
  divider: "#2E2E33",
  hairline: "#242428",
  chevron: "#52525B",
  outline: "#8E9099",
  fill: "#242428",
  fillPressed: "#2E2E33",
  primary: "#2563EB",
  primaryPressed: "#1D4ED8",
  onPrimary: "#FFFFFF",
  primaryTint: "#1E2A4A",
  onPrimaryTint: "#BFDBFE",
  accent: "#60A5FA",
  danger: "#F87171",
  dangerTint: "#2A1517",
  dangerTintPressed: "#3A1C1F",
  success: "#4ADE80",
  successTint: "#122318",
  inverse: "#FAFAFA",
  inversePressed: "#E5E5E5",
  onInverse: "#0A0A0A",
  nav: "rgba(36, 36, 40, 0.72)",
  navOpaque: "rgba(36, 36, 40, 0.96)",
  navBorder: "rgba(255, 255, 255, 0.08)",
  navPressed: "rgba(255, 255, 255, 0.08)",
  navActive: "#2563EB",
  onNavActive: "#FFFFFF",
  navInactive: "#D1D5DB",
  scrim: "rgba(0, 0, 0, 0.6)",
};

export type Colors = typeof light;

/** The colors for the phone's light or dark appearance, following it as it changes. */
export function useColors(): Colors {
  return useColorScheme() === "dark" ? dark : light;
}

/** Inter, the app's typeface: each weight is a font family of its own. */
export const font = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
} as const;

/**
 * Loads Inter while the splash screen holds. True once its fonts are ready, or once they failed
 * to load, when the text falls back to the system's font.
 */
export function useFontsReady(): boolean {
  const [loaded, error] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  return loaded || error !== null;
}

/** The type scale, without colors: screens add them from useColors. */
export const type = {
  largeTitle: { fontFamily: font.bold, fontSize: 34, letterSpacing: -1.1 },
  title: { fontFamily: font.bold, fontSize: 30, letterSpacing: -0.9 },
  title3: { fontFamily: font.bold, fontSize: 20, letterSpacing: -0.3 },
  headline: { fontFamily: font.semibold, fontSize: 17 },
  body: { fontFamily: font.regular, fontSize: 16, lineHeight: 23 },
  callout: { fontFamily: font.regular, fontSize: 15 },
  footnote: { fontFamily: font.regular, fontSize: 13 },
  caption: { fontFamily: font.regular, fontSize: 12, lineHeight: 18 },
  section: { fontFamily: font.semibold, fontSize: 13 },
  link: { fontFamily: font.semibold },
} as const;

export const radius = {
  sm: 6,
  md: 12,
  lg: 14,
  xl: 16,
  card: 20,
  hero: 28,
  sheet: 32,
  pill: 999,
} as const;
