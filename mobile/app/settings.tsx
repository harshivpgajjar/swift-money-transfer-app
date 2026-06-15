import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import {
  ArrowLeft,
  Check,
  Plus,
  Power,
  Shield,
  Trash2,
} from "lucide-react-native";
import { LinenScreen } from "../components/LinenScreen";
import { Topbar, IconBtn, Btn, SectionLabel } from "../components/linen";
import { Card, Field, KV, Divider, InlineErr } from "../components/linen/extras";
import {
  Selectt,
  Switch,
  Toast,
  ToggleRow,
  type ToastState,
} from "../components/linen/more";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";
import { createClient as createBareClient } from "@supabase/supabase-js";
import { useT, LOCALES, LOCALE_LABEL, type Locale } from "../lib/i18n";
import { T as TH, font } from "../lib/theme";
import { formatDate } from "../lib/format";
import type { Profile } from "../lib/types";

/* Columns added by migration 0013 — not yet on the shared Profile type. */
type NotificationPrefs = {
  approved?: boolean;
  cash?: boolean;
  incoming?: boolean;
};
type ProfileSettings = Profile & {
  notification_prefs?: NotificationPrefs | null;
  default_fos_auto_approve?: boolean;
};

type AcctRow = { id: string; name: string; slug: string; active: boolean };

const TZ_OPTIONS = [
  { value: "Asia/Kolkata", label: "Asia/Kolkata (IST)" },
  { value: "Asia/Dubai", label: "Asia/Dubai (GST)" },
  { value: "UTC", label: "UTC" },
];

const NEG_BORDER = "rgba(194, 104, 61, 0.35)"; // .danger-card border
const NEG_SOFT = "rgba(194, 104, 61, 0.14)"; // danger icon chip bg

/* Design Msg — ok variant of the inline message (InlineErr covers err). */
function OkMsg({ children, locale }: { children: ReactNode; locale: Locale }) {
  return (
    <View
      style={{ flexDirection: "row", alignItems: "center", gap: 7, marginTop: 12 }}
    >
      <Check size={15} color={TH.accentInk} strokeWidth={2.2} />
      <Text
        style={{
          color: TH.accentInk,
          fontSize: 13,
          fontFamily: font(600, locale),
          flex: 1,
        }}
      >
        {children}
      </Text>
    </View>
  );
}

/* Design .set-link rendered as an in-card row (icon chip + label + chevron). */
function SetLink({
  icon,
  label,
  onPress,
  iconBg,
  locale,
}: {
  icon: ReactNode;
  label: string;
  onPress: () => void;
  iconBg?: string;
  locale: Locale;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: 8,
        transform: pressed ? [{ scale: 0.99 }] : [],
      })}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1 }}>
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            backgroundColor: iconBg ?? TH.accentSoft,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {icon}
        </View>
        <Text
          style={{ fontSize: 14.5, fontFamily: font(700, locale), color: TH.ink }}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

