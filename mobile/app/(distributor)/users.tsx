import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native";
import { Users as UsersIcon, User as UserIcon } from "lucide-react-native";
import { LinenScreen } from "../../components/LinenScreen";
import { Topbar, SectionLabel, Btn } from "../../components/linen";
import { Badge, Empty, Field, InlineErr } from "../../components/linen/extras";
import {
  AccCard,
  Switch,
  Selectt,
  Toast,
  type ToastState,
} from "../../components/linen/more";
import { useAuth } from "../../lib/auth";
import { useRealtimeRefresh } from "../../lib/realtime";
import { useT, format as fmt, type Locale } from "../../lib/i18n";
import { formatDate } from "../../lib/format";
import { T as TH, font } from "../../lib/theme";
import { supabase } from "../../lib/supabase";

type FosRow = {
  id: string;
  full_name: string;
  phone: string | null;
  active: boolean;
  fos_auto_approve: boolean;
  created_at: string;
};

type RetailerRow = {
  id: string;
  retailer_code: string | null;
  full_name: string;
  phone: string | null;
  active: boolean;
  needs_assignment: boolean;
  fos_id: string | null;
  created_at: string;
};

export default function Users() {
  const { profile } = useAuth();
  const { t, locale } = useT();
  const [refreshing, setRefreshing] = useState(false);
  const [fos, setFos] = useState<FosRow[]>([]);
  const [retailers, setRetailers] = useState<RetailerRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    const [f, r] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, phone, active, fos_auto_approve, created_at")
        .eq("distributor_id", profile.id)
        .eq("role", "fos")
        .order("full_name"),
      supabase
        .from("profiles")
        .select(
          "id, retailer_code, full_name, phone, active, needs_assignment, fos_id, created_at",
        )
        .eq("distributor_id", profile.id)
        .eq("role", "retailer")
        .order("retailer_code"),
    ]);
    setFos((f.data ?? []) as FosRow[]);
    setRetailers((r.data ?? []) as RetailerRow[]);
    setLoaded(true);
  }, [profile]);

  useEffect(() => {
    load();
  }, [load]);

  useRealtimeRefresh(
    profile?.id
      ? [{ table: "profiles", filter: `distributor_id=eq.${profile.id}` }]
      : [],
    load,
  );

  async function toggleAuto(fosId: string) {
    const next = !fos.find((f) => f.id === fosId)?.fos_auto_approve;
    setFos((list) =>
      list.map((f) => (f.id === fosId ? { ...f, fos_auto_approve: next } : f)),
    );
    await supabase
      .from("profiles")
      .update({ fos_auto_approve: next })
      .eq("id", fosId);
  }

  async function bulkAuto(on: boolean) {
    if (!profile) return;
    setFos((list) => list.map((f) => ({ ...f, fos_auto_approve: on })));
    await supabase
      .from("profiles")
      .update({ fos_auto_approve: on })
      .eq("distributor_id", profile.id)
      .eq("role", "fos");
    setToast({
      msg: on ? t("users.auto_approve_all_on") : t("users.auto_approve_all_off"),
    });
  }

  async function toggleFosActive(f: FosRow) {
    setFos((list) =>
      list.map((x) => (x.id === f.id ? { ...x, active: !f.active } : x)),
    );
    await supabase
      .from("profiles")
      .update({ active: !f.active })
      .eq("id", f.id);
  }

  async function reassign(retailerId: string, fosId: string) {
    setRetailers((list) =>
      list.map((r) =>
        r.id === retailerId
          ? { ...r, fos_id: fosId || null, needs_assignment: !fosId }
          : r,
      ),
    );
    const { error } = await supabase
      .from("profiles")
      .update({ fos_id: fosId || null, needs_assignment: !fosId })
      .eq("id", retailerId);
    if (error) setToast({ msg: error.message, kind: "neg" });
    else setToast({ msg: t("users.toast.reassigned") });
  }

  if (!profile) return null;

  const fosOpts = [
    { value: "", label: t("users.fos_unassigned") },
    ...fos.map((f) => ({ value: f.id, label: f.full_name })),
  ];

  return (
    <View style={{ flex: 1 }}>
      <LinenScreen
        refreshing={refreshing}
        onRefresh={async () => {
          setRefreshing(true);
          await load();
          setRefreshing(false);
        }}
        topbar={<Topbar title={t("users.title")} locale={locale} />}
      >
        {!loaded ? (
          <View style={{ paddingVertical: 80, alignItems: "center" }}>
            <ActivityIndicator color={TH.accent} size="large" />
          </View>
        ) : null}
        <SectionLabel locale={locale} style={{ marginTop: 4 }}>
          {t("users.create")}
        </SectionLabel>
        <AccCard
          icon={<UserIcon size={18} color={TH.accentInk} />}
          title={t("users.create_fos")}
          locale={locale}
        >
          <CreateFosForm
            locale={locale}
            onDone={(msg, kind) => {
              setToast({ msg, kind });
              load();
            }}
          />
        </AccCard>
        <AccCard
          icon={<UsersIcon size={18} color={TH.accentInk} />}
          title={t("users.create_retailer")}
          locale={locale}
        >
          <CreateRetailerForm
            locale={locale}
            fosOptions={fos.map((f) => ({ value: f.id, label: f.full_name }))}
            unassignedLabel={t("users.fos_unassigned")}
            onDone={(msg, kind) => {
              setToast({ msg, kind });
              load();
            }}
          />
        </AccCard>

        <SectionLabel locale={locale}>
          {fmt(t("users.fos_roster"), { n: fos.length })}
        </SectionLabel>
        <View style={{ flexDirection: "row", gap: 12, marginBottom: 12 }}>
          <Btn
            title={t("users.auto_approve_all_on")}
            variant="soft"
            onPress={() => bulkAuto(true)}
            locale={locale}
          />
          <Btn
            title={t("users.auto_approve_all_off")}
            variant="ghost"
            onPress={() => bulkAuto(false)}
            locale={locale}
          />
        </View>
        {fos.length === 0 ? (
          <Empty
            icon={<UserIcon size={26} color={TH.ink3} />}
            title="No FOS yet"
            locale={locale}
          />
        ) : (
          fos.map((f) => (
            <URow
              key={f.id}
              name={f.full_name}
              badge={
                <Badge tone={f.active ? "ok" : "mute"} locale={locale}>
                  {f.active ? t("users.status.active") : t("users.status.disabled")}
                </Badge>
              }
              sub={`${f.phone ?? "—"} · ${t("users.joined")} ${formatDate(f.created_at)}`}
              locale={locale}
              right={
                <MiniBtn
                  danger={f.active}
                  label={
                    f.active
                      ? t("users.action.deactivate")
                      : t("users.action.activate")
                  }
                  onPress={() => toggleFosActive(f)}
                  locale={locale}
                />
              }
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingTop: 8,
                }}
              >
                <Text
                  style={{
                    fontSize: 12.5,
                    color: TH.ink3,
                    fontFamily: font(500, locale),
                  }}
                >
                  {t("users.auto_approve")}
                </Text>
                <Switch on={f.fos_auto_approve} onChange={() => toggleAuto(f.id)} />
              </View>
            </URow>
          ))
        )}

        <SectionLabel locale={locale}>
          {fmt(t("users.retailers"), { n: retailers.length })}
        </SectionLabel>
        {retailers.length === 0 ? (
          <Empty
            icon={<UsersIcon size={26} color={TH.ink3} />}
            title="No retailers"
            locale={locale}
          />
        ) : (
          retailers.map((r) => (
            <URow
              key={r.id}
              name={r.full_name}
              badge={
                <Badge
                  tone={r.needs_assignment ? "warn" : r.active ? "ok" : "mute"}
                  locale={locale}
                >
                  {r.needs_assignment
                    ? t("users.status.needs_fos")
                    : r.active
                      ? t("users.status.active")
                      : t("users.status.disabled")}
                </Badge>
              }
              sub={`${r.retailer_code ?? "—"} · ${r.phone ?? "—"} · ${t("users.joined")} ${formatDate(r.created_at)}`}
              locale={locale}
            >
              <View style={{ marginTop: 8 }}>
                <Selectt
                  compact
                  value={r.fos_id ?? ""}
                  onChange={(v) => {
                    if (v === (r.fos_id ?? "")) return;
                    const fosName = fos.find((f) => f.id === v)?.full_name;
                    Alert.alert(
                      t("users.confirm.title"),
                      fosName
                        ? fmt(t("users.confirm.body"), { retailer: r.full_name, fos: fosName })
                        : fmt(t("users.confirm.unassign"), { retailer: r.full_name }),
                      [
                        { text: t("common.cancel"), style: "cancel" },
                        { text: t("common.confirm"), onPress: () => reassign(r.id, v) },
                      ],
                    );
                  }}
                  options={fosOpts}
                  locale={locale}
                />
              </View>
            </URow>
          ))
        )}
      </LinenScreen>
      <Toast toast={toast} onDone={() => setToast(null)} locale={locale} bottom={24} />
    </View>
  );
}

