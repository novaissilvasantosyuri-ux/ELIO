import ptBR from "@/messages/pt-BR.json";

export type Dict = typeof ptBR;

/** Dicionário atual. Para novos idiomas: adicione o JSON e troque aqui. */
export const dict: Dict = ptBR;

/** Busca "a.b.c" no dicionário e interpola {vars}. Sem tradução → devolve a chave. */
export function t(path: string, vars?: Record<string, string | number>): string {
  const parts = path.split(".");
  let cur: unknown = dict;
  for (const p of parts) {
    if (typeof cur !== "object" || cur === null || !(p in cur)) return path;
    cur = (cur as Record<string, unknown>)[p];
  }
  if (typeof cur !== "string") return path;
  if (!vars) return cur;
  return cur.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
}
