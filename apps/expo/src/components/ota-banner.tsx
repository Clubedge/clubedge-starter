import { ArrowsClockwiseIcon } from "phosphor-react-native/src/icons/ArrowsClockwise";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { restartIntoUpdate, useOtaUpdateReady } from "@/lib/ota";
import { font, radius, useColors } from "@/lib/theme";

/**
 * Says that an over-the-air update is downloaded (lib/ota.ts), with a button that restarts the
 * app into it, as the update banner does for a store update.
 */
export function OtaBanner() {
  const colors = useColors();
  const ready = useOtaUpdateReady();
  if (!ready) return null;
  return (
    <View
      accessibilityRole="summary"
      style={[styles.banner, { backgroundColor: colors.primaryTint }]}
    >
      <View style={[styles.badge, { backgroundColor: colors.primary }]}>
        <ArrowsClockwiseIcon size={20} color={colors.onPrimary} weight="bold" />
      </View>
      <View style={styles.text}>
        <Text style={[styles.title, { color: colors.onPrimaryTint }]}>An update is ready</Text>
        <Text style={[styles.detail, { color: colors.onPrimaryTint }]}>
          Restart to use it, or it starts next time.
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={restartIntoUpdate}
        style={({ pressed }) => [
          styles.restart,
          { backgroundColor: pressed ? colors.primaryPressed : colors.primary },
        ]}
      >
        <Text style={[styles.restartText, { color: colors.onPrimary }]}>Restart</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: radius.card,
    paddingVertical: 14,
    paddingLeft: 14,
    paddingRight: 14,
  },
  badge: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  text: { flex: 1, gap: 2 },
  title: { fontFamily: font.semibold, fontSize: 15 },
  detail: { fontFamily: font.regular, fontSize: 13, opacity: 0.8 },
  restart: {
    height: 34,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    justifyContent: "center",
  },
  restartText: { fontFamily: font.semibold, fontSize: 14 },
});
