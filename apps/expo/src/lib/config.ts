import { Platform } from "react-native";

// clubedge:if framework!=none
// Where the app sends its requests: the website, whose server forwards /api to the API and
// answers sign-in at /api/auth. EXPO_PUBLIC_API_URL is built into the app. Left blank in
// development, the app uses this computer's dev server, which the Android emulator reaches at
// 10.0.2.2 and the iOS simulator at localhost.
// clubedge:end
// clubedge:if framework=none
// Where the app sends its requests: the API, which also answers sign-in at /api/auth.
// EXPO_PUBLIC_API_URL is built into the app. Left blank in development, the app uses the API on
// this computer, at EXPO_PUBLIC_DEV_SERVER_PORT, which the Android emulator reaches at 10.0.2.2
// and the iOS simulator at localhost.
// clubedge:end
const devPort = process.env.EXPO_PUBLIC_DEV_SERVER_PORT || "3000";
const devServer = `${Platform.OS === "android" ? "http://10.0.2.2" : "http://localhost"}:${devPort}`;

export const apiUrl = (process.env.EXPO_PUBLIC_API_URL || (__DEV__ ? devServer : "")).replace(
  /\/+$/,
  "",
);
