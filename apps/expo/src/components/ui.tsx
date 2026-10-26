import * as Linking from "expo-linking";
import { router } from "expo-router";
import { BottomTabBarHeightContext } from "expo-router/js-tabs";
import type { Icon } from "phosphor-react-native";
// Phosphor's icons, each from its own file: the package's index would bring all of its icons
// into the app.
import { CaretLeftIcon } from "phosphor-react-native/src/icons/CaretLeft";
import { CaretRightIcon } from "phosphor-react-native/src/icons/CaretRight";
import { CheckIcon } from "phosphor-react-native/src/icons/Check";
import { CheckCircleIcon } from "phosphor-react-native/src/icons/CheckCircle";
import { EyeIcon } from "phosphor-react-native/src/icons/Eye";
import { EyeSlashIcon } from "phosphor-react-native/src/icons/EyeSlash";
import { MinusIcon } from "phosphor-react-native/src/icons/Minus";
import { WarningCircleIcon } from "phosphor-react-native/src/icons/WarningCircle";
import { useContext, useRef, useState, type ComponentRef, type ReactNode } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type ScrollViewProps,
  type TextInputProps,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { font, radius, type, useColors } from "@/lib/theme";
import mark from "../../assets/splash-icon.png";

/** Room at the bottom of a screen under the tab bar, which floats over it. */
const tabBarSpace = 130;

/**
 * A scrolling screen that keeps clear of the system bars, the keyboard, and the tab bar when it
 * has one. `back` puts a back button above it, with the screen's title when it is a string.
 * `footer` sits at the bottom of the screen, below content that does not fill it.
 */
