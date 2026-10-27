import * as Application from "expo-application";
import { router } from "expo-router";
import { LockSimpleIcon } from "phosphor-react-native/src/icons/LockSimple";
import { MoonIcon } from "phosphor-react-native/src/icons/Moon";
import { TrashIcon } from "phosphor-react-native/src/icons/Trash";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import site from "@/config/site.json";
import { PushSettings } from "@/components/push-settings"; // clubedge:only push!=none
import { SignOutSheet } from "@/components/sign-out-sheet";
import { Avatar, ListRow, ListSection, PillButton, Screen } from "@/components/ui";
import { useAccount } from "@/lib/account";
import { installedVersion } from "@/lib/app-update";
import { font, type, useColors, useDarkMode } from "@/lib/theme";

/**
 * The signed-in user and their settings: the name and email address, the app's appearance and
 * notifications, the password and the account's deletion, signing out, and the app's version.
 */
export default function Settings() {
  const colors = useColors();
  const account = useAccount();
  const [dark, setDark] = useDarkMode();
  const [signingOut, setSigningOut] = useState(false);
  const name = account ? account.displayName || account.email : null;
  const build = Application.nativeBuildVersion;
  return (
    <>
      <Screen layout="list">
        <Text accessibilityRole="header" style={[type.largeTitle, { color: colors.text }]}>
          Settings
        </Text>
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
            onPress={() => router.push("/settings/edit-profile")}
          />
        </View>
        <ListSection title="Preferences">
          <ListRow icon={MoonIcon} label="Dark mode" toggle={{ value: dark, onChange: setDark }} />
          <PushSettings /> {/* clubedge:only push!=none */}
        </ListSection>
        <ListSection title="Account">
          <ListRow
            icon={LockSimpleIcon}
            label="Password & security"
            onPress={() => router.push("/settings/password")}
          />
          <ListRow
            icon={TrashIcon}
            label="Delete account"
            onPress={() => router.push("/settings/delete-account")}
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
          {installedVersion
            ? `${site.name} ${installedVersion}${build ? ` (${build})` : ""}`
            : site.name}
        </Text>
      </Screen>
      <SignOutSheet account={account} visible={signingOut} onClose={() => setSigningOut(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  identity: { flexDirection: "row", alignItems: "center", gap: 14 },
  names: { flex: 1, gap: 2 },
  name: { fontFamily: font.semibold, fontSize: 20, letterSpacing: -0.2 },
  signOut: { alignSelf: "flex-start" },
});