export default function Settings() {
  const { profile: rawProfile, signOut, refresh } = useAuth();
  const profile = rawProfile as ProfileSettings | null;
  const { t, locale, setLocale } = useT();
  const router = useRouter();

  const [toast, setToast] = useState<ToastState>(null);
  const [authEmail, setAuthEmail] = useState<string | null>(null);

  /* Account section (retailer extras) */
  const [fosName, setFosName] = useState<string | null>(null);
  const [distName, setDistName] = useState<string | null>(null);

  /* Edit profile */
  const [name, setName] = useState(profile?.full_name ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [tz, setTz] = useState(profile?.timezone ?? "Asia/Kolkata");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [profileErr, setProfileErr] = useState<string | null>(null);

  /* Change password */
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [savingPwd, setSavingPwd] = useState(false);
  const [pwdMsg, setPwdMsg] = useState<string | null>(null);
  const [pwdErr, setPwdErr] = useState<string | null>(null);

  /* Email change */

  /* Notifications — design defaults everything to on; '{}' in DB means on. */
  const prefs = profile?.notification_prefs ?? {};
  const [notif, setNotif] = useState({
    approved: prefs.approved !== false,
    cash: prefs.cash !== false,
    incoming: prefs.incoming !== false,
  });

  /* Distributor: accounts + auto-approve defaults */
  const [accts, setAccts] = useState<AcctRow[]>([]);
  const [adding, setAdding] = useState(false);
  const [newAcctName, setNewAcctName] = useState("");
  const [newAcctSlug, setNewAcctSlug] = useState("");
  const [savingAcct, setSavingAcct] = useState(false);
  const [defAuto, setDefAuto] = useState(!!profile?.default_fos_auto_approve);

  const profileId = profile?.id ?? null;
  const role = profile?.role ?? null;
  const fosId = profile?.fos_id ?? null;
  const distId = profile?.distributor_id ?? null;

  useEffect(() => {
    supabase.auth
      .getUser()
      .then(({ data }) => setAuthEmail(data.user?.email ?? null))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (role !== "retailer") return;
    (async () => {
      const [fos, dist] = await Promise.all([
        fosId
          ? supabase.from("profiles").select("full_name").eq("id", fosId).maybeSingle()
          : Promise.resolve({ data: null as { full_name: string } | null }),
        distId
          ? supabase.from("profiles").select("full_name").eq("id", distId).maybeSingle()
          : Promise.resolve({ data: null as { full_name: string } | null }),
      ]);
      setFosName(fos.data?.full_name ?? null);
      setDistName(dist.data?.full_name ?? null);
    })();
  }, [role, fosId, distId]);

  const loadAccounts = useCallback(async () => {
    if (!profileId) return;
    const { data } = await supabase
      .from("accounts")
      .select("id, name, slug, active")
      .eq("distributor_id", profileId)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true });
    setAccts((data ?? []) as AcctRow[]);
  }, [profileId]);

  useEffect(() => {
    if (role === "distributor") loadAccounts();
  }, [role, loadAccounts]);

  if (!profile) return null;

  /* ── handlers ───────────────────────────────────────────── */

  async function saveProfile() {
    setProfileErr(null);
    setProfileMsg(null);
    if (phone && !/^[+\d][\d ]{7,}$/.test(phone)) {
      setProfileErr(t("settings.err.phone"));
      return;
    }
    setSavingProfile(true);
    const { error } = await supabase.rpc("update_own_profile", {
      p_full_name: name,
      p_phone: phone,
      p_timezone: tz,
    });
    setSavingProfile(false);
    if (error) setProfileErr(error.message);
    else {
      setProfileMsg(t("settings.profile_saved"));
      setToast({ msg: t("settings.profile_saved") });
      refresh();
    }
  }

  async function changePassword() {
    setPwdErr(null);
    setPwdMsg(null);
    if (!currentPwd) {
      setPwdErr(t("settings.pw.err.current"));
      return;
    }
    if (newPwd.length < 8) {
      setPwdErr(t("settings.pw.err.len"));
      return;
    }
    if (newPwd === currentPwd) {
      setPwdErr(t("settings.pw.err.same"));
      return;
    }
    if (newPwd !== confirmPwd) {
      setPwdErr(t("settings.pw.err.match"));
      return;
    }
    setSavingPwd(true);
    const email =
      authEmail ?? (await supabase.auth.getUser()).data.user?.email ?? "";
    // Verify with a throwaway client: signing in on the live client would
    // replace the session and re-trigger the auth listener mid-update.
    const verifier = createBareClient(
      process.env.EXPO_PUBLIC_SUPABASE_URL!,
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
    );
    const { error: verifyErr } = await verifier.auth.signInWithPassword({
      email,
      password: currentPwd,
    });
    if (verifyErr) {
      setSavingPwd(false);
      setPwdErr(t("settings.pw.err.wrong"));
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: newPwd });
    setSavingPwd(false);
    if (error) setPwdErr(error.message);
    else {
      setPwdMsg(t("settings.pw.updated"));
      setCurrentPwd("");
      setNewPwd("");
      setConfirmPwd("");
    }
  }


  async function setNotifPref(key: keyof typeof notif, v: boolean) {
    const prev = notif;
    const next = { ...notif, [key]: v };
    setNotif(next);
    const { error } = await supabase.rpc("update_own_profile", {
      p_notification_prefs: next,
    });
    if (error) {
      setNotif(prev);
      setToast({ msg: error.message, kind: "neg" });
    } else refresh();
  }

  async function renameAccount(id: string, acctName: string) {
    const { error } = await supabase
      .from("accounts")
      .update({ name: acctName })
      .eq("id", id);
    if (error) {
      setToast({ msg: error.message, kind: "neg" });
      loadAccounts();
    }
  }

  async function toggleAccount(id: string, active: boolean) {
    const prev = accts;
    setAccts(accts.map((a) => (a.id === id ? { ...a, active } : a)));
    const { error } = await supabase
      .from("accounts")
      .update({ active })
      .eq("id", id);
    if (error) {
      setAccts(prev);
      setToast({ msg: error.message, kind: "neg" });
    }
  }

  async function addAccount() {
    if (!profile || !newAcctName.trim() || !newAcctSlug.trim()) return;
    setSavingAcct(true);
    const { error } = await supabase.from("accounts").insert({
      distributor_id: profile.id,
      name: newAcctName.trim(),
      slug: newAcctSlug.trim(),
      active: true,
      display_order: accts.length,
    });
    setSavingAcct(false);
    if (error) {
      setToast({ msg: error.message, kind: "neg" });
      return;
    }
    setNewAcctName("");
    setNewAcctSlug("");
    setAdding(false);
    setToast({ msg: t("settings.accounts.added") });
    loadAccounts();
  }

  async function toggleDefaultAutoApprove(v: boolean) {
    const prev = defAuto;
    setDefAuto(v);
    const { error } = await supabase.rpc("update_own_profile", {
      p_default_fos_auto_approve: v,
    });
    if (error) {
      setDefAuto(prev);
      setToast({ msg: error.message, kind: "neg" });
    } else refresh();
  }

  async function signOutEverywhere() {
    await supabase.auth.signOut({ scope: "global" }).catch(() => {});
    await signOut();
  }

  const roleLabel =
    profile.role === "distributor"
      ? t("settings.distributor")
      : profile.role === "fos"
      ? t("settings.fos")
      : t("settings.retailer");

  const isDist = profile.role === "distributor";

  return (
    <View style={{ flex: 1 }}>
      <LinenScreen
        bottomInset={40}
        topbar={
          <Topbar
            title={t("settings.title")}
            locale={locale}
            right={
              <IconBtn onPress={() => router.back()}>
                <ArrowLeft size={18} color={TH.ink} />
              </IconBtn>
            }
          />
        }
      >
        {/* ── Account ─────────────────────────────────────── */}
        <SectionLabel locale={locale} style={{ marginTop: 4 }}>
          {t("settings.account")}
        </SectionLabel>
        <Card>
          <View style={{ paddingTop: 4 }}>
            <KV k={t("settings.full_name")} v={profile.full_name} locale={locale} />
            <KV k={t("settings.email")} v={authEmail ?? "—"} locale={locale} />
            <KV k={t("settings.role")} v={roleLabel} locale={locale} />
            <KV
              k={t("settings.member_since")}
              v={formatDate(profile.created_at)}
              locale={locale}
            />
            {profile.role === "retailer" && (
              <>
                <KV
                  k={t("settings.retailer_code")}
                  v={profile.retailer_code ?? "—"}
                  locale={locale}
                />
                <KV k={t("settings.fos_short")} v={fosName ?? "—"} locale={locale} />
                <KV
                  k={t("settings.distributor")}
                  v={distName ?? "—"}
                  locale={locale}
                />
              </>
            )}
            {profile.role === "fos" && (
              <KV
                k={t("settings.auto_approve")}
                v={
                  <>
                    {profile.fos_auto_approve
                      ? t("settings.on")
                      : t("settings.off")}{" "}
                    <Text
                      style={{
                        color: TH.ink3,
                        fontFamily: font(500, locale),
                        fontSize: 12,
                      }}
                    >
                      · {t("settings.managed_by_dist")}
                    </Text>
                  </>
                }
                locale={locale}
              />
            )}
          </View>
        </Card>

        {/* ── Edit profile ────────────────────────────────── */}
        <SectionLabel locale={locale}>{t("settings.edit_profile")}</SectionLabel>
        <Card>
          <Field
            label={t("settings.full_name")}
            value={name}
            onChangeText={setName}
            locale={locale}
          />
          <Field
            label={t("settings.phone")}
            value={phone}
            onChangeText={setPhone}
            placeholder="+91 …"
            keyboardType="phone-pad"
            locale={locale}
          />
          <Selectt
            label={t("settings.timezone")}
            value={tz}
            onChange={setTz}
            options={TZ_OPTIONS}
            locale={locale}
          />
          {profileErr ? <InlineErr locale={locale}>{profileErr}</InlineErr> : null}
          {profileMsg ? <OkMsg locale={locale}>{profileMsg}</OkMsg> : null}
          <View style={{ height: 14 }} />
          <Btn
            title={t("settings.save")}
            busyLabel={t("settings.saving")}
            loading={savingProfile}
            onPress={saveProfile}
            locale={locale}
          />
        </Card>

        {/* ── Change password ─────────────────────────────── */}
        <SectionLabel locale={locale}>{t("settings.change_password")}</SectionLabel>
        <Card>
          <Field
            label={t("settings.current_password")}
            value={currentPwd}
            onChangeText={setCurrentPwd}
            secureTextEntry
            locale={locale}
          />
          <Field
            label={t("settings.new_password")}
            value={newPwd}
            onChangeText={setNewPwd}
            secureTextEntry
            hint={t("settings.pw.hint")}
            locale={locale}
          />
          <Field
            label={t("settings.confirm_password")}
            value={confirmPwd}
            onChangeText={setConfirmPwd}
            secureTextEntry
            locale={locale}
          />
          {pwdErr ? <InlineErr locale={locale}>{pwdErr}</InlineErr> : null}
          {pwdMsg ? <OkMsg locale={locale}>{pwdMsg}</OkMsg> : null}
          <View style={{ height: 14 }} />
          <Btn
            title={t("settings.update_password")}
            busyLabel={t("settings.updating")}
            loading={savingPwd}
            onPress={changePassword}
            locale={locale}
          />
        </Card>

        {/* ── Notifications ───────────────────────────────── */}
        <SectionLabel locale={locale}>{t("settings.notifications")}</SectionLabel>
        <Card>
          <ToggleRow
            first
            title={t("settings.notif.approved")}
            on={notif.approved}
            onChange={(v) => setNotifPref("approved", v)}
            locale={locale}
          />
          <ToggleRow
            title={t("settings.notif.cash")}
            on={notif.cash}
            onChange={(v) => setNotifPref("cash", v)}
            locale={locale}
          />
          {(profile.role === "fos" || profile.role === "distributor") && (
            <ToggleRow
              title={t("settings.notif.incoming")}
              on={notif.incoming}
              onChange={(v) => setNotifPref("incoming", v)}
              locale={locale}
            />
          )}
        </Card>

        {/* ── Language (kept from product; not in design) ──── */}
        <SectionLabel locale={locale}>{t("settings.language")}</SectionLabel>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {LOCALES.map((l: Locale) => {
            const on = l === locale;
            return (
              <Pressable
                key={l}
                onPress={() => setLocale(l)}
                style={{
                  flex: 1,
                  height: 48,
                  borderRadius: TH.rMd,
                  backgroundColor: on ? TH.accent : TH.surface,
                  borderWidth: 1,
                  borderColor: on ? "transparent" : TH.border,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    fontFamily: font(700, l),
                    color: on ? TH.onAccent : TH.ink,
                    fontSize: 15,
                  }}
                >
                  {LOCALE_LABEL[l]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* ── Distributor: Accounts + Auto-approve defaults ── */}
        {isDist && (
          <>
            <SectionLabel locale={locale}>{t("settings.accounts")}</SectionLabel>
            <Card>
              {accts.map((a, i) => (
                <View
                  key={a.id}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 14,
                    paddingVertical: 13,
                    borderTopWidth: i === 0 ? 0 : 1,
                    borderTopColor: TH.border,
                  }}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <TextInput
                      value={a.name}
                      onChangeText={(v) =>
                        setAccts(
                          accts.map((x) => (x.id === a.id ? { ...x, name: v } : x))
                        )
                      }
                      onEndEditing={(e) =>
                        renameAccount(a.id, e.nativeEvent.text)
                      }
                      style={{
                        fontSize: 14.5,
                        fontFamily: font(700, locale),
                        color: TH.ink,
                        padding: 0,
                      }}
                    />
                    <Text
                      style={{
                        fontSize: 12.5,
                        color: TH.ink3,
                        marginTop: 2,
                        fontFamily: font(500, locale),
                      }}
                    >
                      {t("settings.accounts.slug")} · {a.slug}
                    </Text>
                  </View>
                  <Switch on={a.active} onChange={(v) => toggleAccount(a.id, v)} />
                </View>
              ))}
              {adding ? (
                <View style={{ marginTop: 12 }}>
                  <Field
                    label={t("settings.accounts.display")}
                    value={newAcctName}
                    onChangeText={setNewAcctName}
                    placeholder="e.g. Acme Telecom"
                    locale={locale}
                  />
                  <Field
                    label={t("settings.accounts.slug")}
                    value={newAcctSlug}
                    onChangeText={setNewAcctSlug}
                    hint={t("settings.accounts.slug_hint")}
                    placeholder="acme"
                    inputProps={{ autoCapitalize: "none", autoCorrect: false }}
                    locale={locale}
                  />
                  <Btn
                    title={t("settings.accounts.save")}
                    loading={savingAcct}
                    disabled={!newAcctName.trim() || !newAcctSlug.trim()}
                    onPress={addAccount}
                    locale={locale}
                  />
                </View>
              ) : (
                <Pressable
                  onPress={() => setAdding(true)}
                  style={{
                    marginTop: 14,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    alignSelf: "flex-start",
                  }}
                >
                  <Plus size={16} color={TH.accentInk} strokeWidth={2.4} />
                  <Text
                    style={{
                      color: TH.accentInk,
                      fontFamily: font(700, locale),
                      fontSize: 14,
                    }}
                  >
                    {t("settings.accounts.add")}
                  </Text>
                </Pressable>
              )}
            </Card>

            <SectionLabel locale={locale}>{t("settings.autoappr")}</SectionLabel>
            <Card>
              <ToggleRow
                first
                title={t("settings.autoappr.default")}
                sub={t("settings.autoappr.sub")}
                on={defAuto}
                onChange={toggleDefaultAutoApprove}
                locale={locale}
              />
              <Divider />
              <Pressable
                onPress={() => router.push("/(distributor)/users" as never)}
                style={{ alignSelf: "flex-start" }}
              >
                <Text
                  style={{
                    color: TH.accentInk,
                    fontFamily: font(700, locale),
                    fontSize: 14,
                  }}
                >
                  {t("settings.autoappr.manage")}
                </Text>
              </Pressable>
            </Card>
          </>
        )}

        {/* ── Devices & sessions ──────────────────────────── */}
        <SectionLabel locale={locale}>{t("settings.devices")}</SectionLabel>
        <Card>
          <SetLink
            icon={<Power size={17} color={TH.accentInk} />}
            label={t("settings.signout_device")}
            onPress={signOut}
            locale={locale}
          />
          <Divider />
          <SetLink
            icon={<Shield size={17} color={TH.accentInk} />}
            label={t("settings.signout_all")}
            onPress={signOutEverywhere}
            locale={locale}
          />
        </Card>

        {/* ── Danger zone (distributor) ───────────────────── */}
        {isDist && (
          <>
            <SectionLabel locale={locale} style={{ color: TH.neg }}>
              {t("settings.danger")}
            </SectionLabel>
            <Card style={{ borderColor: NEG_BORDER }}>
              <SetLink
                icon={<Trash2 size={17} color={TH.neg} />}
                iconBg={NEG_SOFT}
                label={t("settings.delete_user")}
                onPress={() => router.push("/(distributor)/users" as never)}
                locale={locale}
              />
              <Text
                style={{
                  fontSize: 12.5,
                  color: TH.ink2,
                  lineHeight: 21,
                  marginTop: 8,
                  fontFamily: font(500, locale),
                }}
              >
                {t("settings.delete_note")}
              </Text>
            </Card>
          </>
        )}

        <View style={{ height: 8 }} />
      </LinenScreen>
      <Toast toast={toast} onDone={() => setToast(null)} locale={locale} />
    </View>
  );
}