export function Screen({
  children,
  back,
  footer,
  layout = "form",
  refreshControl,
}: {
  children: ReactNode;
  back?: boolean | string;
  footer?: ReactNode;
  /** Forms and their 12-point spacing, lists of sections, or the dashboard's tiles. */
  layout?: "form" | "list" | "dashboard";
  refreshControl?: ScrollViewProps["refreshControl"];
}) {
  const colors = useColors();
  // The tab navigator gives its screens a tab bar height, and other screens have none.
  const underTabBar = useContext(BottomTabBarHeightContext) !== undefined;
  return (
    <SafeAreaView
      edges={underTabBar ? ["top", "left", "right"] : ["top", "bottom", "left", "right"]}
      style={[
        styles.fill,
        { backgroundColor: layout === "dashboard" ? colors.backgroundTint : colors.background },
      ]}
    >
      {back ? <BackHeader title={typeof back === "string" ? back : undefined} /> : null}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.fill}
      >
        <ScrollView
          contentContainerStyle={[
            styles[layout],
            {
              paddingTop: back ? 12 : layout === "dashboard" ? 4 : 6,
              paddingBottom: underTabBar ? tabBarSpace : 12,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          refreshControl={refreshControl}
          showsVerticalScrollIndicator={false}
        >
          {children}
          {footer ? (
            <>
              <View style={styles.fill} />
              {footer}
            </>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** The bar above a screen opened from another: a back button, and the screen's title if any. */
function BackHeader({ title }: { title?: string }) {
  const colors = useColors();
  return (
    <View style={styles.backHeader}>
      <Pressable
        accessibilityLabel="Back"
        accessibilityRole="button"
        hitSlop={8}
        onPress={goBack}
        style={styles.backButton}
      >
        <CaretLeftIcon size={24} color={colors.text} weight="bold" />
      </Pressable>
      {title ? (
        <Text
          accessibilityRole="header"
          numberOfLines={1}
          style={[type.headline, styles.backTitle, { color: colors.text }]}
        >
          {title}
        </Text>
      ) : null}
    </View>
  );
}

/** Back to the screen before, or to the start for a screen an emailed link opened. */
function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace("/");
}

/** A screen's title, and the sentence under it. */
export function Heading({ title, children }: { title: string; children?: ReactNode }) {
  const colors = useColors();
  return (
    <View style={styles.heading}>
      <Text accessibilityRole="header" style={[type.title, { color: colors.text }]}>
        {title}
      </Text>
      {children ? (
        <Text style={[type.body, { color: colors.textSecondary }]}>{children}</Text>
      ) : null}
    </View>
  );
}

export function Body({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  const colors = useColors();
  return (
    <Text style={[type.body, { color: muted ? colors.textMuted : colors.textSecondary }]}>
      {children}
    </Text>
  );
}

export function Button({
  title,
  onPress,
  variant = "primary",
  icon: ButtonIcon,
  busy = false,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  /** The brand's blue, black, outlined, gray, or red for what can't be undone. */
  variant?: "primary" | "inverse" | "outline" | "secondary" | "danger";
  icon?: Icon;
  busy?: boolean;
  disabled?: boolean;
}) {
  const colors = useColors();
  const look = {
    primary: {
      background: colors.primary,
      pressed: colors.primaryPressed,
      foreground: colors.onPrimary,
    },
    inverse: {
      background: colors.inverse,
      pressed: colors.inversePressed,
      foreground: colors.onInverse,
    },
    outline: {
      background: colors.background,
      pressed: colors.backgroundPressed,
      foreground: colors.text,
      border: colors.border,
    },
    secondary: { background: colors.fill, pressed: colors.fillPressed, foreground: colors.text },
    danger: {
      background: colors.dangerTint,
      pressed: colors.dangerTintPressed,
      foreground: colors.danger,
    },
  }[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: pressed ? look.pressed : look.background,
          borderColor: look.border,
          borderWidth: look.border ? 1 : 0,
          opacity: disabled ? 0.45 : 1,
        },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={look.foreground} />
      ) : (
        <>
          {ButtonIcon ? <ButtonIcon size={20} color={look.foreground} weight="bold" /> : null}
          <Text style={[styles.buttonText, { color: look.foreground }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

/** A small, round-ended button, for an action inside a card or next to a name. */
export function PillButton({
  title,
  onPress,
  variant = "primary",
  small = false,
}: {
  title: string;
  onPress: () => void;
  variant?: "primary" | "outline";
  small?: boolean;
}) {
  const colors = useColors();
  const filled = variant === "primary";
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        small ? styles.pillSmall : styles.pill,
        filled
          ? { backgroundColor: pressed ? colors.primaryPressed : colors.primary }
          : {
              borderWidth: 1,
              borderColor: small ? colors.border : colors.outline,
              opacity: pressed ? 0.6 : 1,
            },
      ]}
    >
      <Text style={[styles.pillText, { color: filled ? colors.onPrimary : colors.text }]}>
        {title}
      </Text>
    </Pressable>
  );
}

/** A round button with an icon, such as a sheet's close button. */
export function IconButton({
  icon: ButtonIcon,
  label,
  onPress,
  small = false,
}: {
  icon: Icon;
  label: string;
  onPress: () => void;
  small?: boolean;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={small ? 6 : 0}
      onPress={onPress}
      style={({ pressed }) => [
        small ? styles.iconButtonSmall : styles.iconButton,
        { backgroundColor: pressed ? colors.fillPressed : colors.fill },
      ]}
    >
      <ButtonIcon
        size={small ? 16 : 22}
        color={small ? colors.textSecondary : colors.text}
        weight="bold"
      />
    </Pressable>
  );
}

/** A text button in the brand's blue, for moving between screens. */
export function TextLink({ title, onPress }: { title: string; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable accessibilityRole="link" hitSlop={8} onPress={onPress}>
      <Text style={[type.callout, type.link, { color: colors.accent }]}>{title}</Text>
    </Pressable>
  );
}

/**
 * A link to one of the app's legal pages, such as its Terms, inside a sentence. It opens in the
 * browser, at the address in config/site.json.
 */
export function LegalLink({ title, url }: { title: string; url: string }) {
  const colors = useColors();
  return (
    <Text
      accessibilityRole="link"
      onPress={() => void Linking.openURL(url)}
      style={[type.link, { color: colors.accent }]}
    >
      {/* Its words stay on one line, so a link such as Privacy Policy never breaks in two. */}
      {title.replaceAll(" ", " ")}
    </Text>
  );
}

/** The small print under an action, such as agreeing to the Terms: centered, with LegalLinks. */
export function LegalNote({ children }: { children: ReactNode }) {
  const colors = useColors();
  return (
    <Text style={[type.caption, styles.legalNote, { color: colors.textMuted }]}>{children}</Text>
  );
}

/** A sentence that ends with a link, such as "No account yet? Create one". */
export function LinkPrompt({
  text,
  link,
  onPress,
}: {
  text: string;
  link: string;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <View style={styles.prompt}>
      <Text style={[type.callout, { color: colors.textSecondary }]}>{text} </Text>
      <TextLink title={link} onPress={onPress} />
    </View>
  );
}

/**
 * A text field whose label sits inside it, and moves above the text once there is some. A
 * password field has a button that shows the password.
 */
export function Field({
  label,
  secureTextEntry = false,
  value,
  onFocus,
  onBlur,
  ...input
}: { label: string } & TextInputProps) {
  const colors = useColors();
  const field = useRef<ComponentRef<typeof TextInput>>(null);
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(true);
  const raised = focused || Boolean(value);
  return (
    <Pressable
      accessible={false}
      onPress={() => field.current?.focus()}
      style={[
        styles.field,
        focused
          ? {
              borderWidth: 2,
              borderColor: colors.accent,
              paddingHorizontal: 13,
              shadowColor: colors.accent,
              shadowOpacity: 0.18,
            }
          : { borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14 },
      ]}
    >
      <View style={styles.fieldText}>
        <Text
          aria-hidden
          numberOfLines={1}
          style={[raised ? styles.labelRaised : styles.label, { color: colors.textMuted }]}
        >
          {label}
        </Text>
        {/* At rest, the empty input fills the field, under its label, so a tap anywhere starts. */}
        <TextInput
          ref={field}
          accessibilityLabel={label}
          cursorColor={colors.accent}
          selectionColor={colors.accent}
          secureTextEntry={secureTextEntry && hidden}
          value={value}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          style={[styles.input, raised ? null : styles.inputAtRest, { color: colors.text }]}
          {...input}
        />
      </View>
      {secureTextEntry ? (
        <Pressable
          accessibilityLabel={hidden ? "Show password" : "Hide password"}
          accessibilityRole="button"
          hitSlop={10}
          onPress={() => setHidden(!hidden)}
        >
          {hidden ? (
            <EyeIcon size={22} color={colors.textMuted} weight="bold" />
          ) : (
            <EyeSlashIcon size={22} color={colors.textMuted} weight="bold" />
          )}
        </Pressable>
      ) : null}
    </Pressable>
  );
}

/** A rule a new password must follow, ticked once it does. */
export function Requirement({ met, children }: { met: boolean; children: string }) {
  const colors = useColors();
  return (
    <View style={styles.requirement}>
      {met ? (
        <CheckIcon size={16} color={colors.accent} weight="bold" />
      ) : (
        <MinusIcon size={16} color={colors.textFaint} weight="bold" />
      )}
      <Text style={[type.callout, { color: met ? colors.text : colors.textMuted }]}>
        {children}
      </Text>
    </View>
  );
}

/** A message about what just happened, such as an error or a sent email. */
export function Notice({ tone, children }: { tone: "error" | "success"; children: ReactNode }) {
  const colors = useColors();
  const error = tone === "error";
  const color = error ? colors.danger : colors.success;
  const NoticeIcon = error ? WarningCircleIcon : CheckCircleIcon;
  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityRole={error ? "alert" : "text"}
      style={[styles.notice, { backgroundColor: error ? colors.dangerTint : colors.successTint }]}
    >
      <NoticeIcon size={20} color={color} weight="fill" />
      <Text style={[type.callout, styles.noticeText, { color }]}>{children}</Text>
    </View>
  );
}

/** A round badge with the initials of a name, or the first letter of an email address. */
export function Avatar({
  name,
  size = 44,
  primary = false,
}: {
  name: string;
  size?: number;
  primary?: boolean;
}) {
  const colors = useColors();
  return (
    <View
      aria-hidden
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: primary ? colors.primary : colors.fill,
        },
      ]}
    >
      <Text
        style={{
          fontFamily: font.semibold,
          fontSize: Math.round(size * 0.34),
          color: primary ? colors.onPrimary : colors.text,
        }}
      >
        {initials(name)}
      </Text>
    </View>
  );
}

/** The first letter of each of a name's first two words, such as MO for Maya Okafor. */
function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? "")
    .join("")
    .toUpperCase();
}

