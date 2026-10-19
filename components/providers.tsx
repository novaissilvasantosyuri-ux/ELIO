"use client";

/**
 * Providers globais: toasts + sessão/perfil/configurações + tema.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabaseBrowser } from "@/lib/supabase/client";
import { subscribeProfiles, unsubscribe } from "@/lib/realtime";
import type { Presence, Profile, UserSettings } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

/* ================= TOAST ================= */

interface ToastItem { id: number; text: string; kind: "ok" | "error" | "info" }
const ToastCtx = createContext<{ toast: (text: string, kind?: ToastItem["kind"]) => void }>({
  toast: () => {},
});
export const useToast = () => useContext(ToastCtx);

function Toasts({ items }: { items: ToastItem[] }) {
  return (
    <div className="fixed bottom-20 tablet:bottom-6 left-1/2 -translate-x-1/2 z-[80] flex flex-col items-center gap-2 pointer-events-none px-4 w-full max-w-md" aria-live="polite">
      {items.map((x) => (
        <div
          key={x.id}
          className={cn(
            "anim-pop px-4 py-3 rounded-2xl shadow-pop text-sm font-medium text-white max-w-full text-center",
            x.kind === "error" ? "bg-danger" : x.kind === "ok" ? "bg-[var(--brand-deep)]" : "bg-ink",
          )}
        >
          {x.text}
        </div>
      ))}
    </div>
  );
}

/* ================= APP (eu + configurações + presença) ================= */

export interface PeerPresence { presence: Presence; last_seen_at: string | null }

interface AppState {
  ready: boolean;
  configured: boolean;
  user: User | null;
  profile: Profile | null;
  settings: UserSettings | null;
  blocks: Set<string>;
  mutes: Map<string, string | null>;
  presenceMap: Record<string, PeerPresence>;
  refreshAll: () => Promise<void>;
  setProfileLocal: (p: Partial<Profile>) => void;
  setSettingsLocal: (s: Partial<UserSettings>) => void;
  setBlocksLocal: (b: Set<string>) => void;
  setMutesLocal: (m: Map<string, string | null>) => void;
  signOut: () => Promise<void>;
}

const AppCtx = createContext<AppState | null>(null);
export function useApp(): AppState {
  const v = useContext(AppCtx);
  if (!v) throw new Error("useApp fora do AppProvider");
  return v;
}

const DEFAULT_SETTINGS: UserSettings = {
  user_id: "", theme: "auto", accent: "#4B1FB0", font_size: "md", density: "comfortable",
  reduce_motion: false, wallpaper: { value: { kind: "default" }, blur: 0, dim: 0 },
  read_receipts: true, typing_indicators: true, show_last_seen: true,
  findable_by_username: true, addable_by: "everyone", messages_from: "everyone",
  sound_enabled: true, preview_text: true,
};

