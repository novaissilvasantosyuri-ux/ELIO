import { CommunityDetail } from "@/components/communities/CommunityDetail";

/** Detalhe da comunidade (Fase 3): canais, membros e dados. */
export default async function ComunidadePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CommunityDetail id={id} />;
}
