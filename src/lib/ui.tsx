"use client";

/* Shared UI ported 1:1 from the design package (ui.jsx / screens.jsx /
   distributor.jsx). Class names map to globals.css. */

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { formatINR } from "@/lib/utils";

/* ---------- icons (design's exact 1.6-stroke paths) ---------- */
const IC: Record<string, string> = {
  home: "M3 10.8 12 4l9 6.8M5.5 9.6V20h13V9.6",
  send: "M12 20V5M5.5 11.5 12 5l6.5 6.5",
  cash: "M3 8.5h18v9.5H3zM3 8.5 7 4h10l4 4.5M12 16.5a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2",
  clock: "M12 7v5.2l3.2 1.9M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18",
  bell: "M6.5 17.5h11l-1.3-2.2v-4.1a4.2 4.2 0 0 0-8.4 0v4.1zM10 20.5a2 2 0 0 0 4 0",
  user: "M12 12.2a3.7 3.7 0 1 0 0-7.4 3.7 3.7 0 0 0 0 7.4M5 20c.7-3.3 3.5-5 7-5s6.3 1.7 7 5",
  chev: "M9 6l6 6-6 6",
  chevD: "M6 9l6 6 6-6",
  check: "M5 12.5 10 17.5 19 7",
  plus: "M12 5v14M5 12h14",
  arrowL: "M15 6l-6 6 6 6",
  refresh: "M20 11a8 8 0 1 0-.7 4.3M20 6v5h-5",
  lock: "M7 10.5V8a5 5 0 0 1 10 0v2.5M5.5 10.5h13V20h-13z",
  mail: "M3.5 6.5h17v11h-17zM3.8 7l8.2 6 8.2-6",
  wallet: "M3.5 7.5h17v11h-17zM16 12.5h3M3.5 7.5 16 7.5V5.2L3.5 7.5",
  shield: "M12 3 5 6v5c0 4.4 3 7.3 7 9 4-1.7 7-4.6 7-9V6z",
  power: "M12 3.5v8M7.4 7a7 7 0 1 0 9.2 0",
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19.4 13.5a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-2.87 1.2V21a2 2 0 0 1-4 0v-.1A1.7 1.7 0 0 0 7 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 2.6 14H2.5a2 2 0 0 1 0-4h.1A1.7 1.7 0 0 0 4.6 7a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 2.6h.1A2 2 0 0 1 11 .5",
  upload: "M12 16V4M7.5 8.5 12 4l4.5 4.5M5 18.5h14",
  trash: "M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13",
  phone: "M6.5 4h3l1.5 4-2 1.3a11 11 0 0 0 5 5l1.3-2 4 1.5v3a2 2 0 0 1-2.2 2A16 16 0 0 1 4.5 6.2 2 2 0 0 1 6.5 4",
  file: "M7 3.5h7l4 4V20.5H7zM14 3.5V8h4",
  x: "M6 6l12 12M18 6 6 18",
  inbox: "M3.5 13.5h4l1.5 2.5h6l1.5-2.5h4M3.5 13.5 6 5h12l2.5 8.5v5h-17z",
  people: "M9 11.5a3.3 3.3 0 1 0 0-6.6 3.3 3.3 0 0 0 0 6.6M2.5 19c.6-3 2.8-4.5 6.5-4.5s5.9 1.5 6.5 4.5M16 5.2a3.3 3.3 0 0 1 0 6.4M21.5 19c-.4-2.4-1.7-3.9-4-4.4",
  eye: "M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12ZM12 14.8a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6",
  eyeOff: "M4 4l16 16M10.6 6c.45-.08.92-.13 1.4-.13 6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.3 3.1M7 7.4A16.7 16.7 0 0 0 2.5 12s3.5 6.5 9.5 6.5c1.7 0 3.2-.5 4.5-1.2M9.9 9.9a2.8 2.8 0 0 0 4 4",
};
export type IconName = keyof typeof IC;

export function Icon({
  name,
  size = 22,
  c = "currentColor",
  w = 1.7,
  style,
}: {
  name: IconName;
  size?: number;
  c?: string;
  w?: number;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={c}
      strokeWidth={w}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      aria-hidden
    >
      <path d={IC[name]} />
    </svg>
  );
}

