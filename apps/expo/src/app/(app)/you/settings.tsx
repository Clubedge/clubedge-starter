import { router } from "expo-router";
import { LockSimpleIcon } from "phosphor-react-native/src/icons/LockSimple";
import { TrashIcon } from "phosphor-react-native/src/icons/Trash";
import { useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import site from "@/config/site.json";
import { SignOutSheet } from "@/components/sign-out-sheet";
import { ListRow, ListSection, Screen } from "@/components/ui";
import { useAccount } from "@/lib/account";
import { installedVersion } from "@/lib/app-update";
import { type, useColors } from "@/lib/theme";

/** The account's password and deletion, signing out, and the app's version. */
export default function Settings() {
  const colors = useColors();
  const account = useAccount();
  const [signingOut, setSigningOut] = useState(false);
  return (
    <>
      <Screen back="Settings" layout="list">
        <ListSection title="Account">
          <ListRow
            icon={LockSimpleIcon}
            label="Password"
            onPress={() => router.push("/you/password")}
          />
          <ListRow
            icon={TrashIcon}
            label="Delete account"
            onPress={() => router.push("/you/delete-account")}
          />
        </ListSection>
        <Pressable
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => setSigningOut(true)}
          style={styles.signOut}
        >
          <Text style={[type.headline, { color: colors.danger }]}>Sign out</Text>
        </Pressable>
        <Text style={[type.footnote, { color: colors.textFaint }]}>
          {installedVersion ? `${site.name} ${installedVersion}` : site.name}
        </Text>
      </Screen>
      <SignOutSheet account={account} visible={signingOut} onClose={() => setSigningOut(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  signOut: { alignSelf: "flex-start" },
});
