import { router, useIsFocused } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { EnvelopeSimpleIcon } from "phosphor-react-native/src/icons/EnvelopeSimple";
import { ImageBackground, StyleSheet, Text, View, type ImageSourcePropType } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import site from "@/config/site.json";
import { Button, LegalLink, LegalNote, Mark } from "@/components/ui";
import { font, radius, type, useColors } from "@/lib/theme";

/**
 * A photo of your own for the top of the welcome screen, in place of the brand's blue and the
 * app's mark: add it to assets/, import it above, such as
 * `import welcomePhoto from "../../assets/welcome.jpg";`, and set it here.
 */
const heroPhoto: ImageSourcePropType | null = null;

/** The first screen signed out: what the app is, then signing in or creating an account. */
export default function Welcome() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  // Light status bar text over the hero, while this screen shows.
  const focused = useIsFocused();

  const content = (
    <>
      <StatusBar style={focused ? "light" : "auto"} />
      <View style={[styles.brand, { paddingTop: insets.top + 8 }]}>
        <View
          style={[styles.brandMark, { backgroundColor: heroPhoto ? colors.primary : "#FFFFFF" }]}
        >
          <Mark size={18} color={heroPhoto ? colors.onPrimary : colors.primary} />
        </View>
        <Text style={[styles.brandName, { color: colors.onPrimary }]}>{site.shortName}</Text>
      </View>
      <View style={styles.art}>
        {heroPhoto ? null : <Mark size={128} color={colors.onPrimary} />}
      </View>
      <View
        style={[
          styles.sheet,
          { backgroundColor: colors.background, paddingBottom: insets.bottom + 12 },
        ]}
      >
        <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
          Welcome to {site.name}
        </Text>
        <Text style={[type.body, styles.description, { color: colors.textSecondary }]}>
          {site.description}
        </Text>
        <Button
          title="Continue with email"
          variant="inverse"
          icon={EnvelopeSimpleIcon}
          onPress={() => router.push("/sign-in")}
        />
        <Button title="Create account" variant="outline" onPress={() => router.push("/sign-up")} />
        <View style={styles.legal}>
          <LegalNote>
            By continuing, you agree to the <LegalLink title="Terms" url={site.links.terms} /> and
            the <LegalLink title="Privacy Policy" url={site.links.privacy} />.
          </LegalNote>
        </View>
      </View>
    </>
  );

  return heroPhoto ? (
    <ImageBackground resizeMode="cover" source={heroPhoto} style={styles.screen}>
      {content}
    </ImageBackground>
  ) : (
    <View style={[styles.screen, { backgroundColor: colors.primary }]}>{content}</View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#000000" },
  brand: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 24 },
  brandMark: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  brandName: { fontFamily: font.bold, fontSize: 17 },
  art: { flex: 1, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  sheet: {
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: 24,
    paddingTop: 28,
    gap: 10,
  },
  title: { fontFamily: font.bold, fontSize: 28, letterSpacing: -0.7 },
  description: { marginBottom: 14 },
  // The design's 10 points above the note, with the note's own 2.
  legal: { marginTop: 8 },
});
