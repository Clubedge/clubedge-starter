import { Tabs, type BottomTabBarProps } from "expo-router/js-tabs";
import { TabBar } from "@/components/tab-bar";
import { useColors } from "@/lib/theme";

// The app's own screens, in two tabs: the dashboard, and You, the profile and its settings.
export default function AppLayout() {
  const colors = useColors();
  return (
    <Tabs
      tabBar={(props: BottomTabBarProps) => <TabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.background } }}
    >
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="you" options={{ title: "You" }} />
    </Tabs>
  );
}
