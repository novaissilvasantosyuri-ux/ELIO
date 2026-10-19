"use client";

/**
 * Estrutura do app: menu lateral (desktop/tablet) + barra inferior (celular).
 * Também hospeda a lista de conversas (1 assinatura realtime) e o título com não lidas.
 */
import React, { createContext, useContext, useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AvatarWithPresence, CountBadge, Dropdown, Icon, OfflineBanner, SoonBadge, type IconName, type MenuItem } from "@/components/ui";
import { ElioLogo } from "@/components/brand";
import { useApp, useToast } from "@/components/providers";
import { CallProvider } from "@/components/calls/CallProvider";
import { useConversationList } from "@/lib/chat-hooks";
import { useOnline, useTitleBadge, useVisualViewportVar } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";
import type { ConversationItem } from "@/lib/supabase/types";

/* ---------- contexto da caixa de entrada ---------- */
interface InboxCtxValue {
  items: ConversationItem[];
  loading: boolean;
  error: string | null;
  totalUnread: number;
  refresh: () => Promise<void>;
  patch: (id: string, body: Record<string, unknown>, onOk?: () => void) => Promise<void>;
}
const InboxCtx = createContext<InboxCtxValue>({
  items: [], loading: true, error: null, totalUnread: 0,
  refresh: async () => {}, patch: async () => {},
});
export const useInbox = () => useContext(InboxCtx);

const NAV_MAIN: Array<{ href: string; label: string; icon: IconName; soon?: boolean }> = [
  { href: "/conversas", label: t("nav.conversations"), icon: "chat" },
  { href: "/comunidades", label: t("nav.communities"), icon: "users" },
  { href: "/contatos", label: t("nav.contacts"), icon: "user" },
  { href: "/explorar", label: t("nav.explore"), icon: "compass" },
];
const NAV_BOTTOM_MOBILE = [
  { href: "/conversas", label: t("nav.conversations"), icon: "chat" as IconName },
  { href: "/comunidades", label: t("nav.communities"), icon: "users" as IconName },
  { href: "/contatos", label: t("nav.contacts"), icon: "user" as IconName },
  { href: "/explorar", label: t("nav.explore"), icon: "compass" as IconName },
  { href: "/perfil", label: t("nav.profile"), icon: "sliders" as IconName },
];

