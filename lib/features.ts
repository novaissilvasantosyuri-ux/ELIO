/**
 * Feature flags: módulos não prontos aparecem como "Em breve".
 * Fase 1: tudo avançado desligado por padrão.
 */
function flag(name: string, fallback = false): boolean {
  const v =
    process.env[`NEXT_PUBLIC_${name}`] ?? process.env[name] ?? (fallback ? "true" : "false");
  return v === "true" || v === "1";
}

export const features = {
  /** Chamadas de voz/vídeo (Fase 6). */
  get calls() {
    return flag("FEATURE_CALLS");
  },
  /** Elio IA (Fase 5). */
  get elioIA() {
    return flag("FEATURE_ELIO_IA");
  },
  /** Comunidades e Explorar (Fase 3; sempre ligado — sem uso, mantido p/ compat). */
  get communities() {
    return flag("FEATURE_COMMUNITIES");
  },
  /** Grupos (Fase 4). */
  get groups() {
    return flag("FEATURE_GROUPS");
  },
  /** Mensagens de voz (Fase 2). */
  get voice() {
    return flag("FEATURE_VOICE");
  },
  /** Imagens e arquivos (Fase 2). */
  get files() {
    return flag("FEATURE_FILES");
  },
};
