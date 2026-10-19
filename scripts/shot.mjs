// Tira capturas de tela reais do app (sem Supabase: capa, login, cadastro).
import { chromium } from "@playwright/test";

const OUT = new URL("../preview/", import.meta.url);
const shots = [
  { name: "01-capa-desktop.png", path: "/", width: 1280, height: 800 },
  { name: "02-login-desktop.png", path: "/login", width: 1280, height: 800 },
  { name: "03-cadastro-desktop.png", path: "/register", width: 1280, height: 800 },
  { name: "04-capa-celular.png", path: "/", width: 390, height: 844 },
];

const browser = await chromium.launch();
for (const s of shots) {
  const page = await browser.newPage({ viewport: { width: s.width, height: s.height } });
  await page.goto(`http://localhost:3000${s.path}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  await page.screenshot({ path: new URL(s.name, OUT).pathname });
  console.log("OK", s.name);
  await page.close();
}
await browser.close();
