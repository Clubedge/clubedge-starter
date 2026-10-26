import { router } from "expo-router";
import { GearSixIcon } from "phosphor-react-native/src/icons/GearSix";
import { StyleSheet, Text, View } from "react-native";
import { Avatar, IconButton, PillButton, Screen } from "@/components/ui";
import { useAccount } from "@/lib/account";
import { font, type, useColors } from "@/lib/theme";

/** The signed-in user: their name and email address, with the way to their settings. */
export default function Profile() {
  const colors = useColors();
  const account = useAccount();
  const name = account ? account.displayName || account.email : null;
  return (
    <Screen layout="list">
      <View style={styles.header}>
        <Text accessibilityRole="header" style={[type.largeTitle, { color: colors.text }]}>
          You
        </Text>
        <IconButton
          icon={GearSixIcon}
          label="Settings"
          onPress={() => router.push("/you/settings")}
        />
      </View>
      <View style={styles.identity}>
        <Avatar name={name ?? ""} size={64} />
        <View style={styles.names}>
          <Text numberOfLines={1} style={[styles.name, { color: colors.text }]}>
            {name ?? "Loading…"}
          </Text>
          {account?.displayName ? (
            <Text numberOfLines={1} style={[type.callout, { color: colors.textMuted }]}>
              {account.email}
            </Text>
          ) : null}
        </View>
        <PillButton
          title="Edit"
          variant="outline"
          small
          onPress={() => router.push("/you/edit-profile")}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  identity: { flexDirection: "row", alignItems: "center", gap: 14 },
  names: { flex: 1, gap: 2 },
  name: { fontFamily: font.semibold, fontSize: 20, letterSpacing: -0.2 },
});
