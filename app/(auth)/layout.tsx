import Link from "next/link";
import { ElioLogo } from "@/components/brand";

/** Moldura das telas de entrada: cartão centralizado com a marca. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-4 py-10">
      <Link href="/" aria-label="Elio — início">
        <ElioLogo />
      </Link>
      <div className="anim-fade-up w-full max-w-md mt-6 rounded-3xl border border-line bg-surface shadow-pop p-6 tablet:p-8">
        {children}
      </div>
    </div>
  );
}
