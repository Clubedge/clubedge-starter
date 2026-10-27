import { Tabs, type BottomTabBarProps } from "expo-router/js-tabs";
import { TabBar } from "@/components/tab-bar";
import { usePushNotifications } from "@/lib/push"; // clubedge:only push!=none
import { useColors } from "@/lib/theme";

// The app's own screens, in two tabs: the dashboard, and Settings, with the profile.
export default function AppLayout() {
  const colors = useColors();
  usePushNotifications(); // clubedge:only push!=none
  return (
    <Tabs
      tabBar={(props: BottomTabBarProps) => <TabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.background } }}
    >
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="settings" options={{ title: "Settings" }} />
    </Tabs>
  );
}
