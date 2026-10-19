"use client";

/**
 * Elio UI — primitivos visuais (botões, inputs, avatar, modal, estados...).
 * Todos os ícones são SVG inline desenhados no código (sem arquivos externos).
 */
import React, { useEffect, useRef, useState } from "react";
import { cn, initialsOf, avatarColor } from "@/lib/utils";
import { t } from "@/lib/i18n";

/* ================= ÍCONES ================= */

export type IconName =
  | "chat" | "users" | "user" | "compass" | "sliders" | "logout" | "search" | "plus"
  | "x" | "back" | "chev-down" | "chev-right" | "phone" | "video" | "dots" | "emoji"
  | "send" | "check" | "checks" | "pin" | "archive" | "bell" | "bell-off" | "trash"
  | "camera" | "image" | "sun" | "moon" | "auto" | "block" | "flag" | "copy" | "reply"
  | "clock" | "wifi-off" | "refresh" | "info" | "shield" | "sparkles" | "download"
  | "edit" | "eye" | "globe" | "lock" | "badge-check" | "sound" | "link" | "alert"
  | "mic" | "stop";

const PATHS: Record<IconName, React.ReactNode> = {
  chat: (<><rect x="3" y="4" width="18" height="13" rx="4" /><path d="M8 17l-1.5 4L12 18.5" /></>),
  users: (<><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19c.6-3 2.8-4.5 5.5-4.5s4.9 1.5 5.5 4.5" /><circle cx="17" cy="9" r="2.4" /><path d="M16 14.6c2.3.2 3.9 1.5 4.4 3.9" /></>),
  user: (<><circle cx="12" cy="8" r="3.6" /><path d="M5 20c.8-3.6 3.4-5.4 7-5.4s6.2 1.8 7 5.4" /></>),
  compass: (<><circle cx="12" cy="12" r="9" /><path d="M15.5 8.5l-2.2 5.8-5.8 2.2 2.2-5.8z" /></>),
  sliders: (<><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></>),
  logout: (<><path d="M14 4H6v16h8" /><path d="M10 12h11M18 8l4 4-4 4" /></>),
  search: (<><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></>),
  plus: <path d="M12 5v14M5 12h14" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  back: <path d="M15 5l-7 7 7 7" />,
  "chev-down": <path d="M6 9l6 6 6-6" />,
  "chev-right": <path d="M9 6l6 6-6 6" />,
  phone: <path d="M5 4h4l2 5-3 2a12 12 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />,
  video: (<><rect x="2" y="7" width="12.5" height="10" rx="2.5" /><path d="M14.5 10.5L22 7v10l-7.5-3.5" /></>),
  dots: (<><circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" /></>),
  emoji: (<><circle cx="12" cy="12" r="9" /><circle cx="9" cy="10" r="1.1" fill="currentColor" stroke="none" /><circle cx="15" cy="10" r="1.1" fill="currentColor" stroke="none" /><path d="M8 14.5c1 1.6 2.4 2.4 4 2.4s3-.8 4-2.4" /></>),
  send: (<><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4z" /></>),
  check: <path d="M20 6L9 17l-5-5" />,
  checks: (<><path d="M15 6l-7.5 7.5L4 10" /><path d="M21 6l-7.5 7.5L10 10" /></>),
  pin: (<><path d="M9 3h6l1 7 3 3H5l3-3z" /><path d="M12 13v8" /></>),
  archive: (<><rect x="3" y="4" width="18" height="5" rx="1" /><path d="M5 9v10h14V9M10 13h4" /></>),
  bell: (<><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6" /><path d="M10 20a2.2 2.2 0 0 0 4 0" /></>),
  "bell-off": (<><path d="M6 9a6 6 0 0 1 11.5-2.5M18 9c0 5 2 6 2 6H8" /><path d="M10 20a2.2 2.2 0 0 0 3.5-1.7M3 3l18 18" /></>),
  trash: (<><path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v6M14 11v6" /></>),
  camera: (<><rect x="3" y="7" width="18" height="13" rx="3" /><circle cx="12" cy="13" r="3.5" /><path d="M8.5 7L10 4.5h4L15.5 7" /></>),
  image: (<><rect x="3" y="4" width="18" height="16" rx="3" /><circle cx="9" cy="10" r="1.8" /><path d="M4 18l5-5 3.5 3.5L16 13l4 4" /></>),
  sun: (<><circle cx="12" cy="12" r="4" /><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" /></>),
  moon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />,
  auto: (<><circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none" opacity=".85" /></>),
  block: (<><circle cx="12" cy="12" r="9" /><path d="M5.8 5.8l12.4 12.4" /></>),
  flag: (<><path d="M6 21V4" /><path d="M6 4h12l-2.5 4L18 12H6" /></>),
  copy: (<><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></>),
  reply: <path d="M9 14l-5-5 5-5M4 9h10a7 7 0 0 1 0 14h-3" />,
  clock: (<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>),
  "wifi-off": (<><path d="M5 10a10 10 0 0 1 4.5-2.6M12 6c3 0 5.8 1.2 7.9 3.2M8.5 13.5a5.5 5.5 0 0 1 5-1.4M12 18h.01M3 3l18 18" /></>),
  refresh: (<><path d="M20 11a8 8 0 0 0-14.9-2M4 13a8 8 0 0 0 14.9 2" /><path d="M5 3v5h5M19 21v-5h-5" /></>),
  info: (<><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 7.5h.01" /></>),
  shield: <path d="M12 3l7.5 3v6c0 4.5-3 7.5-7.5 9-4.5-1.5-7.5-4.5-7.5-9V6z" />,
  sparkles: (<><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /><path d="M19 15l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9z" /></>),
  download: (<><path d="M12 3v12M7 10l5 5 5-5M4 21h16" /></>),
  edit: (<><path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19z" /><path d="M14.5 6.5l3 3" /></>),
  eye: (<><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="2.6" /></>),
  globe: (<><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.8 2.6 4.2 5.7 4.2 9S14.8 18.4 12 21c-2.8-2.6-4.2-5.7-4.2-9S9.2 5.6 12 3z" /></>),
  lock: (<><rect x="5" y="11" width="14" height="10" rx="2.5" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>),
  "badge-check": (<><circle cx="12" cy="12" r="9" fill="currentColor" stroke="none" opacity=".16" /><circle cx="12" cy="12" r="9" /><path d="M8.5 12.5l2.5 2.5 4.5-5" /></>),
  sound: (<><path d="M4 10v4h3l4 4V6l-4 4z" /><path d="M15.5 9a4.5 4.5 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11" /></>),
  link: (<><path d="M10 14a4 4 0 0 0 6 .4l3-3a4 4 0 0 0-5.6-5.6l-1.7 1.7" /><path d="M14 10a4 4 0 0 0-6-.4l-3 3a4 4 0 0 0 5.6 5.6l1.7-1.7" /></>),
  alert: (<><path d="M12 3L2.5 20h19z" /><path d="M12 10v4.5M12 17.5h.01" /></>),
  mic: (<><rect x="9" y="2.5" width="6" height="10.5" rx="3" /><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" /><path d="M12 18.5V21" /></>),
  stop: <rect x="6" y="6" width="12" height="12" rx="3" fill="currentColor" stroke="none" />,
};

export function Icon({
  name, size = 20, className, strokeWidth = 1.8,
}: { name: IconName; size?: number; className?: string; strokeWidth?: number }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      className={cn("shrink-0", className)} aria-hidden="true"
    >
      {PATHS[name] ?? null}
    </svg>
  );
}

/* ================= BOTÕES ================= */

type BtnVariant = "primary" | "secondary" | "ghost" | "danger" | "outline";

export function Button({
  variant = "primary", size = "md", full, loading, icon, className, children, ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: BtnVariant; size?: "sm" | "md" | "lg"; full?: boolean; loading?: boolean; icon?: IconName;
}) {
  const variants: Record<BtnVariant, string> = {
    primary: "bg-gradient-to-r from-[var(--brand-deep)] to-[var(--brand)] text-white shadow-soft hover:brightness-110 active:scale-[.99]",
    secondary: "bg-surface2 text-ink hover:bg-[var(--line)] active:scale-[.99]",
    ghost: "text-muted hover:bg-surface2 hover:text-ink",
    danger: "bg-danger text-white hover:brightness-105 active:scale-[.99]",
    outline: "border border-line bg-surface text-ink hover:bg-surface2",
  };
  const sizes = { sm: "h-9 px-3 text-sm rounded-xl", md: "h-11 px-5 text-[15px] rounded-2xl", lg: "h-12 px-6 text-base rounded-2xl" };
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 font-semibold transition-all duration-200",
        "disabled:opacity-50 disabled:pointer-events-none min-h-[44px]",
        variants[variant], sizes[size], full && "w-full", className,
      )}
      disabled={loading || rest.disabled}
      {...rest}
    >
      {loading ? <Spinner size={18} /> : icon ? <Icon name={icon} size={size === "sm" ? 16 : 19} /> : null}
      {children}
    </button>
  );
}

export function IconButton({
  label, className, children, ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      title={label} aria-label={label}
      className={cn(
        "inline-flex items-center justify-center w-11 h-11 rounded-2xl text-muted",
        "hover:bg-surface2 hover:text-ink active:scale-95 transition-all duration-200",
        "disabled:opacity-40 disabled:pointer-events-none", className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ================= FORM ================= */

export function Field({
  label, hint, error, children, htmlFor,
}: { label: string; hint?: string; error?: string | null; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-semibold">{label}</label>
      {children}
      {error ? <p className="text-sm text-danger" role="alert">{error}</p>
        : hint ? <p className="text-[13px] text-muted">{hint}</p> : null}
    </div>
  );
}

const inputCls =
  "w-full h-11 px-4 rounded-2xl bg-surface border border-line text-ink placeholder:text-muted " +
  "focus:border-[var(--brand)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--brand)_25%,transparent)] " +
  "outline-none transition-all duration-200 disabled:opacity-60";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(inputCls, props.className)} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(inputCls, "h-auto py-3 min-h-[88px] resize-y", props.className)} />;
}

export function SearchInput({
  value, onChange, placeholder, className,
}: { value: string; onChange: (v: string) => void; placeholder: string; className?: string }) {
  return (
    <div className={cn("relative", className)}>
      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none">
        <Icon name="search" size={18} />
      </span>
      <input
        value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        role="searchbox" aria-label={placeholder}
        className={cn(inputCls, "pl-10 pr-9 h-10 rounded-xl bg-surface2 border-transparent")}
      />
      {value && (
        <button
          onClick={() => onChange("")} aria-label={t("a11y.close")}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-muted hover:bg-[var(--line)]"
        >
          <Icon name="x" size={15} />
        </button>
      )}
    </div>
  );
}

export function Switch({
  checked, onChange, label,
}: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
      className={cn(
        "relative w-12 h-7 rounded-full transition-colors duration-200 shrink-0",
        checked ? "bg-[var(--brand)]" : "bg-[var(--line)]",
      )}
    >
      <span
        className={cn(
          "absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200",
          checked && "translate-x-5",
        )}
      />
    </button>
  );
}

export function Segmented<T extends string>({
  options, value, onChange, ariaLabel,
}: {
  options: Array<{ value: T; label: string; icon?: IconName }>;
  value: T; onChange: (v: T) => void; ariaLabel: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex p-1 gap-1 rounded-2xl bg-surface2">
      {options.map((o) => (
        <button
          key={o.value} role="radio" aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex-1 inline-flex items-center justify-center gap-1.5 h-10 px-3 rounded-xl text-sm font-semibold transition-all duration-200",
            value === o.value ? "bg-surface text-ink shadow-soft" : "text-muted hover:text-ink",
          )}
        >
          {o.icon && <Icon name={o.icon} size={16} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Tabs<T extends string>({
  options, value, onChange,
}: {
  options: Array<{ value: T; label: string; count?: number }>;
  value: T; onChange: (v: T) => void;
}) {
  return (
    <div role="tablist" className="flex gap-1 p-1 rounded-2xl bg-surface2">
      {options.map((o) => (
        <button
          key={o.value} role="tab" aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex-1 inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3 rounded-xl text-sm font-semibold transition-all duration-200",
            value === o.value ? "bg-surface text-ink shadow-soft" : "text-muted hover:text-ink",
          )}
        >
          {o.label}
          {typeof o.count === "number" && o.count > 0 && (
            <span className="min-w-5 h-5 px-1 inline-flex items-center justify-center rounded-full bg-accent text-white text-[11px] font-bold">
              {o.count > 99 ? "99+" : o.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/* ================= AVATAR ================= */

const AVATAR_SIZES = { xs: "w-8 h-8 text-xs", sm: "w-10 h-10 text-sm", md: "w-12 h-12 text-base", lg: "w-20 h-20 text-2xl", xl: "w-28 h-28 text-3xl" };

export function Avatar({
  src, name, size = "md", className,
}: { src?: string | null; name: string; size?: keyof typeof AVATAR_SIZES; className?: string }) {
  const [broken, setBroken] = useState(false);
  const showImg = src && !broken;
  return (
    <span
      className={cn(
        "relative inline-flex items-center justify-center rounded-full overflow-hidden shrink-0 font-bold text-white select-none",
        AVATAR_SIZES[size], className,
      )}
      style={showImg ? undefined : { background: `linear-gradient(135deg, ${avatarColor(name)}, ${avatarColor(name + "!")})` }}
      aria-hidden="true"
    >
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="w-full h-full object-cover" onError={() => setBroken(true)} draggable={false} />
      ) : (
        <span>{initialsOf(name)}</span>
      )}
    </span>
  );
}

export function PresenceDot({ status, size = "md" }: { status: string; size?: "sm" | "md" }) {
  const color =
    status === "online" ? "bg-online" : status === "away" ? "bg-away" : status === "busy" ? "bg-busy" : "bg-[var(--line)]";
  return (
    <span
      className={cn(
        "rounded-full border-2 border-surface shrink-0",
        size === "sm" ? "w-3 h-3" : "w-3.5 h-3.5", color,
      )}
    />
  );
}

export function AvatarWithPresence({
  src, name, size = "md", presence,
}: { src?: string | null; name: string; size?: keyof typeof AVATAR_SIZES; presence?: string | null }) {
  return (
    <span className="relative inline-flex shrink-0">
      <Avatar src={src} name={name} size={size} />
      {presence && presence !== "invisible" && (
        <span className="absolute -bottom-0.5 -right-0.5">
          <PresenceDot status={presence} />
        </span>
      )}
    </span>
  );
}

/* ================= MODAL / MENU ================= */

export function Modal({
  open, onClose, title, children, wide,
}: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[var(--z-modal,_60)] flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <button aria-label={t("a11y.close")} onClick={onClose} className="absolute inset-0 bg-black/45 backdrop-blur-[2px] cursor-default" />
      <div className={cn("anim-pop relative w-full bg-surface rounded-t-3xl sm:rounded-3xl shadow-pop max-h-[92dvh] overflow-y-auto", wide ? "sm:max-w-2xl" : "sm:max-w-md")}>
        <div className="sticky top-0 glass flex items-center justify-between px-5 h-16 border-b border-line rounded-t-3xl">
          <h2 className="font-display font-extrabold text-lg">{title}</h2>
          <IconButton label={t("a11y.close")} onClick={onClose} className="w-9 h-9"><Icon name="x" size={18} /></IconButton>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open, onClose, onConfirm, title, description, confirmLabel, danger, loading,
}: {
  open: boolean; onClose: () => void; onConfirm: () => void; title: string;
  description: string; confirmLabel: string; danger?: boolean; loading?: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="text-muted leading-relaxed">{description}</p>
      <div className="flex gap-3 mt-6">
        <Button variant="secondary" full onClick={onClose}>{t("conversations.cancel")}</Button>
        <Button variant={danger ? "danger" : "primary"} full loading={loading} onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </Modal>
  );
}

export type MenuItem = { label: string; icon?: IconName; danger?: boolean; onSelect: () => void };

export function Dropdown({ trigger, items, align = "right" }: { trigger: React.ReactNode; items: MenuItem[]; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open ]);
  return (
    <div className="relative" ref={ref}>
      <div onClick={() => setOpen((o) => !o)}>{trigger}</div>
      {open && (
        <div
          role="menu"
          className={cn(
            "anim-pop absolute top-full mt-2 z-40 min-w-52 py-2 bg-surface border border-line rounded-2xl shadow-pop",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          {items.map((it) => (
            <button
              key={it.label} role="menuitem"
              onClick={() => { setOpen(false); it.onSelect(); }}
              className={cn(
                "w-full flex items-center gap-3 px-4 min-h-[44px] text-sm font-medium text-left transition-colors",
                it.danger ? "text-danger hover:bg-danger-soft" : "hover:bg-surface2",
              )}
            >
              {it.icon && <Icon name={it.icon} size={17} />}
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ================= ESTADOS ================= */

export function Spinner({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={cn("animate-spin", className)} aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".2" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("skeleton rounded-xl", className)} />;
}

export function EmptyState({
  icon, title, description, action,
}: { icon: IconName; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-12 gap-2 anim-fade-up">
      <span className="w-16 h-16 rounded-3xl bg-brand-soft text-brand inline-flex items-center justify-center mb-2">
        <Icon name={icon} size={30} />
      </span>
      <p className="font-display font-extrabold text-lg">{title}</p>
      {description && <p className="text-sm text-muted max-w-70 leading-relaxed">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-12 gap-3 anim-fade-up">
      <span className="w-14 h-14 rounded-full bg-danger-soft text-danger inline-flex items-center justify-center">
        <Icon name="alert" size={26} />
      </span>
      <p className="text-sm text-muted max-w-70">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" icon="refresh" onClick={onRetry}>{t("errors.retry")}</Button>
      )}
    </div>
  );
}

export function OfflineBanner() {
  return (
    <div className="flex items-center justify-center gap-2 px-4 py-2 bg-[var(--brand-deep)] text-white text-[13px] font-medium" role="status">
      <Icon name="wifi-off" size={16} />
      {t("pwa.offline")}
    </div>
  );
}

export function SoonBadge({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-soft text-brand text-[11px] font-bold uppercase tracking-wide">
      <Icon name="sparkles" size={12} />
      {label ?? t("soon.badge")}
    </span>
  );
}

export function CountBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span className={cn("min-w-5 h-5 px-1.5 inline-flex items-center justify-center rounded-full bg-accent text-white text-[11px] font-bold", className)}>
      {count > 99 ? "99+" : count}
    </span>
  );
}
