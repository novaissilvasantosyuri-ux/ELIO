import { test, expect } from "@playwright/test";

/** Fumaça: a capa abre, o login abre e a API responde. */
test("capa + login + health", async ({ request, page }) => {
  const health = await request.get("/api/health");
  expect(health.ok()).toBeTruthy();

  await page.goto("/");
  await expect(page.getByRole("heading", { name: /perto de quem importa/i })).toBeVisible();

  await page.goto("/login");
  await expect(page.getByRole("heading", { name: /que bom te ver/i })).toBeVisible();
  await expect(page.getByPlaceholder("voce@exemplo.com")).toBeVisible();
});