/* ---- user creation via the web API (service role stays server-side) ---- */
async function createUserViaApi(
  kind: "fos" | "retailer",
  body: Record<string, unknown>,
): Promise<{ ok?: true; error?: string }> {
  const base = process.env.EXPO_PUBLIC_API_URL;
  if (!base) return { error: "EXPO_PUBLIC_API_URL is not set in mobile/.env" };
  try {
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    const res = await fetch(`${base}/api/users/${kind}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) return { error: json.error ?? `HTTP ${res.status}` };
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Network error" };
  }
}

function CreateFosForm({
  locale,
  onDone,
}: {
  locale: Locale;
  onDone: (msg: string, kind?: "ok" | "neg") => void;
}) {
  const { t } = useT();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [pwd, setPwd] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setErr("");
    setBusy(true);
    const res = await createUserViaApi("fos", {
      full_name: name.trim(),
      email: email.trim(),
      password: pwd,
      phone: phone.trim() || null,
    });
    setBusy(false);
    if (res.error) {
      setErr(res.error);
      return;
    }
    setName("");
    setEmail("");
    setPhone("");
    setPwd("");
    onDone(t("users.toast.fos_created"));
  };

  return (
    <View>
      <Field
        label={t("users.fos_full_name")}
        value={name}
        onChangeText={setName}
        placeholder="e.g. Sita Verma"
        locale={locale}
      />
      <Field
        label={t("users.email")}
        value={email}
        onChangeText={setEmail}
        placeholder="name@swift.in"
        keyboardType="email-address"
        inputProps={{ autoCapitalize: "none" }}
        locale={locale}
      />
      <Field
        label={t("users.phone")}
        value={phone}
        onChangeText={setPhone}
        placeholder="+91 …"
        keyboardType="phone-pad"
        locale={locale}
      />
      <Field
        label={t("users.password")}
        value={pwd}
        onChangeText={setPwd}
        secureTextEntry
        hint={t("settings.pw.hint")}
        locale={locale}
      />
      {err ? <InlineErr locale={locale}>{err}</InlineErr> : null}
      <View style={{ marginTop: 8 }}>
        <Btn
          title={t("users.create_fos")}
          onPress={submit}
          loading={busy}
          busyLabel={t("users.creating")}
          disabled={!name.trim() || !email.trim() || pwd.length < 8}
          locale={locale}
        />
      </View>
    </View>
  );
}

function CreateRetailerForm({
  locale,
  fosOptions,
  unassignedLabel,
  onDone,
}: {
  locale: Locale;
  fosOptions: { value: string; label: string }[];
  unassignedLabel: string;
  onDone: (msg: string, kind?: "ok" | "neg") => void;
}) {
  const { t } = useT();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [pwd, setPwd] = useState("");
  const [fosId, setFosId] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setErr("");
    setBusy(true);
    const res = await createUserViaApi("retailer", {
      retailer_code: code.trim(),
      full_name: name.trim(),
      email: email.trim(),
      password: pwd,
      phone: phone.trim() || null,
      fos_id: fosId || null,
    });
    setBusy(false);
    if (res.error) {
      setErr(res.error);
      return;
    }
    setCode("");
    setName("");
    setEmail("");
    setPhone("");
    setPwd("");
    setFosId("");
    onDone(t("users.toast.retailer_created"));
  };

  return (
    <View>
      <Field
        label={t("users.retailer_code")}
        value={code}
        onChangeText={setCode}
        placeholder="e.g. RT-2101"
        inputProps={{ autoCapitalize: "characters" }}
        locale={locale}
      />
      <Field
        label={t("users.fos_full_name")}
        value={name}
        onChangeText={setName}
        placeholder="Shop / owner name"
        locale={locale}
      />
      <Field
        label={t("users.email")}
        value={email}
        onChangeText={setEmail}
        placeholder="name@shop.in"
        keyboardType="email-address"
        inputProps={{ autoCapitalize: "none" }}
        locale={locale}
      />
      <Field
        label={t("users.phone")}
        value={phone}
        onChangeText={setPhone}
        placeholder="+91 …"
        keyboardType="phone-pad"
        locale={locale}
      />
      <Field
        label={t("users.password")}
        value={pwd}
        onChangeText={setPwd}
        secureTextEntry
        hint={t("settings.pw.hint")}
        locale={locale}
      />
      <Selectt
        label={t("users.fos_assign")}
        value={fosId}
        onChange={setFosId}
        options={[{ value: "", label: unassignedLabel }, ...fosOptions]}
        locale={locale}
      />
      {err ? <InlineErr locale={locale}>{err}</InlineErr> : null}
      <View style={{ marginTop: 8 }}>
        <Btn
          title={t("users.create_retailer")}
          onPress={submit}
          loading={busy}
          busyLabel={t("users.creating")}
          disabled={!code.trim() || !name.trim() || !email.trim() || pwd.length < 8}
          locale={locale}
        />
      </View>
    </View>
  );
}

/* urow — design user row card: main column + optional right mini-btn */
function URow({
  name,
  badge,
  sub,
  right,
  children,
  locale,
}: {
  name: string;
  badge: React.ReactNode;
  sub: string;
  right?: React.ReactNode;
  children?: React.ReactNode;
  locale: Locale;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingHorizontal: 14,
        paddingVertical: 13,
        backgroundColor: TH.surface,
        borderWidth: 1,
        borderColor: TH.border,
        borderRadius: TH.rMd,
        marginBottom: 9,
        shadowColor: "#28322d",
        shadowOpacity: 0.08,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 8 },
        elevation: 2,
      }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 7,
            flexWrap: "wrap",
          }}
        >
          <Text
            numberOfLines={1}
            style={{
              fontSize: 14.5,
              fontFamily: font(700, locale),
              color: TH.ink,
              flexShrink: 1,
            }}
          >
            {name}
          </Text>
          {badge}
        </View>
        <Text
          numberOfLines={1}
          style={{
            fontSize: 12,
            color: TH.ink2,
            marginTop: 2,
            fontFamily: font(500, locale),
          }}
        >
          {sub}
        </Text>
        {children}
      </View>
      {right}
    </View>
  );
}

function MiniBtn({
  label,
  danger,
  onPress,
  locale,
}: {
  label: string;
  danger?: boolean;
  onPress: () => void;
  locale: Locale;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 999,
        backgroundColor: TH.surface2,
        borderWidth: 1,
        borderColor: TH.border2,
        transform: pressed ? [{ scale: 0.95 }] : [],
      })}
    >
      <Text
        style={{
          fontSize: 12,
          fontFamily: font(700, locale),
          color: danger ? TH.neg : TH.ink,
        }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}
