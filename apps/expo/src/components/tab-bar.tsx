import type { BottomTabBarProps } from "expo-router/js-tabs";
import type { Icon } from "phosphor-react-native";
import { GearSixIcon } from "phosphor-react-native/src/icons/GearSix";
import { HouseIcon } from "phosphor-react-native/src/icons/House";
import { useEffect, useState } from "react";
import { Keyboard, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { font, radius, useColors } from "@/lib/theme";

/** Each tab's icon, by its route's name: a new tab adds its own here. */
const icons: Record<string, Icon> = { index: HouseIcon, settings: GearSixIcon };

/**
 * The tab bar: a capsule floating over the screens, where the current tab is a pill with its
 * title. It steps aside while the keyboard is up.
 */
export function TabBar({ state, descriptors, emitter, navigateToTab, insets }: BottomTabBarProps) {
  const colors = useColors();
  const keyboardShown = useKeyboardShown();
  if (keyboardShown) return null;

  return (
    <View style={[styles.bar, { bottom: Math.max(insets.bottom - 4, 16) }]}>
      <View
        accessibilityRole="tablist"
        style={[styles.capsule, { backgroundColor: colors.nav, borderColor: colors.divider }]}
      >
        {state.routes.map((route, index) => {
          const focused = index === state.index;
          const title = descriptors[route.key]?.options.title ?? route.name;
          const TabIcon = icons[route.name] ?? HouseIcon;
          const onPress = () => {
            const event = emitter.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) navigateToTab(route.key);
          };
          return (
            <Pressable
              key={route.key}
              accessibilityLabel={title}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              onPress={onPress}
              style={[
                styles.tab,
                focused ? [styles.current, { backgroundColor: colors.navActive }] : styles.other,
              ]}
            >
              <TabIcon
                size={focused ? 22 : 23}
                color={focused ? colors.onNavActive : colors.navInactive}
                weight={focused ? "fill" : "bold"}
              />
              {focused ? (
                <Text style={[styles.title, { color: colors.onNavActive }]}>{title}</Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Whether the keyboard is up. */
function useKeyboardShown() {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    // iOS tells as the keyboard starts to move, and Android once it has.
    const ios = Platform.OS === "ios";
    const show = Keyboard.addListener(ios ? "keyboardWillShow" : "keyboardDidShow", () =>
      setShown(true),
    );
    const hide = Keyboard.addListener(ios ? "keyboardWillHide" : "keyboardDidHide", () =>
      setShown(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return shown;
}

const styles = StyleSheet.create({
  bar: { position: "absolute", left: 0, right: 0, alignItems: "center", pointerEvents: "box-none" },
  capsule: {
    height: 60,
    padding: 6,
    borderRadius: radius.pill,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    shadowColor: "#000000",
    shadowOpacity: 0.12,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  tab: {
    height: 48,
    borderRadius: radius.pill,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  current: { paddingLeft: 14, paddingRight: 18 },
  other: { width: 56 },
  title: { fontFamily: font.semibold, fontSize: 15 },
});
