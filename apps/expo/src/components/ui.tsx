import type { ReactNode } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ScrollViewProps,
  type TextInputProps,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { radius, space, useColors } from "@/lib/theme";

/**
 * A scrolling screen that keeps clear of the system bars and the keyboard. Screens under a
 * navigation header leave the top to it.
 */
export function Screen({
  children,
  header = false,
  refreshControl,
}: {
  children: ReactNode;
  header?: boolean;
  refreshControl?: ScrollViewProps["refreshControl"];
}) {
  const colors = useColors();
  return (
    <SafeAreaView
      edges={header ? ["bottom", "left", "right"] : ["top", "bottom", "left", "right"]}
      style={[styles.fill, { backgroundColor: colors.background }]}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.fill}
      >
        <ScrollView
          contentContainerStyle={styles.screen}
          keyboardShouldPersistTaps="handled"
          refreshControl={refreshControl}
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function Title({ children }: { children: ReactNode }) {
  const colors = useColors();
  return (
    <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
      {children}
    </Text>
  );
}

export function Body({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  const colors = useColors();
  return (
    <Text style={[styles.body, { color: muted ? colors.muted : colors.text }]}>{children}</Text>
  );
}

export function Card({ title, children }: { title?: string; children: ReactNode }) {
  const colors = useColors();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {title ? (
        <Text accessibilityRole="header" style={[styles.cardTitle, { color: colors.text }]}>
          {title}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

export function Button({
  title,
  onPress,
  variant = "primary",
  busy = false,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger";
  busy?: boolean;
  disabled?: boolean;
}) {
  const colors = useColors();
  const filled = variant !== "secondary";
  const background = variant === "danger" ? colors.danger : colors.primary;
  const foreground = filled ? colors.onPrimary : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: filled ? background : "transparent",
          borderColor: filled ? background : colors.border,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={foreground} />
      ) : (
        <Text style={[styles.buttonText, { color: foreground }]}>{title}</Text>
      )}
    </Pressable>
  );
}

/** A text button, for moving between screens. */
export function TextLink({ title, onPress }: { title: string; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable accessibilityRole="link" hitSlop={8} onPress={onPress}>
      <Text style={[styles.link, { color: colors.primary }]}>{title}</Text>
    </Pressable>
  );
}

export function Field({ label, ...input }: { label: string } & TextInputProps) {
  const colors = useColors();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        style={[
          styles.input,
          { color: colors.text, borderColor: colors.border, backgroundColor: colors.background },
        ]}
        {...input}
      />
    </View>
  );
}

/** A message about what just happened, such as an error or a sent email. */
export function Notice({
  tone = "info",
  children,
}: {
  tone?: "info" | "error" | "success";
  children: ReactNode;
}) {
  const colors = useColors();
  const color =
    tone === "error" ? colors.danger : tone === "success" ? colors.success : colors.text;
  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityRole={tone === "error" ? "alert" : "text"}
      style={[styles.notice, { borderColor: color }]}
    >
      <Text style={[styles.body, { color }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  screen: { padding: space.xl, gap: space.lg },
  title: { fontSize: 28, fontWeight: "700" },
  body: { fontSize: 16, lineHeight: 22 },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.md,
  },
  cardTitle: { fontSize: 18, fontWeight: "600" },
  button: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.lg,
  },
  buttonText: { fontSize: 16, fontWeight: "600" },
  link: { fontSize: 16, fontWeight: "500", paddingVertical: space.xs },
  field: { gap: space.xs },
  label: { fontSize: 14, fontWeight: "500" },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    fontSize: 16,
  },
  notice: { borderWidth: 1, borderRadius: radius.md, padding: space.md },
});
