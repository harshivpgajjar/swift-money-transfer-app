/* Additional linen components ported from the design package
   (ui.jsx Switch/Selectt/FileDrop/Toast, screens.jsx SuccessView,
   distributor.jsx AccCard, dist-reports.jsx subtabs, dtable). */

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import {
  Bell,
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  Upload,
} from "lucide-react-native";
import { T, font } from "../../lib/theme";
import type { Locale } from "../../lib/i18n";

/* ============================================================
   Switch — 48×28 pill toggle with sliding knob
   ============================================================ */
export function Switch({
  on,
  onChange,
  disabled,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  const x = useRef(new Animated.Value(on ? 20 : 0)).current;
  useEffect(() => {
    Animated.timing(x, {
      toValue: on ? 20 : 0,
      duration: 220,
      easing: Easing.bezier(0.16, 1, 0.3, 1),
      useNativeDriver: true,
    }).start();
  }, [on, x]);
  return (
    <Pressable
      onPress={() => !disabled && onChange(!on)}
      disabled={disabled}
      style={{
        width: 48,
        height: 28,
        borderRadius: 999,
        backgroundColor: on ? T.accent : T.surface2,
        borderWidth: on ? 0 : 1,
        borderColor: T.border2,
        padding: 2,
        opacity: disabled ? 0.5 : 1,
        justifyContent: "center",
      }}
    >
      <Animated.View
        style={{
          width: 22,
          height: 22,
          borderRadius: 11,
          backgroundColor: "#fff",
          shadowColor: "#000",
          shadowOpacity: 0.25,
          shadowRadius: 5,
          shadowOffset: { width: 0, height: 2 },
          elevation: 2,
          transform: [{ translateX: x }],
        }}
      />
    </Pressable>
  );
}

/* ============================================================
   ToggleRow — title/sub + Switch (settings)
   ============================================================ */
export function ToggleRow({
  title,
  sub,
  on,
  onChange,
  disabled,
  locale = "en",
  first,
}: {
  title: string;
  sub?: string;
  on: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  locale?: Locale;
  first?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 14,
        paddingVertical: 13,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: T.border,
      }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{
            fontSize: 14.5,
            fontFamily: font(600, locale),
            color: T.ink,
            lineHeight: 19.5,
          }}
        >
          {title}
        </Text>
        {sub ? (
          <Text
            style={{
              fontSize: 12.5,
              color: T.ink3,
              marginTop: 2,
              fontFamily: font(500, locale),
            }}
          >
            {sub}
          </Text>
        ) : null}
      </View>
      <Switch on={on} onChange={onChange} disabled={disabled} />
    </View>
  );
}

/* ============================================================
   Selectt — native-feel select that opens a modal option list
   ============================================================ */
