import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { Redirect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Eye, EyeOff, Mail, Lock, Shield } from "lucide-react-native";
import { useAuth } from "../lib/auth";
import { LOCALES, LOCALE_LABEL, useT, type Locale } from "../lib/i18n";
import { ROLE_HOME } from "../lib/types";
import { T, font } from "../lib/theme";

export default function LoginScreen() {
  const { profile, signIn, loading } = useAuth();
  const { locale, setLocale, t } = useT();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [emailFocus, setEmailFocus] = useState(false);
  const [pwFocus, setPwFocus] = useState(false);
  const [showPw, setShowPw] = useState(false);

  if (!loading && profile) {
    if (profile.must_change_password) {
      return <Redirect href={"/change-password" as "/login"} />;
    }
    return (
      <Redirect
        href={ROLE_HOME[profile.role] as "/(distributor)" | "/(fos)" | "/(retailer)"}
      />
    );
  }

  async function onSubmit() {
    setError(null);
    if (!email.trim() || !password.trim()) {
      setError(t("login.err.invalid"));
      return;
    }
    setSubmitting(true);
    const result = await signIn(email.trim(), password);
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.replace("/");
  }

  const fieldShellStyle = (focused: boolean) =>
    ({
      height: 56,
      paddingHorizontal: 15,
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 9,
      borderRadius: T.rMd,
      backgroundColor: T.surface,
      borderWidth: 1.5,
      borderColor: focused ? T.accent : T.border,
    }) as const;

  return (
    <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: T.bg }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <View
          style={{
            flex: 1,
            paddingHorizontal: 30,
            paddingTop: 10,
            paddingBottom: 26,
          }}
        >
          {/* Language pills */}
          <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 6 }}>
            {LOCALES.map((l: Locale) => {
              const on = l === locale;
              return (
                <Pressable
                  key={l}
                  onPress={() => setLocale(l)}
                  android_ripple={{ color: T.border2, borderless: false, radius: 19 }}
                  style={{
                    width: 38,
                    height: 32,
                    borderRadius: 10,
                    backgroundColor: on ? T.accent : T.surface,
                    borderWidth: 1,
                    borderColor: on ? "transparent" : T.border,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontFamily: font(700, l),
                      color: on ? T.onAccent : T.ink2,
                    }}
                  >
                    {LOCALE_LABEL[l]}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Hero */}
          <View style={{ marginTop: "auto", marginBottom: 30, alignItems: "center" }}>
            <View
              style={{
                width: 66,
                height: 66,
                borderRadius: 18,
                backgroundColor: T.accent,
                alignItems: "center",
                justifyContent: "center",
                shadowColor: T.accent,
                shadowOpacity: 0.35,
                shadowRadius: 24,
                shadowOffset: { width: 0, height: 14 },
                elevation: 10,
              }}
            >
              <Text
                style={{
                  color: T.onAccent,
                  fontSize: 34,
                  fontFamily: font(700, "en", "num"),
                  lineHeight: 38,
                }}
              >
                S
              </Text>
            </View>
            <Text
              style={{
                fontSize: 28,
                fontFamily: font(800, locale),
                letterSpacing: -0.7,
                color: T.ink,
                marginTop: 20,
                textAlign: "center",
              }}
            >
              {t("login.title")}
            </Text>
            <Text
              style={{
                fontSize: 15,
                color: T.ink2,
                marginTop: 6,
                fontFamily: font(500, locale),
                textAlign: "center",
              }}
            >
              {t("login.sub")}
            </Text>
          </View>

          {/* Email */}
          <View style={{ marginBottom: 16 }}>
            <Text
              style={{
                fontSize: 13.5,
                fontFamily: font(600, locale),
                color: T.ink2,
                marginBottom: 7,
                marginLeft: 3,
              }}
            >
              {t("login.email")}
            </Text>
            <View style={fieldShellStyle(emailFocus)}>
              <Mail size={18} color={T.ink3} />
              <TextInput
                value={email}
                onChangeText={setEmail}
                onFocus={() => setEmailFocus(true)}
                onBlur={() => setEmailFocus(false)}
                placeholder="you@shop.in"
                placeholderTextColor={T.ink3}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="username"
                style={{
                  flex: 1,
                  fontSize: 17,
                  fontFamily: font(500, "en"),
                  color: T.ink,
                  paddingVertical: 0,
                }}
              />
            </View>
          </View>

          {/* Password */}
          <View style={{ marginBottom: 16 }}>
            <Text
              style={{
                fontSize: 13.5,
                fontFamily: font(600, locale),
                color: T.ink2,
                marginBottom: 7,
                marginLeft: 3,
              }}
            >
              {t("login.password")}
            </Text>
            <View style={fieldShellStyle(pwFocus)}>
              <Lock size={18} color={T.ink3} />
              <TextInput
                value={password}
                onChangeText={setPassword}
                onFocus={() => setPwFocus(true)}
                onBlur={() => setPwFocus(false)}
                placeholder="••••••••"
                placeholderTextColor={T.ink3}
                secureTextEntry={!showPw}
                textContentType="password"
                style={{
                  flex: 1,
                  fontSize: 17,
                  fontFamily: font(500, "en"),
                  color: T.ink,
                  paddingVertical: 0,
                }}
              />
              <Pressable
                onPress={() => setShowPw((s) => !s)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={showPw ? "Hide password" : "Show password"}
              >
                {showPw ? (
                  <EyeOff size={18} color={T.ink3} />
                ) : (
                  <Eye size={18} color={T.ink3} />
                )}
              </Pressable>
            </View>
          </View>

          {/* Error */}
          {error && (
            <View
              style={{
                backgroundColor: "rgba(194, 104, 61, 0.08)",
                borderColor: "rgba(194, 104, 61, 0.25)",
                borderWidth: 1,
                borderRadius: T.rSm,
                paddingVertical: 10,
                paddingHorizontal: 12,
                marginBottom: 12,
              }}
            >
              <Text
                style={{
                  color: T.neg,
                  fontSize: 13.5,
                  fontFamily: font(600, locale),
                }}
              >
                {error}
              </Text>
            </View>
          )}

          {/* Sign in button — solid background, no function-style */}
          <Pressable
            onPress={onSubmit}
            disabled={submitting}
            android_ripple={{ color: T.accent2 }}
            style={{
              height: 56,
              borderRadius: T.rMd,
              backgroundColor: T.accent,
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "row",
              paddingHorizontal: 22,
              opacity: submitting ? 0.6 : 1,
              shadowColor: T.accent,
              shadowOpacity: 0.35,
              shadowRadius: 24,
              shadowOffset: { width: 0, height: 12 },
              elevation: 8,
              marginTop: 4,
              overflow: "hidden",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 9,
              }}
            >
              {submitting && <ActivityIndicator color={T.onAccent} />}
              <Text
                style={{
                  color: T.onAccent,
                  fontSize: 16.5,
                  fontFamily: font(700, locale),
                  letterSpacing: -0.16,
                }}
              >
                {submitting ? t("login.signing_in") : t("login.signin")}
              </Text>
            </View>
          </Pressable>

          {/* Bank-grade security */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 7,
              marginTop: 18,
            }}
          >
            <Shield size={15} color={T.ink3} />
            <Text
              style={{
                fontSize: 12.5,
                fontFamily: font(600, locale),
                color: T.ink3,
              }}
            >
              {t("login.secure")}
            </Text>
          </View>

          {/* Footer */}
          <Text
            style={{
              textAlign: "center",
              fontSize: 12.5,
              fontFamily: font(400, locale),
              color: T.ink3,
              marginTop: "auto",
              paddingTop: 22,
            }}
          >
            {t("login.footer")}
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
