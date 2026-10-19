"use client";

/** Chat aberto (celular: tela cheia com voltar). */
import React from "react";
import { useParams, useRouter } from "next/navigation";
import { ChatWindow } from "@/components/chat/ChatWindow";

export default function ChatPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === "string" ? params.id : "";
  if (!id) return null;
  return <ChatWindow conversationId={id} onBack={() => router.push("/conversas")} />;
}
