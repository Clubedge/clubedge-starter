import { useColorScheme } from "react-native";

// The brand's blue on the Starter's neutrals, in light and dark. Screens take their
// colors from here, so a rebrand changes this file only.
const light = {
  background: "#FFFFFF",
  surface: "#F5F5F5",
  text: "#171717",
  muted: "#525252",
  border: "#E5E5E5",
  primary: "#2563EB",
  onPrimary: "#FFFFFF",
  danger: "#DC2626",
  success: "#15803D",
  warning: "#B45309",
};

const dark: typeof light = {
  background: "#151515",
  surface: "#1F1F1F",
  text: "#FAFAFA",
  muted: "#A3A3A3",
  border: "#2E2E2E",
  primary: "#3B82F6",
  onPrimary: "#FFFFFF",
  danger: "#F87171",
  success: "#4ADE80",
  warning: "#FBBF24",
};

export type Colors = typeof light;

/** The colors for the phone's light or dark appearance, following it as it changes. */
export function useColors(): Colors {
  return useColorScheme() === "dark" ? dark : light;
}

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
export const radius = { md: 10, lg: 14 } as const;
