import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

// Pure rules only (lib/*.test.ts), so the default node environment is enough.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    include: ["lib/**/*.test.ts"],
  },
})
