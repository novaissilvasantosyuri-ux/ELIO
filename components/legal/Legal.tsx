"use client";

/**
 * Textos legais: busca do banco (editáveis) com reserva local.
 * Mini-markdown seguro (sem innerHTML).
 */
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Button, Modal, Spinner } from "@/components/ui";
import { t } from "@/lib/i18n";

/** Negrito **x** dentro de um parágrafo (seguro: só texto). */
function inline(text: string, keyPrefix: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? (
      <strong key={`${keyPrefix}-${i}`}>{p.slice(2, -2)}</strong>
    ) : (
      <React.Fragment key={`${keyPrefix}-${i}`}>{p}</React.Fragment>
    ),
  );
}

export function Markdown({ md }: { md: string }) {
  const lines = md.split("\n");
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  const flushList = () => {
    if (list.length > 0) {
      blocks.push(
        <ul key={`ul-${blocks.length}`} className="list-disc pl-6 space-y-1 my-2">
          {list.map((x, i) => (
            <li key={i}>{inline(x, `li${i}`)}</li>
          ))}
        </ul>,
      );
      list = [];
    }
  };
  lines.forEach((raw) => {
    const line = raw.trimEnd();
    if (line.startsWith("- ")) {
      list.push(line.slice(2));
      return;
    }
    flushList();
    if (line.startsWith("## ")) {
      blocks.push(<h2 key={blocks.length} className="font-display font-extrabold text-lg mt-5 mb-1">{line.slice(3)}</h2>);
    } else if (line.startsWith("# ")) {
      blocks.push(<h1 key={blocks.length} className="font-display font-extrabold text-2xl mb-2">{line.slice(2)}</h1>);
    } else if (line.trim() === "") {
      blocks.push(<span key={blocks.length} className="block h-2" />);
    } else {
      blocks.push(<p key={blocks.length} className="leading-relaxed">{inline(line, `p${blocks.length}`)}</p>);
    }
  });
  flushList();
  return <div className="text-[15px] flex flex-col gap-1">{blocks}</div>;
}

const FALLBACK: Record<"terms" | "privacy", { title: string; body: string }> = {
  terms: {
    title: "Termos de Uso",
    body: "# Termos de Uso (resumo)\n\n## 1. Sua conta\nCuide da sua senha e respeite a idade mínima.\n\n## 2. Uso respeitoso\nSem spam, assédio, golpes ou conteúdo ilegal.\n\n## 3. Segurança honesta\nUsamos **criptografia em trânsito (HTTPS)**. **Não afirmamos criptografia de ponta a ponta nem segurança absoluta.**",
  },
  privacy: {
    title: "Política de Privacidade",
    body: "# Política de Privacidade (resumo)\n\n## O que coletamos\nConta, perfil, mensagens (para sincronizar) e registros de segurança.\n\n## O que NÃO fazemos\n**Não vendemos dados** e não mostramos anúncios baseados nas suas conversas.\n\n## Seus direitos (LGPD)\nAcesso, correção, exportação e exclusão, direto no app.",
  },
};

export function useLegal(kind: "terms" | "privacy") {
  const [doc, setDoc] = useState<{ title: string; body: string } | null>(null);
  useEffect(() => {
    let stop = false;
    fetch(`/api/legal?kind=${kind}`)
      .then((r) => r.json())
      .then((j: { legal?: { title: string; body_md: string } | null }) => {
        if (stop) return;
        if (j.legal) setDoc({ title: j.legal.title, body: j.legal.body_md });
        else setDoc(FALLBACK[kind]);
      })
      .catch(() => {
        if (!stop) setDoc(FALLBACK[kind]);
      });
    return () => {
      stop = true;
    };
  }, [kind]);
  return doc;
}

/** Modal de aceite (cadastro): lê e aceita para continuar. */
export function TermsModal({
  open, onClose, onAccept,
}: { open: boolean; onClose: () => void; onAccept: () => void }) {
  const [tab, setTab] = useState<"terms" | "privacy">("terms");
  const doc = useLegal(tab);
  return (
    <Modal open={open} onClose={onClose} title={tab === "terms" ? t("legal.termsTitle") : t("legal.privacyTitle")} wide>
      <div className="flex gap-2 mb-4">
        {(["terms", "privacy"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`h-10 px-4 rounded-xl text-sm font-bold ${tab === k ? "bg-brand-soft text-brand" : "bg-surface2 text-muted"}`}
          >
            {k === "terms" ? t("legal.termsTitle") : t("legal.privacyTitle")}
          </button>
        ))}
      </div>
      {!doc && <div className="flex justify-center py-10 text-muted"><Spinner /></div>}
      {doc && (
        <div className="max-h-[46dvh] overflow-y-auto pr-1">
          <Markdown md={doc.body} />
        </div>
      )}
      <div className="flex gap-2.5 mt-5">
        <Button variant="secondary" full onClick={onClose}>{t("legal.close")}</Button>
        <Button full onClick={onAccept}>{t("legal.accept")}</Button>
      </div>
    </Modal>
  );
}

/** Links "Termos · Privacidade" para rodapés. */
export function LegalLinks({ className }: { className?: string }) {
  return (
    <p className={className}>
      <Link href="/legal/termos" className="underline underline-offset-2">{t("auth.terms")}</Link>
      {" · "}
      <Link href="/legal/privacidade" className="underline underline-offset-2">{t("auth.privacy")}</Link>
    </p>
  );
}