/** Aplica tema/fonte/densidade/movimento/destaque no <html> (sem recarregar). */
function applySettings(s: UserSettings) {
  const root = document.documentElement;
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const resolved = s.theme === "auto" ? (mq.matches ? "dark" : "light") : s.theme;
  root.dataset.theme = resolved;
  root.dataset.font = s.font_size;
  root.dataset.density = s.density;
  if (s.reduce_motion) root.dataset.motion = "reduced";
  else delete root.dataset.motion;
  root.style.setProperty("--accent", s.accent);
  root.style.setProperty("--brand", s.accent);
  try {
    localStorage.setItem("elio-theme", JSON.stringify({
      theme: s.theme, font: s.font_size, density: s.density,
      motion: s.reduce_motion, accent: s.accent,
    }));
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", resolved === "dark" ? "#0E0923" : "#FBFAF7");
  } catch { /* modo privado: ok */ }
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastId = useRef(0);
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [blocks, setBlocks] = useState<Set<string>>(new Set());
  const [mutes, setMutes] = useState<Map<string, string | null>>(new Map());
  const [presenceMap, setPresenceMap] = useState<Record<string, PeerPresence>>({});
  const configured = isSupabaseConfigured();

  const toast = useCallback((text: string, kind: ToastItem["kind"] = "info") => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-2), { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600);
  }, []);

  const refreshAll = useCallback(async () => {
    if (!configured) {
      setReady(true);
      return;
    }
    const sb = supabaseBrowser();
    const { data } = await sb.auth.getUser();
    const u = data.user;
    setUser(u);
    if (!u) {
      setProfile(null);
      setSettings(null);
      setReady(true);
      return;
    }
    const [p, s, b, m] = await Promise.all([
      sb.from("profiles").select("*").eq("id", u.id).maybeSingle(),
      sb.from("user_settings").select("*").eq("user_id", u.id).maybeSingle(),
      sb.from("blocks").select("blocked_id").eq("blocker_id", u.id),
      sb.from("mutes").select("muted_user_id,until").eq("user_id", u.id),
    ]);
    const settingsRow = (s.data ?? null) as UserSettings | null;
    if (p.data) setProfile(p.data as Profile);
    setSettings(settingsRow ? { ...DEFAULT_SETTINGS, ...settingsRow } : { ...DEFAULT_SETTINGS, user_id: u.id });
    setBlocks(new Set(((b.data ?? []) as Array<{ blocked_id: string }>).map((x) => x.blocked_id)));
    setMutes(new Map(((m.data ?? []) as Array<{ muted_user_id: string; until: string | null }>).map((x) => [x.muted_user_id, x.until])));
    setReady(true);
  }, [configured]);

  // carrega 1x + reage a login/logout
  useEffect(() => {
    void refreshAll();
    if (!configured) return;
    const sb = supabaseBrowser();
    const { data: sub } = sb.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setUser(null);
        setProfile(null);
        router.push("/login");
      } else if (event === "SIGNED_IN") {
        void refreshAll();
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [refreshAll, configured, router]);

  // aplica preferências visuais sempre que mudam (+ segue o sistema no "auto")
  useEffect(() => {
    if (!settings) return;
    applySettings(settings);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (settings.theme === "auto") applySettings(settings);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [settings]);

  // presença ao vivo: o evento só avisa "mudou"; os valores vêm do
  // servidor já filtrados pela privacidade de cada pessoa (sem vazamento).
  const presenceQueue = useRef<Set<string>>(new Set());
  const presenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!configured || !user) return;
    const flush = async () => {
      const ids = [...presenceQueue.current];
      presenceQueue.current.clear();
      if (ids.length === 0) return;
      try {
        const res = await fetch("/api/presence/peers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids }),
        });
        const json = (await res.json()) as {
          presence?: Array<{ id: string; presence: Presence; last_seen_at: string | null }>;
        };
        (json.presence ?? []).forEach((p) => {
          setPresenceMap((prev) => ({
            ...prev,
            [p.id]: { presence: p.presence, last_seen_at: p.last_seen_at },
          }));
          if (p.id === user.id) {
            setProfile((prev) =>
              prev ? { ...prev, presence: p.presence, last_seen_at: p.last_seen_at } : prev,
            );
          }
        });
      } catch {
        /* próxima mudança atualiza */
      }
    };
    const sb = supabaseBrowser();
    const ch = subscribeProfiles(sb, (row) => {
      const id = row.id;
      if (typeof id !== "string") return;
      presenceQueue.current.add(id);
      if (presenceTimer.current) clearTimeout(presenceTimer.current);
      presenceTimer.current = setTimeout(() => void flush(), 800);
    });
    return () => {
      if (presenceTimer.current) clearTimeout(presenceTimer.current);
      unsubscribe(sb, ch);
    };
  }, [configured, user]);

  // heartbeat: "visto por último" a cada 60s + ao voltar pra aba
  useEffect(() => {
    if (!configured || !user) return;
    let stop = false;
    const beat = () => {
      if (stop || document.visibilityState === "hidden") return;
      fetch("/api/presence", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).catch(() => {});
    };
    beat();
    const t = setInterval(beat, 60000);
    const onVis = () => {
      if (document.visibilityState === "visible") beat();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stop = true;
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [configured, user]);

  const signOut = useCallback(async () => {
    const sb = supabaseBrowser();
    await sb.auth.signOut();
    setUser(null);
    setProfile(null);
    router.push("/login");
  }, [router]);

  const value = useMemo<AppState>(
    () => ({
      ready, configured, user, profile, settings, blocks, mutes, presenceMap, refreshAll,
      setProfileLocal: (p) => setProfile((prev) => (prev ? { ...prev, ...p } : prev)),
      setSettingsLocal: (s) => setSettings((prev) => (prev ? { ...prev, ...s } : prev)),
      setBlocksLocal: setBlocks,
      setMutesLocal: setMutes,
      signOut,
    }),
    [ready, configured, user, profile, settings, blocks, mutes, presenceMap, refreshAll, signOut],
  );

  return (
    <ToastCtx.Provider value={{ toast }}>
      <AppCtx.Provider value={value}>
        {children}
        <Toasts items={toasts} />
      </AppCtx.Provider>
    </ToastCtx.Provider>
  );
}