/* ---------- WhatsApp glyph (filled, brand) ---------- */
export function WhatsAppIcon({ size = 20, c = "currentColor" }: { size?: number; c?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={c} aria-hidden>
      <path d="M19.05 4.91A9.82 9.82 0 0 0 12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.2h.004c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.02zM12.04 20.15h-.004a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.23 8.24-8.23 2.2 0 4.27.86 5.83 2.42a8.18 8.18 0 0 1 2.41 5.82c0 4.54-3.7 8.23-8.24 8.23zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.12-.16.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.51.11-.11.25-.29.37-.43.12-.14.16-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43-.14-.01-.31-.01-.48-.01-.17 0-.43.06-.66.31-.23.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.14-1.18-.06-.1-.22-.16-.47-.28z" />
    </svg>
  );
}

/* ---------- logo mark (double chevron) ---------- */
export function Logo({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden>
      <rect x="3" y="3" width="42" height="42" rx="13" fill="var(--accent)" />
      <g
        stroke="var(--on-accent)"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      >
        <path d="M16.5 15 L25 24 L16.5 33" />
        <path d="M25 15 L33.5 24 L25 33" />
      </g>
    </svg>
  );
}

/* ---------- count-up hook ---------- */
function clampN(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}
export function useCountUp(target: number, dur = 950): number {
  const [val, setVal] = useState(target);
  const raf = useRef(0);
  useEffect(() => {
    const start = performance.now();
    const to = Number(target) || 0;
    cancelAnimationFrame(raf.current);
    const tick = (now: number) => {
      const t = clampN((now - start) / dur, 0, 1);
      const e = 1 - Math.pow(1 - t, 3);
      setVal(to * e);
      if (t < 1) raf.current = requestAnimationFrame(tick);
      else setVal(to);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, dur]);
  return val;
}

/* ---------- buttons ---------- */
export type BtnVariant = "primary" | "ghost" | "soft" | "danger";
export function Btn({
  children,
  onClick,
  variant = "primary",
  busy,
  busyLabel,
  disabled,
  full = true,
  style,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: BtnVariant;
  busy?: boolean;
  busyLabel?: string;
  disabled?: boolean;
  full?: boolean;
  style?: CSSProperties;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      className={"btn btn-" + variant + (full ? " btn-full" : "")}
      onClick={onClick}
      disabled={disabled || busy}
      style={style}
    >
      {busy ? (
        <span className="btn-busy">
          <span className="spin" />
          {busyLabel || "Please wait…"}
        </span>
      ) : (
        children
      )}
    </button>
  );
}

/* ---------- text field ---------- */
export function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  prefix,
  suffix,
  hint,
  icon,
  autoFocus,
  inputMode,
  multiline,
  name,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  prefix?: string;
  suffix?: ReactNode;
  hint?: string;
  icon?: IconName;
  autoFocus?: boolean;
  inputMode?: "numeric" | "decimal" | "email" | "tel" | "search" | "text" | "url";
  multiline?: boolean;
  name?: string;
}) {
  const [show, setShow] = useState(false);
  const isPassword = type === "password";
  const effectiveType = isPassword && show ? "text" : type;
  return (
    <label className="field">
      {label && <span className="field-label">{label}</span>}
      <div className={"field-box" + (multiline ? " multiline" : "")}>
        {prefix && <span className="field-prefix">{prefix}</span>}
        {icon && (
          <span className="field-icon">
            <Icon name={icon} size={18} />
          </span>
        )}
        {multiline ? (
          <textarea
            className="field-input"
            value={value}
            placeholder={placeholder}
            name={name}
            onChange={(e) => onChange(e.target.value)}
            rows={3}
          />
        ) : (
          <input
            className="field-input"
            value={value}
            type={effectiveType}
            placeholder={placeholder}
            inputMode={inputMode}
            autoFocus={autoFocus}
            name={name}
            onChange={(e) => onChange(e.target.value)}
          />
        )}
        {isPassword && (
          <button
            type="button"
            className="field-icon"
            style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
            onClick={() => setShow(!show)}
            aria-label={show ? "Hide password" : "Show password"}
            tabIndex={-1}
          >
            <Icon name={show ? "eyeOff" : "eye"} size={18} />
          </button>
        )}
        {suffix}
      </div>
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

/* ---------- segmented control ---------- */
export function Segmented<V extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: V; label: string }[];
  value: V;
  onChange: (v: V) => void;
}) {
  const i = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div
      className="seg"
      style={{ "--seg-n": options.length, "--seg-i": i } as CSSProperties}
    >
      <div className="seg-thumb" />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={"seg-btn" + (o.value === value ? " on" : "")}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- toast ---------- */
export type ToastMsg = { msg: string; kind?: "ok" | "neg" } | null;
export function Toast({
  msg,
  kind = "ok",
  onDone,
}: {
  msg: string | null | undefined;
  kind?: "ok" | "neg";
  onDone: () => void;
}) {
  useEffect(() => {
    if (!msg) return;
    const id = setTimeout(onDone, 2600);
    return () => clearTimeout(id);
  }, [msg, onDone]);
  if (!msg) return null;
  return (
    <div className={"toast toast-" + kind}>
      <span className="toast-ic">
        <Icon name={kind === "ok" ? "check" : "bell"} size={16} w={2.2} />
      </span>
      {msg}
    </div>
  );
}

/* ---------- toggle switch ---------- */
export function Switch({
  on,
  onChange,
  disabled,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={"switch" + (on ? " on" : "")}
      disabled={disabled}
      onClick={() => !disabled && onChange(!on)}
      aria-pressed={on}
    >
      <span className="switch-knob" />
    </button>
  );
}

/* ---------- select (native, styled) ---------- */
export function Selectt({
  label,
  value,
  onChange,
  options,
  hint,
  compact,
  name,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  hint?: string;
  compact?: boolean;
  name?: string;
}) {
  return (
    <label className={compact ? "field-inline" : "field"}>
      {label && !compact && <span className="field-label">{label}</span>}
      <div className={"field-box select-box" + (compact ? " compact" : "")}>
        <select
          className="field-input select-input"
          value={value}
          name={name}
          onChange={(e) => onChange(e.target.value)}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <span className="field-icon" style={{ pointerEvents: "none" }}>
          <Icon name="chevD" size={16} />
        </span>
      </div>
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

/* ---------- file drop ---------- */
export function FileDrop({
  accept,
  acceptLabel,
  file,
  onFile,
  files,
  onFiles,
  label,
}: {
  accept?: string;
  acceptLabel: string;
  file?: File | null;
  onFile?: (f: File | null) => void;
  files?: File[];
  onFiles?: (f: File[]) => void;
  label?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const multiple = !!onFiles;
  const picked = multiple ? (files ?? []) : file ? [file] : [];
  const title =
    picked.length === 0
      ? label || "Choose a file"
      : picked.length === 1
        ? picked[0].name
        : `${picked.length} files`;
  return (
    <button
      type="button"
      className={"filedrop" + (picked.length ? " has" : "")}
      onClick={() => ref.current?.click()}
    >
      <input
        ref={ref}
        type="file"
        accept={accept}
        multiple={multiple}
        style={{ display: "none" }}
        onChange={(e) => {
          const list = Array.from(e.target.files ?? []);
          if (multiple) {
            // Accumulate across picks; same name+size = same file.
            const merged = [...picked];
            for (const f of list) {
              if (!merged.some((m) => m.name === f.name && m.size === f.size)) merged.push(f);
            }
            onFiles?.(merged);
          } else onFile?.(list[0] ?? null);
          e.target.value = "";
        }}
      />
      <span className="filedrop-ic">
        <Icon name={picked.length ? "file" : "upload"} size={22} />
      </span>
      <span className="filedrop-main">
        <span className="filedrop-title">{title}</span>
        <span className="filedrop-sub">{picked.length ? "Click to replace" : acceptLabel}</span>
      </span>
    </button>
  );
}

/* ---------- stat tile ---------- */
export function Tile({
  icon,
  label,
  value,
  currency,
  feature,
  chip,
  onClick,
  delay,
  animate = true,
}: {
  icon: IconName;
  label: string;
  value: number;
  currency?: boolean;
  feature?: boolean;
  chip?: string | null;
  onClick?: () => void;
  delay?: string;
  animate?: boolean;
}) {
  const counted = useCountUp(value, feature ? 1100 : 850);
  const num = animate ? counted : value;
  const display = currency
    ? formatINR(num)
    : Math.round(num).toLocaleString("en-IN");
  const Wrapper = onClick ? "button" : "div";
  return (
    <Wrapper
      type={onClick ? "button" : undefined}
      className={"tile rise" + (feature ? " feature" : "")}
      style={{ animationDelay: delay }}
      onClick={onClick}
    >
      <div className="tile-top">
        <span className="tile-ic">
          <Icon name={icon} size={20} />
        </span>
        {chip ? (
          <span className="tile-chip">{chip}</span>
        ) : (
          <span className="tile-arrow">
            <Icon name="chev" size={18} />
          </span>
        )}
      </div>
      <div className="tile-label">{label}</div>
      <div className="tile-val">{display}</div>
      {feature && (
        <svg className="spark" width="150" height="56" viewBox="0 0 150 56" fill="none">
          <path
            d="M0 44 C20 40 28 20 46 22 C66 24 70 42 92 34 C112 27 120 8 150 6"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            opacity=".55"
          />
        </svg>
      )}
    </Wrapper>
  );
}

/* ---------- amount input ---------- */
export function AmountBox({
  value,
  onChange,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
}) {
  const fmtAmount = (v: string) => {
    const d = String(v).replace(/[^\d]/g, "");
    return d ? Number(d).toLocaleString("en-IN") : "";
  };
  return (
    <div className="amount-field">
      <span className="a-sym">₹</span>
      <input
        className="amount-input"
        inputMode="numeric"
        autoFocus={autoFocus}
        value={fmtAmount(value)}
        placeholder="0"
        onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ""))}
      />
    </div>
  );
}

/* ---------- denomination counter ---------- */
export const DENOMS = [500, 200, 100, 50, 20, 10] as const;
type Counts = Record<number, number>;

export function Denominations({
  counts,
  setCounts,
}: {
  counts: Counts;
  setCounts: (fn: (c: Counts) => Counts) => void;
}) {
  const change = (d: number, delta: number) =>
    setCounts((c) => ({ ...c, [d]: Math.max(0, (c[d] || 0) + delta) }));
  const setExact = (d: number, v: number) =>
    setCounts((c) => ({ ...c, [d]: Math.max(0, v || 0) }));
  return (
    <div className="denoms">
      {DENOMS.map((d) => {
        const n = counts[d] || 0;
        return (
          <div className={"denom-row" + (n ? " active" : "")} key={d}>
            <span className="denom-note">₹{d}</span>
            <div className="denom-step">
              <button
                type="button"
                className="denom-btn"
                onClick={() => change(d, -1)}
                disabled={n === 0}
                aria-label={"Less ₹" + d}
              >
                −
              </button>
              <input
                className="denom-count"
                inputMode="numeric"
                value={n || ""}
                placeholder="0"
                onChange={(e) =>
                  setExact(d, parseInt(e.target.value.replace(/[^\d]/g, ""), 10) || 0)
                }
              />
              <button
                type="button"
                className="denom-btn"
                onClick={() => change(d, 1)}
                aria-label={"More ₹" + d}
              >
                +
              </button>
            </div>
            <span className="denom-line">{n ? formatINR(d * n) : "—"}</span>
          </div>
        );
      })}
    </div>
  );
}

/* amount entry with "enter amount" / "count notes" modes */
export function CashAmountEntry({
  amount,
  setAmount,
  outstanding,
  labels,
}: {
  amount: string;
  setAmount: (v: string) => void;
  outstanding: number;
  labels: {
    enter: string;
    count: string;
    payFull: string;
    notesCounted: (n: number) => string;
  };
}) {
  const [mode, setMode] = useState<"amount" | "notes">("amount");
  const [counts, setCounts] = useState<Counts>({});
  const denomTotal = DENOMS.reduce((s, d) => s + d * (counts[d] || 0), 0);
  const noteCount = DENOMS.reduce((s, d) => s + (counts[d] || 0), 0);
  useEffect(() => {
    if (mode === "notes") setAmount(String(denomTotal));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [counts, mode]);
  return (
    <div>
      <div className="denom-mode">
        <Segmented
          options={[
            { value: "amount", label: labels.enter },
            { value: "notes", label: labels.count },
          ]}
          value={mode}
          onChange={setMode}
        />
      </div>
      {mode === "amount" ? (
        <>
          <AmountBox value={amount} onChange={setAmount} autoFocus />
          {outstanding > 0 && (
            <div style={{ textAlign: "center" }}>
              <button
                type="button"
                className="payfull"
                onClick={() => setAmount(String(outstanding))}
              >
                <Icon name="check" size={16} w={2.4} /> {labels.payFull} ·{" "}
                {formatINR(outstanding)}
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="denom-total">
            <span className="a-sym">₹</span>
            {Number(denomTotal).toLocaleString("en-IN")}
          </div>
          <div className="denom-total-lbl">{labels.notesCounted(noteCount)}</div>
          <Denominations counts={counts} setCounts={setCounts} />
        </>
      )}
    </div>
  );
}

/* ---------- success view ---------- */
export function SuccessView({
  title,
  sub,
  amount,
  onDone,
  doneLabel,
}: {
  title: string;
  sub: ReactNode;
  amount?: string | number;
  onDone: () => void;
  doneLabel: string;
}) {
  return (
    <div className="success-card">
      <div className="success-ring">
        <svg
          width="44"
          height="44"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 12.5 10 17.5 19 7" />
        </svg>
      </div>
      <div className="success-title">{title}</div>
      {amount ? <div className="success-amt">{formatINR(amount)}</div> : null}
      <div className="success-sub">{sub}</div>
      <div style={{ marginTop: 28, maxWidth: 480, marginLeft: "auto", marginRight: "auto" }}>
        <Btn onClick={onDone}>{doneLabel}</Btn>
      </div>
    </div>
  );
}

/* ---------- empty state ---------- */
export function Empty({
  icon,
  title,
  sub,
}: {
  icon: IconName;
  title: string;
  sub?: string;
}) {
  return (
    <div className="empty">
      <div className="empty-ic">
        <Icon name={icon} />
      </div>
      <div className="empty-title">{title}</div>
      {sub && <div className="empty-sub">{sub}</div>}
    </div>
  );
}

/* ---------- collapsible card (design AccCard) ---------- */
export function AccCard({
  icon,
  title,
  children,
}: {
  icon: IconName;
  title: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [h, setH] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setH(open ? el.scrollHeight : 0);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);
  return (
    <div className="out-item" style={{ marginBottom: 11 }}>
      <button type="button" className="set-link bare" onClick={() => setOpen(!open)}>
        <span className="set-link-l">
          <span className="set-link-ic">
            <Icon name={icon} size={18} />
          </span>
          {title}
        </span>
        <span
          className="out-chev"
          style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform .3s" }}
        >
          <Icon name="chev" size={18} />
        </span>
      </button>
      <div className="expand-wrap" style={{ height: h }}>
        <div ref={ref} style={{ padding: "4px 16px 16px" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

/* ---------- small helpers ---------- */
export function SectionLabel({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div className="section-label" style={style}>
      {children}
    </div>
  );
}

export function InlineErr({ children }: { children: ReactNode }) {
  return (
    <div className="inline-err">
      <Icon name="bell" size={15} w={2.2} />
      {children}
    </div>
  );
}

export function KV({
  l,
  v,
  mono,
}: {
  l: ReactNode;
  v: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="kv">
      <span className="kv-l">{l}</span>
      <span className={"kv-v" + (mono ? " mono" : "")}>{v}</span>
    </div>
  );
}

export function ToggleRow({
  title,
  sub,
  on,
  onChange,
  disabled,
}: {
  title: string;
  sub?: string;
  on: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="toggle-row">
      <div className="tr-main">
        <div className="tr-title">{title}</div>
        {sub && <div className="tr-sub">{sub}</div>}
      </div>
      <Switch on={on} onChange={onChange} disabled={disabled} />
    </div>
  );
}

export { formatINR };
