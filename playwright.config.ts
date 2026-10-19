import { defineConfig } from "@playwright/test";

/** E2E (fumaça na Fase 1; fluxos completos na Fase 7). */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  use: { baseURL: process.env.E2E_URL ?? "http://localhost:3100" },
  webServer: process.env.E2E_URL
    ? undefined
    : { command: "npm run start -- --port 3100", port: 3100, reuseExistingServer: true },
});
