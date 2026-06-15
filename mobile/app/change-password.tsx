import { useState } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { LinenScreen } from "../components/LinenScreen";
import { Topbar } from "../components/linen";
import { Btn } from "../components/linen";
import { Card, Field, InlineErr } from "../components/linen/extras";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";
import { useT } from "../lib/i18n";
import { T as TH, font } from "../lib/theme";
import { ROLE_HOME } from "../lib/types";

export default function ForceChangePassword() {
  const { profile, refresh } = useAuth();
  const { t, locale } = useT();
  const router = useRouter();
  const [nw, setNw] = useState("");
  const [cf, setCf] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setErr("");
    if (nw.length < 8) return setErr(t("settings.pw.err.len"));
    if (nw !== cf) return setErr(t("settings.pw.err.match"));
    const uid = profile?.id;
    if (!uid) return setErr(t("pwf.failed"));
    setBusy(true);

    // Change the password directly against Supabase — the phone always reaches
    // Supabase (unlike our web server), and changing your own password keeps
    // you signed in. GoTrue rejects reusing the current password here.
    const { error } = await supabase.auth.updateUser({ password: nw });
    if (error) {
      setBusy(false);
      setErr(error.message);
      return;
    }

    // Clear the first-login flag. The password change rotated the session
    // token, so retry and read back to confirm it actually cleared (the cause
    // of the "asks every login" bug when this failed silently).
    let cleared = false;
    for (let i = 0; i < 4 && !cleared; i++) {
      if (i > 0) await new Promise((r) => setTimeout(r, 500));
      await supabase.rpc("clear_must_change_password");
      const { data: p } = await supabase
        .from("profiles")
        .select("must_change_password")
        .eq("id", uid)
        .maybeSingle();
      cleared = p?.must_change_password === false;
    }
    if (!cleared) {
      setBusy(false);
      setErr(t("pwf.failed"));
      return;
    }

    await refresh();
    setBusy(false);
    router.replace(
      (profile ? ROLE_HOME[profile.role] : "/login") as "/(retailer)",
    );
  };

  return (
    <LinenScreen topbar={<Topbar title={t("pwf.title")} locale={locale} />}>
      <Text
        style={{
          fontSize: 14.5,
          lineHeight: 22,
          color: TH.ink2,
          fontFamily: font(500, locale),
          marginHorizontal: 4,
          marginBottom: 14,
        }}
      >
        {t("pwf.sub")}
      </Text>
      <Card>
        <Field
          label={t("settings.new_password")}
          value={nw}
          onChangeText={setNw}
          secureTextEntry
          hint={t("settings.pw.hint")}
          locale={locale}
        />
        <Field
          label={t("settings.confirm_password")}
          value={cf}
          onChangeText={setCf}
          secureTextEntry
          locale={locale}
        />
        {err ? <InlineErr locale={locale}>{err}</InlineErr> : null}
        <View style={{ height: 14 }} />
        <Btn
          title={t("settings.update_password")}
          busyLabel={t("settings.updating")}
          loading={busy}
          disabled={nw.length < 8 || nw !== cf}
          onPress={submit}
          locale={locale}
        />
      </Card>
    </LinenScreen>
  );
}
