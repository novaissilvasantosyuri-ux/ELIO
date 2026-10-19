"use client";

/** Cartão de perfil de outra pessoa. */
import React from "react";
import { useParams } from "next/navigation";
import { UserCard } from "@/components/profile/UserCard";

export default function OtherProfilePage() {
  const params = useParams();
  const username = typeof params.username === "string" ? decodeURIComponent(params.username) : "";
  if (!username) return null;
  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <UserCard username={username} />
    </div>
  );
}
