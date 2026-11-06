import solid from "@solidjs/vite-plugin";
import { defineConfig } from "vite";
import frozenAssets from "./vite-plugins/frozen-assets.mts";

/**
 * GitHub project Pages serves this repository at
 * https://zzl221000.github.io/moye/, so the app is built under "/moye/".
 * `bun run dev` and `bun run preview` serve the same base path.
 */
const PAGES_BASE = "/moye/";

export default defineConfig({
  base: PAGES_BASE,
  plugins: [frozenAssets(), solid()],
});
