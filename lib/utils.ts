import { t } from "@/lib/i18n";

/* ---------- helpers gerais ---------- */

/** Junta classes, ignorando valores falsos. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/** ID aleatório do cliente (idempotência da fila offline). */
export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

/** Debounce simples para buscas. */
export function debounce<Args extends unknown[]>(fn: (...a: Args) => void, ms: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...a: Args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...a), ms);
  };
}

/* ---------- @usuário ---------- */

export const USERNAME_RE = /^[a-z0-9._]{3,20}$/;
export const USERNAME_MAX_CHANGES = 3; // trocas a cada 30 dias
export const MIN_AGE_DEFAULT = 14;

export function normalizeUsername(v: string): string {
  return v.trim().toLowerCase().replace(/^@+/, "");
}

/** Retorna a chave de erro ou null se válido. */
export function validateUsername(v: string): string | null {
  if (!USERNAME_RE.test(normalizeUsername(v))) return t("profile.usernameInvalid");
  return null;
}

export function minAge(): number {
  const raw =
    process.env.NEXT_PUBLIC_MIN_AGE ?? process.env.MIN_AGE ?? String(MIN_AGE_DEFAULT);
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : MIN_AGE_DEFAULT;
}

export function ageFromBirthdate(iso: string): number | null {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

/* ---------- avatar: iniciais + cor a partir do nome ---------- */

const AVATAR_COLORS = [
  "#4B1FB0", "#4C6FFF", "#0E9F8A", "#B25E09", "#C2255C", "#5C940D",
  "#1C7ED6", "#7048E8", "#D9480F", "#0C8599", "#A61E4D", "#2B8A3E",
];

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return (parts[0] as string).slice(0, 2).toUpperCase();
  return (((parts[0] as string)[0] ?? "") + ((parts[parts.length - 1] as string)[0] ?? "")).toUpperCase();
}

/** Cor estável gerada do nome (sem fotos reais embutidas em lugar nenhum). */
export function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length] as string;
}

/* ---------- datas em pt-BR ---------- */

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function yesterdayOf(now: Date): Date {
  const d = new Date(now);
  d.setDate(d.getDate() - 1);
  return d;
}

