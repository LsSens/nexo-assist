import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    pool: "vmForks",
    experimental: { viteModuleRunner: true },
    environment: "node",
    include: ["tests/**/*.test.ts"],
    fileParallelism: false,
    env: {
      NEXO_DB: path.join(root, "data", "test.sqlite"),
      AGENT_MODE: "rules",
      TICKET_FLAKY: "0",
      ALLOW_RESET: "1",
    },
  },
  resolve: {
    alias: { "@": path.join(root, "src") },
  },
});