/** The app's mark, the image of its splash screen (assets/splash-icon.png), in one color. */
export function Mark({ size, color }: { size: number; color: string }) {
  return (
    <Image
      resizeMode="contain"
      source={mark}
      style={{ width: size, height: size, tintColor: color }}
    />
  );
}

/** A titled group of rows, as in the settings. */
export function ListSection({ title, children }: { title: string; children: ReactNode }) {
  const colors = useColors();
  return (
    <View>
      <Text
        accessibilityRole="header"
        style={[type.section, styles.sectionTitle, { color: colors.textMuted }]}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

/**
 * A row with its icon and its label, that opens another screen, or with `toggle`, a switch that
 * turns a setting on and off.
 */
export function ListRow({
  icon: RowIcon,
  label,
  onPress,
  toggle,
}: {
  icon: Icon;
  label: string;
  onPress?: () => void;
  toggle?: { value: boolean; onChange: (value: boolean) => void };
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole={toggle ? "switch" : "button"}
      accessibilityState={toggle ? { checked: toggle.value } : undefined}
      onPress={toggle ? () => toggle.onChange(!toggle.value) : onPress}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: colors.hairline, opacity: pressed && !toggle ? 0.6 : 1 },
      ]}
    >
      <RowIcon size={22} color={colors.text} />
      <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
      {toggle ? (
        <Switch
          ios_backgroundColor={colors.divider}
          onValueChange={toggle.onChange}
          thumbColor={colors.background}
          trackColor={{ true: colors.inverse, false: colors.divider }}
          value={toggle.value}
        />
      ) : (
        <CaretRightIcon size={14} color={colors.chevron} weight="bold" />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  form: { flexGrow: 1, paddingHorizontal: 24, gap: 12 },
  list: { flexGrow: 1, paddingHorizontal: 24, gap: 24 },
  dashboard: { flexGrow: 1, paddingHorizontal: 16, gap: 18 },
  backHeader: { height: 44, paddingHorizontal: 8, flexDirection: "row", alignItems: "center" },
  backButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center", zIndex: 1 },
  backTitle: { position: "absolute", left: 52, right: 52, textAlign: "center" },
  heading: { gap: 6, marginBottom: 12 },
  button: {
    height: 52,
    borderRadius: radius.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 16,
  },
  buttonText: { fontFamily: font.semibold, fontSize: 17, letterSpacing: -0.2 },
  pill: {
    height: 40,
    paddingHorizontal: 20,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  pillSmall: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  pillText: { fontFamily: font.semibold, fontSize: 14 },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  iconButtonSmall: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  legalNote: { textAlign: "center", marginTop: 2 },
  prompt: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
  },
  field: {
    height: 62,
    borderRadius: radius.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    shadowOpacity: 0,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
  },
  fieldText: { flex: 1, alignSelf: "stretch", justifyContent: "center" },
  label: { fontFamily: font.medium, fontSize: 17 },
  labelRaised: { fontFamily: font.medium, fontSize: 12, marginBottom: 2 },
  input: { height: 24, padding: 0, fontFamily: font.regular, fontSize: 17 },
  inputAtRest: { position: "absolute", top: 0, right: 0, left: 0, height: "100%" },
  requirement: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 4,
    paddingTop: 6,
  },
  notice: { flexDirection: "row", gap: 10, borderRadius: radius.md, padding: 14 },
  noticeText: { flex: 1, lineHeight: 21 },
  avatar: { alignItems: "center", justifyContent: "center" },
  sectionTitle: { paddingBottom: 4 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    minHeight: 52,
    borderBottomWidth: 1,
  },
  rowLabel: { flex: 1, fontFamily: font.regular, fontSize: 17 },
});
