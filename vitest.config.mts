import solid from "@solidjs/vite-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [solid()],
  test: {
    environment: "jsdom",
    setupFiles: ["tests/setup-vendor.ts"],
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
  },
});
