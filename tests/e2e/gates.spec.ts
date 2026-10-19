import { test, expect } from "@playwright/test";

/** Portões (Fase 7): deslogado não entra na área logada nem usa a API. */
test("deslogado cai no login", async ({ page }) => {
  await page.goto("/conversas");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: /que bom te ver/i })).toBeVisible();

  await page.goto("/comunidades/qualquer-coisa");
  await expect(page).toHaveURL(/\/login/);
});

test("API sem sessão nega com 401/403", async ({ request }) => {
  const unauth = [
    request.get("/api/conversations"),
    request.get("/api/communities"),
    request.get("/api/communities/explore"),
    request.get("/api/channels/123e4567-e89b-12d3-a456-426614174000"),
    request.get("/api/ia/chat"),
    request.post("/api/ia", { data: { text: "oi", client_id: "123e4567-e89b-12d3-a456-426614174000" } }),
    request.post("/api/calls", { data: { conversation_id: "123e4567-e89b-12d3-a456-426614174000", kind: "voice" } }),
    request.get("/api/calls/ice"),
    request.get("/api/push/vapid-key"),
    request.post("/api/push/subscribe", { data: { endpoint: "x", p256dh: "y", auth: "z" } }),
  ];
  for (const p of unauth) {
    const res = await p;
    expect(res.status()).toBe(401);
  }

  // purge exige o segredo do cron (logado ou não)
  const purge = await request.post("/api/cron/purge");
  expect(purge.status()).toBe(403);
  const purgeWrong = await request.post("/api/cron/purge", { headers: { "x-cron-secret": "errado" } });
  expect(purgeWrong.status()).toBe(403);
});