function StatusMenu({ onPick }: { onPick: (p: "online" | "away" | "busy" | "invisible") => void }) {
  const items: MenuItem[] = (["online", "away", "busy", "invisible"] as const).map((p) => ({
    label: t(`presence.${p}`),
    onSelect: () => onPick(p),
  }));
  return (
    <Dropdown
      trigger={
        <span className="inline-flex items-center gap-1 text-muted hover:text-ink cursor-pointer p-1" role="button" aria-label={t("profile.presence")} tabIndex={0}>
          <Icon name="chev-down" size={16} />
        </span>
      }
      items={items}
    />
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();
  const { profile, setProfileLocal, signOut, configured } = useApp();
  const inbox = useConversationList();
  const online = useOnline();
  useTitleBadge(inbox.totalUnread);
  useVisualViewportVar();

  const active = useMemo(() => {
    if (pathname.startsWith("/conversas")) return "/conversas";
    if (pathname.startsWith("/comunidades")) return "/comunidades";
    if (pathname.startsWith("/contatos")) return "/contatos";
    if (pathname.startsWith("/explorar")) return "/explorar";
    if (pathname.startsWith("/perfil")) return "/perfil";
    if (pathname.startsWith("/config")) return "/config";
    return "";
  }, [pathname ]);

  const setPresence = async (p: "online" | "away" | "busy" | "invisible") => {
    setProfileLocal({ presence: p });
    try {
      await fetch("/api/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ presence: p }),
      });
    } catch {
      toast(t("errors.generic"), "error");
    }
  };

  const doSignOut = async () => {
    await signOut();
    toast(t("auth.logoutOk"), "ok");
  };

  return (
    <InboxCtx.Provider value={inbox}>
      <div className="h-app flex flex-col bg-bg">
        {!online && <OfflineBanner />}
        {!configured && (
          <div className="px-4 py-2 bg-danger text-white text-[13px] font-medium text-center" role="alert">
            {t("errors.setupTitle")} — {t("errors.setupDesc")}
          </div>
        )}
        <div className="flex-1 min-h-0 flex">
          {/* ===== menu lateral (tablet/desktop) ===== */}
          <aside className="hidden tablet:flex flex-col shrink-0 w-[76px] desktop:w-64 glass border-r border-line">
            <div className="h-[72px] flex items-center justify-center desktop:justify-start desktop:px-5">
              <Link href="/conversas" aria-label="Elio — início" className="desktop:hidden">
                <ElioLogo compact />
              </Link>
              <Link href="/conversas" aria-label="Elio — início" className="hidden desktop:inline-flex">
                <ElioLogo />
              </Link>
            </div>

            <nav className="flex-1 overflow-y-auto px-2.5 desktop:px-3 py-2 space-y-1" aria-label="Principal">
              {NAV_MAIN.map((n) => {
                const isActive = active === n.href;
                return (
                  <Link
                    key={n.href} href={n.href} title={n.label}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-2xl min-h-[48px] px-3 font-semibold text-[15px] transition-all duration-200",
                      "justify-center desktop:justify-start",
                      isActive ? "bg-brand-soft text-brand" : "text-muted hover:bg-surface2 hover:text-ink",
                    )}
                  >
                    <span className="relative">
                      <Icon name={n.icon} size={21} />
                      {n.href === "/conversas" && inbox.totalUnread > 0 && (
                        <span className="absolute -top-1.5 -right-2 desktop:hidden">
                          <CountBadge count={inbox.totalUnread} />
                        </span>
                      )}
                    </span>
                    <span className="hidden desktop:inline-flex flex-1 items-center justify-between gap-2">
                      {n.label}
                      {n.href === "/conversas" ? <CountBadge count={inbox.totalUnread} /> : n.soon ? <SoonBadge /> : null}
                    </span>
                  </Link>
                );
              })}

              <div className="py-2"><hr className="border-line" /></div>

              {[
                { href: "/perfil", label: t("nav.profile"), icon: "user" as IconName },
                { href: "/config", label: t("nav.settings"), icon: "sliders" as IconName },
              ].map((n) => {
                const isActive = active === n.href;
                return (
                  <Link
                    key={n.href} href={n.href} title={n.label}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-2xl min-h-[48px] px-3 font-semibold text-[15px] transition-all duration-200",
                      "justify-center desktop:justify-start",
                      isActive ? "bg-brand-soft text-brand" : "text-muted hover:bg-surface2 hover:text-ink",
                    )}
                  >
                    <Icon name={n.icon} size={21} />
                    <span className="hidden desktop:inline">{n.label}</span>
                  </Link>
                );
              })}
              <button
                onClick={() => void doSignOut()} title={t("nav.logout")}
                className="w-full flex items-center gap-3 rounded-2xl min-h-[48px] px-3 font-semibold text-[15px] text-muted hover:bg-danger-soft hover:text-danger transition-all duration-200 justify-center desktop:justify-start"
              >
                <Icon name="logout" size={21} />
                <span className="hidden desktop:inline">{t("nav.logout")}</span>
              </button>
            </nav>

            {/* cartão do usuário */}
            <div className="p-2.5 desktop:p-3">
              <button
                onClick={() => router.push("/perfil")}
                className="w-full flex items-center gap-2.5 rounded-2xl bg-surface2/70 hover:bg-surface2 p-2 transition-colors"
                aria-label={t("nav.profile")}
              >
                <AvatarWithPresence
                  src={profile?.avatar_url} name={profile?.display_name ?? "?"}
                  size="sm" presence={profile?.presence}
                />
                <span className="hidden desktop:flex flex-1 min-w-0 flex-col text-left">
                  <span className="text-sm font-bold truncate">{profile?.display_name}</span>
                  <span className="text-xs text-muted truncate">
                    {profile?.status_emoji} {profile?.status_text || t(`presence.${profile?.presence ?? "online"}`)}
                  </span>
                </span>
              </button>
              <span className="hidden desktop:flex justify-center pt-1">
                <StatusMenu onPick={(p) => void setPresence(p)} />
              </span>
            </div>
          </aside>

          {/* ===== conteúdo ===== */}
          <main className="flex-1 min-w-0 min-h-0 flex pb-[68px] tablet:pb-0">
            {children}
          </main>
        </div>

        {/* ===== barra inferior (celular) ===== */}
        <nav className="tablet:hidden fixed bottom-0 inset-x-0 glass border-t border-line z-30" aria-label="Principal">
          <div className="grid grid-cols-5 h-[68px] pb-[env(safe-area-inset-bottom)]">
            {NAV_BOTTOM_MOBILE.map((n) => {
              const isActive = active === n.href;
              return (
                <Link
                  key={n.href} href={n.href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "relative flex flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors",
                    isActive ? "text-brand" : "text-muted",
                  )}
                >
                  <Icon name={n.icon} size={23} />
                  {n.href === "/perfil" ? t("nav.profile").replace("Meu ", "") : n.label}
                  {n.href === "/conversas" && inbox.totalUnread > 0 && (
                    <span className="absolute top-1 right-1/2 translate-x-6">
                      <CountBadge count={inbox.totalUnread} />
                    </span>
                  )}
                  {isActive && <span className="absolute top-0 w-10 h-1 rounded-full bg-brand" />}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
      <CallProvider />
    </InboxCtx.Provider>
  );
}
