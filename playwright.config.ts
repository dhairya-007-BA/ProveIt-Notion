import { defineConfig, devices } from "@playwright/test";

const port = 3100;

export default defineConfig({
  testDir: "./tests/e2e",
  // Every E2E spec uses the same deterministic emulator fixtures and several
  // workflows mutate them; serialize the suite to prevent cross-spec races.
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "on-first-retry",
  },
  webServer: {
    command: [
      "NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true",
      "NEXT_PUBLIC_FIREBASE_PROJECT_ID=proveit-test",
      "NEXT_PUBLIC_FIREBASE_API_KEY=local-test-key",
      "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=127.0.0.1",
      "NEXT_PUBLIC_FIREBASE_APP_ID=local-test-app",
      "NEXT_DIST_DIR=.next-e2e",
      `next dev --port ${port}`,
    ].join(" "),
    port,
    reuseExistingServer: false,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
