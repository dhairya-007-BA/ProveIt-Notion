import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  test: {
    maxWorkers: 1,
    pool: "threads",
    include: ["tests/**/*.test.{ts,tsx}"],
  },
});
