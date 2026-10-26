import { Platform } from "react-native";

// Where the app sends its requests: the website, whose server forwards /api to the API and
// answers sign-in at /api/auth. EXPO_PUBLIC_API_URL is built into the app. Left blank in
// development, the app uses this computer's dev server, which the Android emulator reaches at
// 10.0.2.2 and the iOS simulator at localhost.
const devServer = Platform.OS === "android" ? "http://10.0.2.2:3000" : "http://localhost:3000";

export const apiUrl = (process.env.EXPO_PUBLIC_API_URL || (__DEV__ ? devServer : "")).replace(
  /\/+$/,
  "",
);