export function Selectt({
  label,
  value,
  onChange,
  options,
  hint,
  compact,
  locale = "en",
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  hint?: string;
  compact?: boolean;
  locale?: Locale;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <View style={{ marginBottom: compact ? 0 : 16 }}>
      {label && !compact ? (
        <Text
          style={{
            fontSize: 13.5,
            fontFamily: font(600, locale),
            color: T.ink2,
            marginBottom: 7,
            marginLeft: 3,
          }}
        >
          {label}
        </Text>
      ) : null}
      <Pressable
        onPress={() => setOpen(true)}
        style={{
          height: compact ? 40 : 56,
          paddingHorizontal: compact ? 10 : 15,
          flexDirection: "row",
          alignItems: "center",
          gap: 9,
          borderRadius: compact ? T.rSm : T.rMd,
          backgroundColor: T.surface,
          borderWidth: 1.5,
          borderColor: T.border,
        }}
      >
        <Text
          style={{
            flex: 1,
            fontSize: compact ? 13.5 : 17,
            fontFamily: font(compact ? 600 : 500, locale),
            color: T.ink,
          }}
          numberOfLines={1}
        >
          {current?.label ?? ""}
        </Text>
        <ChevronDown size={16} color={T.ink3} />
      </Pressable>
      {hint ? (
        <Text
          style={{
            fontSize: 12.5,
            color: T.ink3,
            marginTop: 6,
            marginLeft: 3,
            fontFamily: font(400, locale),
          }}
        >
          {hint}
        </Text>
      ) : null}
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          style={{
            flex: 1,
            backgroundColor: "rgba(28,38,32,0.4)",
            justifyContent: "flex-end",
          }}
          onPress={() => setOpen(false)}
        >
          <View
            style={{
              backgroundColor: T.surface,
              borderTopLeftRadius: T.rXl,
              borderTopRightRadius: T.rXl,
              padding: 18,
              paddingBottom: 34,
            }}
          >
            {options.map((o) => {
              const on = o.value === value;
              return (
                <Pressable
                  key={o.value || "__empty"}
                  onPress={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingVertical: 14,
                    paddingHorizontal: 8,
                    borderTopWidth: 1,
                    borderTopColor: T.border,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 15.5,
                      fontFamily: font(on ? 700 : 500, locale),
                      color: on ? T.accentInk : T.ink,
                    }}
                  >
                    {o.label}
                  </Text>
                  {on ? <Check size={18} color={T.accentInk} /> : null}
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

/* ============================================================
   FilePick — dashed file-drop button using expo-document-picker
   ============================================================ */
export type PickedFile = { uri: string; name: string; mimeType?: string };

export function FilePick({
  file,
  onFile,
  files,
  onFiles,
  label,
  acceptLabel,
  replaceLabel,
  types,
  locale = "en",
}: {
  file?: PickedFile | null;
  onFile?: (f: PickedFile | null) => void;
  files?: PickedFile[];
  onFiles?: (f: PickedFile[]) => void;
  label: string;
  acceptLabel: string;
  replaceLabel: string;
  types?: string[];
  locale?: Locale;
}) {
  const multiple = !!onFiles;
  const picked = multiple ? (files ?? []) : file ? [file] : [];
  const has = picked.length > 0;
  const title =
    picked.length === 0
      ? label
      : picked.length === 1
        ? picked[0].name
        : `${picked.length} ✓`;
  const pick = async () => {
    const res = await DocumentPicker.getDocumentAsync({
      type: types ?? "*/*",
      copyToCacheDirectory: true,
      multiple,
    });
    if (res.canceled || !res.assets?.length) return;
    const newly = res.assets.map((a) => ({ uri: a.uri, name: a.name, mimeType: a.mimeType }));
    if (multiple) {
      // Accumulate across picks; same name = same file.
      const merged = [...(files ?? [])];
      for (const f of newly) {
        if (!merged.some((m) => m.name === f.name)) merged.push(f);
      }
      onFiles?.(merged);
    } else onFile?.(newly[0]);
  };
  return (
    <Pressable
      onPress={pick}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        padding: 16,
        borderRadius: T.rMd,
        borderWidth: 1.5,
        borderStyle: has ? "solid" : "dashed",
        borderColor: has ? T.accent : T.border2,
        backgroundColor: has ? T.accentSoft : T.surface2,
      }}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          backgroundColor: T.surface,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {has ? (
          <FileText size={22} color={T.accentInk} />
        ) : (
          <Upload size={22} color={T.accentInk} />
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          numberOfLines={1}
          style={{ fontSize: 14.5, fontFamily: font(700, locale), color: T.ink }}
        >
          {title}
        </Text>
        <Text
          style={{
            fontSize: 12,
            color: T.ink3,
            marginTop: 2,
            fontFamily: font(500, locale),
          }}
        >
          {has ? replaceLabel : acceptLabel}
        </Text>
      </View>
    </Pressable>
  );
}

/* ============================================================
   Toast — bottom pill, auto-dismisses
   ============================================================ */
export type ToastState = { msg: string; kind?: "ok" | "neg" } | null;

export function Toast({
  toast,
  onDone,
  locale = "en",
  bottom = 18,
}: {
  toast: ToastState;
  onDone: () => void;
  locale?: Locale;
  bottom?: number;
}) {
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(onDone, 2600);
    return () => clearTimeout(id);
  }, [toast, onDone]);
  if (!toast) return null;
  const neg = toast.kind === "neg";
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom,
        alignItems: "center",
        zIndex: 30,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 9,
          paddingHorizontal: 18,
          paddingVertical: 12,
          borderRadius: 999,
          backgroundColor: T.ink,
          maxWidth: "80%",
          shadowColor: "#28322d",
          shadowOpacity: 0.4,
          shadowRadius: 22,
          shadowOffset: { width: 0, height: 12 },
          elevation: 6,
        }}
      >
        <View
          style={{
            width: 22,
            height: 22,
            borderRadius: 11,
            backgroundColor: neg ? T.neg : T.accent,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {neg ? (
            <Bell size={13} color="#fff" />
          ) : (
            <Check size={14} color={T.onAccent} />
          )}
        </View>
        <Text
          style={{ color: T.bg, fontSize: 14, fontFamily: font(600, locale) }}
          numberOfLines={2}
        >
          {toast.msg}
        </Text>
      </View>
    </View>
  );
}

/* ============================================================
   SuccessView — ring + title + amount + sub + Done
   ============================================================ */
export function SuccessView({
  title,
  amount,
  sub,
  doneLabel,
  onDone,
  locale = "en",
}: {
  title: string;
  amount?: string;
  sub: ReactNode;
  doneLabel: string;
  onDone: () => void;
  locale?: Locale;
}) {
  const scale = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    Animated.spring(scale, {
      toValue: 1,
      friction: 5,
      tension: 80,
      useNativeDriver: true,
    }).start();
  }, [scale]);
  return (
    <View style={{ alignItems: "center", paddingTop: 40, paddingHorizontal: 40 }}>
      <Animated.View
        style={{
          width: 96,
          height: 96,
          borderRadius: 48,
          backgroundColor: T.accent,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 22,
          transform: [{ scale }],
        }}
      >
        <Check size={44} color={T.onAccent} strokeWidth={2.6} />
      </Animated.View>
      <Text
        style={{
          fontSize: 23,
          fontFamily: font(800, locale),
          letterSpacing: -0.46,
          color: T.ink,
        }}
      >
        {title}
      </Text>
      {amount ? (
        <Text
          style={{
            fontFamily: font(600, "en", "num"),
            fontSize: 40,
            color: T.ink,
            marginVertical: 6,
          }}
        >
          {amount}
        </Text>
      ) : null}
      <Text
        style={{
          fontSize: 14.5,
          color: T.ink2,
          marginTop: 8,
          textAlign: "center",
          lineHeight: 21.75,
          fontFamily: font(500, locale),
        }}
      >
        {sub}
      </Text>
      <View style={{ marginTop: 28, alignSelf: "stretch" }}>
        <Pressable
          onPress={onDone}
          style={{
            height: 56,
            borderRadius: T.rMd,
            backgroundColor: T.accent,
            alignItems: "center",
            justifyContent: "center",
            shadowColor: T.accent,
            shadowOpacity: 0.3,
            shadowRadius: 22,
            shadowOffset: { width: 0, height: 12 },
            elevation: 6,
          }}
        >
          <Text
            style={{
              fontSize: 16.5,
              fontFamily: font(700, locale),
              color: T.onAccent,
            }}
          >
            {doneLabel}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/* ============================================================
   AccCard — collapsible card with icon header (design AccCard)
   ============================================================ */
export function AccCard({
  icon,
  title,
  children,
  locale = "en",
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  locale?: Locale;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View
      style={{
        backgroundColor: T.surface,
        borderWidth: 1,
        borderColor: T.border,
        borderRadius: T.rMd,
        marginBottom: 11,
        overflow: "hidden",
      }}
    >
      <Pressable
        onPress={() => setOpen(!open)}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          padding: 14,
          paddingHorizontal: 16,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              backgroundColor: T.accentSoft,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {icon}
          </View>
          <Text
            style={{ fontSize: 14.5, fontFamily: font(700, locale), color: T.ink }}
          >
            {title}
          </Text>
        </View>
        <View style={{ transform: [{ rotate: open ? "90deg" : "0deg" }] }}>
          <ChevronRight size={18} color={T.ink3} />
        </View>
      </Pressable>
      {open ? (
        <View style={{ paddingHorizontal: 16, paddingBottom: 16, paddingTop: 4 }}>
          {children}
        </View>
      ) : null}
    </View>
  );
}

/* ============================================================
   Subtabs — pill tabs (Reports: EOD upload | Cash report)
   ============================================================ */
export function Subtabs<V extends string>({
  options,
  value,
  onChange,
  locale = "en",
}: {
  options: { value: V; label: string }[];
  value: V;
  onChange: (v: V) => void;
  locale?: Locale;
}) {
  return (
    <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 999,
              backgroundColor: on ? T.ink : T.surface,
              borderWidth: 1,
              borderColor: on ? "transparent" : T.border,
            }}
          >
            <Text
              style={{
                fontSize: 13,
                fontFamily: font(700, locale),
                color: on ? T.bg : T.ink2,
              }}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ============================================================
   DTable — design data table (uppercase headers, right-aligned
   numeric columns, k-shortened values supplied by caller)
   ============================================================ */
export type DCell = {
  text: string;
  tone?: "pos" | "neg" | "close" | "mute" | "diff";
  ui?: boolean; // render in UI font (left column style)
};

export function DTable({
  headers,
  rows,
  footer,
  locale = "en",
}: {
  headers: string[];
  rows: DCell[][];
  footer?: DCell[];
  locale?: Locale;
}) {
  const color = (t?: DCell["tone"]) =>
    t === "pos"
      ? T.pos
      : t === "neg"
        ? T.neg
        : t === "close"
          ? T.ink
          : t === "diff"
            ? T.warn
            : t === "mute"
              ? T.ink3
              : T.ink;
  const Cell = ({ c, i, bold }: { c: DCell; i: number; bold?: boolean }) => (
    <Text
      style={{
        flex: 1,
        textAlign: i === 0 ? "left" : "right",
        fontSize: 13.5,
        fontFamily:
          i === 0 || c.ui
            ? font(600, locale)
            : font(c.tone === "close" || bold ? 700 : 500, "en", "num"),
        color: i === 0 ? T.ink2 : color(c.tone),
      }}
      numberOfLines={1}
    >
      {c.text}
    </Text>
  );
  return (
    <View>
      <View style={{ flexDirection: "row", paddingBottom: 9 }}>
        {headers.map((h, i) => (
          <Text
            key={i}
            style={{
              flex: 1,
              textAlign: i === 0 ? "left" : "right",
              fontSize: 11,
              fontFamily: font(700, locale),
              textTransform: "uppercase",
              letterSpacing: 0.55,
              color: T.ink3,
            }}
          >
            {h}
          </Text>
        ))}
      </View>
      {rows.map((r, ri) => (
        <View
          key={ri}
          style={{
            flexDirection: "row",
            paddingVertical: 9,
            borderTopWidth: 1,
            borderTopColor: T.border,
          }}
        >
          {r.map((c, i) => (
            <Cell key={i} c={c} i={i} />
          ))}
        </View>
      ))}
      {footer ? (
        <View
          style={{
            flexDirection: "row",
            paddingVertical: 9,
            borderTopWidth: 1.5,
            borderTopColor: T.border2,
          }}
        >
          {footer.map((c, i) => (
            <Cell key={i} c={c} i={i} bold />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/* ============================================================
   ResultBox — green/red import summary boxes (dist-reports)
   ============================================================ */
export function ResultBox({
  err,
  title,
  icon,
  lines,
  note,
  locale = "en",
}: {
  err?: boolean;
  title: string;
  icon?: ReactNode;
  lines?: { l: string; v: string }[];
  note?: string;
  locale?: Locale;
}) {
  return (
    <View
      style={{
        backgroundColor: err ? "rgba(194,104,61,0.10)" : T.accentSoft,
        borderWidth: 1,
        borderColor: err ? "rgba(194,104,61,0.30)" : "rgba(14,123,87,0.30)",
        borderRadius: T.rMd,
        padding: 16,
        marginTop: 14,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {icon ??
          (err ? (
            <Bell size={16} color={T.neg} />
          ) : (
            <Check size={18} color={T.accentInk} />
          ))}
        <Text
          style={{
            flex: 1,
            fontSize: 15,
            fontFamily: font(800, locale),
            color: T.ink,
            lineHeight: 20,
          }}
        >
          {title}
        </Text>
      </View>
      {lines?.map((line, i) => (
        <View
          key={i}
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            paddingVertical: 5,
            marginTop: 6,
            borderTopWidth: 1,
            borderTopColor: T.border,
          }}
        >
          <Text
            style={{ fontSize: 13, color: T.ink2, fontFamily: font(500, locale), flex: 1 }}
          >
            {line.l}
          </Text>
          <Text
            style={{ fontSize: 13, color: T.ink, fontFamily: font(700, "en", "num") }}
          >
            {line.v}
          </Text>
        </View>
      ))}
      {note ? (
        <Text
          style={{
            fontSize: 12.5,
            color: T.ink2,
            marginTop: 6,
            lineHeight: 21,
            fontFamily: font(500, locale),
          }}
        >
          {note}
        </Text>
      ) : null}
    </View>
  );
}