export function fmtHour(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function fmtDateShort(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Lista de conversas: hoje = hora, ontem = "Ontem", antes = data. */
export function fmtListTime(iso: string | null, now = new Date()): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (sameDay(d, now)) return fmtHour(iso);
  if (sameDay(d, yesterdayOf(now))) return t("conversations.yesterday");
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

/** Separador de data no chat: Hoje / Ontem / 12 de outubro de 2026. */
export function fmtDayDivider(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (sameDay(d, now)) return t("chat.today");
  if (sameDay(d, yesterdayOf(now))) return t("chat.yesterday");
  return d.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
}

/** "visto por último": agora mesmo / há 5 min / há 2 h / data. */
export function fmtLastSeen(iso: string | null, now = new Date()): string {
  if (!iso) return t("profile.lastSeenRecently");
  const diffMs = now.getTime() - new Date(iso).getTime();
  if (diffMs < 0) return t("time.now");
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return t("time.now");
  if (min < 60) return t("time.minutes", { n: min });
  const h = Math.floor(min / 60);
  if (h < 24) return t("time.hours", { n: h });
  const days = Math.floor(h / 24);
  if (days < 7) return t("time.days", { n: days });
  return fmtDateShort(iso);
}

/* ---------- texto seguro + links clicáveis ---------- */

const URL_RE = /(https?:\/\/[^\s<>"')\]]+|www\.[^\s<>"')\]]+)/gi;

export type RichPart = { kind: "text"; text: string } | { kind: "link"; href: string; label: string };

/** Quebra o texto em partes (texto/link). O React escapa tudo — sem innerHTML, sem XSS. */
export function linkify(text: string): RichPart[] {
  const parts: RichPart[] = [];
  let last = 0;
  URL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = URL_RE.exec(text)) !== null) {
    if (m.index > last) parts.push({ kind: "text", text: text.slice(last, m.index) });
    const raw = m[0];
    const href = raw.startsWith("http") ? raw : `https://${raw}`;
    parts.push({ kind: "link", href, label: raw });
    last = m.index + raw.length;
  }
  if (last < text.length) parts.push({ kind: "text", text: text.slice(last) });
  return parts.length > 0 ? parts : [{ kind: "text", text }];
}

/* ---------- papel de parede ---------- */

export type WallpaperValue =
  | { kind: "default" }
  | { kind: "gradient"; id: string }
  | { kind: "solid"; color: string }
  | { kind: "image"; url: string };

export const WALL_GRADIENTS: Array<{ id: string; css: string }> = [
  { id: "aurora", css: "linear-gradient(135deg,#2E0F6B 0%,#4B1FB0 45%,#4C6FFF 100%)" },
  { id: "amanhecer", css: "linear-gradient(135deg,#FFD9A0 0%,#FF9EBB 55%,#B388FF 100%)" },
  { id: "oceano", css: "linear-gradient(135deg,#0C8599 0%,#1C7ED6 60%,#4C6FFF 100%)" },
  { id: "floresta", css: "linear-gradient(135deg,#0E3B2E 0%,#1F9D55 60%,#A9E34B 100%)" },
  { id: "pordosol", css: "linear-gradient(135deg,#7C2D12 0%,#D9480F 55%,#FFA94D 100%)" },
  { id: "nuvem", css: "linear-gradient(135deg,#E8EDFF 0%,#F3E8FF 55%,#E0F2FE 100%)" },
];

export const WALL_SOLIDS = ["#1E1B3A", "#4B1FB0", "#0C8599", "#5C940D", "#F2F0EA", "#0E0923"];

export function wallpaperStyle(
  value: WallpaperValue | null | undefined,
  blur: number,
  dim: number,
): { background?: string; filter?: string } {
  if (!value || value.kind === "default") return {};
  if (value.kind === "gradient") {
    const g = WALL_GRADIENTS.find((x) => x.id === value.id);
    return g ? { background: g.css } : {};
  }
  if (value.kind === "solid") return { background: value.color };
  return { background: `url("${value.url}")` };
}

/** blur 0–20px e dim 0–70%: aplicados numa camada sobre o fundo. */
export function wallpaperOverlay(blur: number, dim: number): React.CSSProperties {
  return {
    backdropFilter: blur > 0 ? `blur(${blur}px)` : undefined,
    background: dim > 0 ? `rgba(10, 6, 28, ${dim / 100})` : undefined,
  };
}

/* ---------- erros amigáveis ---------- */

export function friendlyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  const m = msg.toLowerCase();
  if (m.includes("invalid login") || m.includes("invalid email or password")) return t("errors.invalidLogin");
  if (m.includes("user already registered") || m.includes("already exists")) return t("errors.emailInUse");
  if (m.includes("password")) return t("errors.weakPassword");
  if (m.includes("rate") || m.includes("too many") || m.includes("429")) return t("errors.rateLimit");
  if (m.includes("network") || m.includes("fetch") || m.includes("offline")) return t("errors.network");
  if (m.includes("jwt") || m.includes("session") || m.includes("unauthorized") || m.includes("401")) {
    return t("errors.unauthorized");
  }
  return msg && msg.length < 160 ? msg : t("errors.generic");
}

/* ---------- som discreto (WebAudio, sem arquivos) ---------- */

let audioCtx: AudioContext | null = null;

/** "Pop" suave de nova mensagem. Falha silenciosamente sem permissão/suporte. */
export function playPop(): void {
  try {
    if (typeof window === "undefined") return;
    audioCtx ??= new AudioContext();
    if (audioCtx.state === "suspended") void audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(660, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, audioCtx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.18);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.2);
  } catch {
    /* sem som — tudo bem */
  }
}

/**
 * Desbloqueia o áudio (o navegador exige um toque antes de deixar tocar som).
 * Chamar uma vez no primeiro gesto do usuário (tap/tecla).
 */
export function unlockAudio(): void {
  try {
    if (typeof window === "undefined") return;
    audioCtx ??= new AudioContext();
    if (audioCtx.state === "suspended") void audioCtx.resume();
  } catch {
    /* sem áudio — tudo bem */
  }
}

/** "Trim-trim" clássico de telefone tocando. Falha silenciosamente. */
export function playRing(): void {
  try {
    if (typeof window === "undefined") return;
    audioCtx ??= new AudioContext();
    if (audioCtx.state === "suspended") void audioCtx.resume();
    if (audioCtx.state !== "running") return;
    for (const at of [0, 0.35]) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(440, audioCtx.currentTime + at);
      const osc2 = audioCtx.createOscillator();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(480, audioCtx.currentTime + at);
      gain.gain.setValueAtTime(0.0001, audioCtx.currentTime + at);
      gain.gain.exponentialRampToValueAtTime(0.15, audioCtx.currentTime + at + 0.03);
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime + at + 0.22);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + at + 0.3);
      osc.connect(gain);
      osc2.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(audioCtx.currentTime + at);
      osc2.start(audioCtx.currentTime + at);
      osc.stop(audioCtx.currentTime + at + 0.32);
      osc2.stop(audioCtx.currentTime + at + 0.32);
    }
  } catch {
    /* sem som — tudo bem */
  }
}
