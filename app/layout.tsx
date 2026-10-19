import type { Metadata, Viewport } from "next";
import { Nunito, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { AppProvider } from "@/components/providers";

const display = Nunito({
  subsets: ["latin"],
  weight: ["700", "800", "900"],
  variable: "--font-display",
  display: "swap",
});
const sans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Elio — Perto de quem importa",
    template: "%s · Elio",
  },
  description: "Conversas em tempo real, privadas e personalizáveis. Perto de quem importa.",
  applicationName: "Elio",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/favicon.svg",
    apple: "/icons/icon-192.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Elio",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FBFAF7" },
    { media: "(prefers-color-scheme: dark)", color: "#0E0923" },
  ],
};

// Aplica o tema ANTES da pintura (sem "piscar"). Espelha lib applySettings.
const THEME_INIT = `(function(){try{var s=JSON.parse(localStorage.getItem('elio-theme')||'{}');var mq=window.matchMedia('(prefers-color-scheme: dark)').matches;var th=s.theme||'auto';var r=th==='auto'?(mq?'dark':'light'):th;var d=document.documentElement;d.dataset.theme=r;d.dataset.font=s.font||'md';d.dataset.density=s.density||'comfortable';if(s.motion){d.dataset.motion='reduced';}if(s.accent){d.style.setProperty('--accent',s.accent);d.style.setProperty('--brand',s.accent);}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" data-theme="light" data-font="md" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body className={`${display.variable} ${sans.variable} font-sans`}>
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
