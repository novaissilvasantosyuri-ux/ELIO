"use client";

/**
 * Conversas: lista + detalhe.
 * Celular: uma coisa por vez (lista OU chat em tela cheia).
 * Tablet/desktop: lista + chat lado a lado.
 */
import React from "react";
import { useParams, usePathname } from "next/navigation";
import { ConversationList } from "@/components/layout/ConversationList";
import { cn } from "@/lib/utils";

export default function ConversasLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const params = useParams();
  const openId = typeof params.id === "string" ? params.id : null;
  const chatOpen = pathname !== "/conversas";

  return (
    <div className="flex-1 min-w-0 min-h-0 flex">
      {/* lista */}
      <div
        className={cn(
          "min-h-0 flex-col w-full tablet:w-[340px] desktop:w-[380px] shrink-0",
          "tablet:border-r tablet:border-line bg-surface tablet:bg-transparent",
          chatOpen ? "hidden tablet:flex" : "flex",
        )}
      >
        <ConversationList selectedId={openId} />
      </div>
      {/* detalhe */}
      <div className={cn("flex-1 min-w-0 min-h-0 flex-col", chatOpen ? "flex" : "hidden tablet:flex")}>
        {children}
      </div>
    </div>
  );
}
