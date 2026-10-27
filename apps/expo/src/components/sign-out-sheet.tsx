import type { Account } from "@clubedge/contract";
import { CheckIcon } from "phosphor-react-native/src/icons/Check";
import { SignOutIcon } from "phosphor-react-native/src/icons/SignOut";
import { XIcon } from "phosphor-react-native/src/icons/X";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar, Button, IconButton, Notice } from "@/components/ui";
import { useAccountAction } from "@/lib/account";
import { authClient } from "@/lib/auth";
import { disablePush } from "@/lib/push"; // clubedge:only push!=none
import { useSession } from "@/lib/session";
import { font, radius, type, useColors } from "@/lib/theme";

/** The account this device is signed in to, and signing out of it, in a sheet from the bottom. */
export function SignOutSheet({
  account,
  visible,
  onClose,
}: {
  account: Account | null;
  visible: boolean;
  onClose: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { setSignedIn } = useSession();
  const { busy, message, run } = useAccountAction();
  const name = account ? account.displayName || account.email : null;

  const signOut = (everywhere = false) =>
    run(async () => {
      // A signed-out device gets no more of the account's notifications.
      await disablePush(); // clubedge:only push!=none
      await authClient.signOut({ everywhere });
      // Signed out, the welcome screen opens in place of the app's screens.
      setSignedIn(false);
      return null;
    });

  return (
    <Modal
      animationType="slide"
      navigationBarTranslucent
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      {/* The scrim fills the screen, behind the sheet too, so its rounded corners show. */}
      <Pressable
        accessibilityLabel="Close"
        onPress={onClose}
        style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }]}
      />
      <View style={styles.above} />
      <View
        style={[
          styles.sheet,
          { backgroundColor: colors.background, paddingBottom: insets.bottom + 12 },
        ]}
      >
        <View style={[styles.grabber, { backgroundColor: colors.border }]} />
        <View style={styles.header}>
          <Text accessibilityRole="header" style={[type.title3, { color: colors.text }]}>
            Account
          </Text>
          <IconButton icon={XIcon} label="Close" onPress={onClose} small />
        </View>
        {name ? (
          <View style={styles.account}>
            <Avatar name={name} primary />
            <View style={styles.names}>
              <Text numberOfLines={1} style={[styles.name, { color: colors.text }]}>
                {name}
              </Text>
              {account?.displayName ? (
                <Text numberOfLines={1} style={[styles.email, { color: colors.textMuted }]}>
                  {account.email}
                </Text>
              ) : null}
            </View>
            <CheckIcon size={20} color={colors.accent} weight="bold" />
          </View>
        ) : null}
        <View style={[styles.divider, { backgroundColor: colors.hairline }]} />
        {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
        <Button
          title={name ? `Sign out of ${name}` : "Sign out"}
          variant="danger"
          icon={SignOutIcon}
          busy={busy}
          onPress={() => signOut()}
        />
        {/* The user's sessions on their other devices end too, as after a lost phone. */}
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => signOut(true)}
          style={styles.everywhere}
        >
          <Text style={[styles.everywhereText, { color: colors.danger }]}>
            Sign out of all devices
          </Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // The room above the sheet, where a tap reaches the scrim and closes it.
  above: { flex: 1, pointerEvents: "none" },
  sheet: {
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: 20,
    paddingTop: 10,
    gap: 6,
  },
  grabber: { alignSelf: "center", width: 36, height: 5, borderRadius: 3, marginBottom: 12 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 4,
    paddingBottom: 8,
  },
  account: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  names: { flex: 1, gap: 1 },
  name: { fontFamily: font.semibold, fontSize: 16 },
  email: { fontFamily: font.regular, fontSize: 14 },
  divider: { height: 1, marginVertical: 8 },
  everywhere: { paddingTop: 10, alignItems: "center" },
  everywhereText: { fontFamily: font.semibold, fontSize: 15 },
});
