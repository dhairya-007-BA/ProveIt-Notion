import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("keeps automated Firebase tests isolated to emulators", () => {
  const firebaseConfig = JSON.parse(
    readFileSync("firebase.json", "utf8")
  ) as {
    emulators?: {
      auth?: { port?: number };
      firestore?: { port?: number };
    };
  };
  const scripts = JSON.parse(
    readFileSync("package.json", "utf8")
  ) as {
    scripts?: Record<string, string>;
  };

  expect(firebaseConfig.emulators?.auth?.port).toBe(9099);
  expect(firebaseConfig.emulators?.firestore?.port).toBe(8080);
  expect(scripts.scripts?.["test:rules"]).toContain(
    "emulators:exec"
  );
  expect(scripts.scripts?.["test:e2e"]).toContain(
    "emulators:exec"
  );
});
