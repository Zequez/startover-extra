import { defineConfig } from "wxt";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";
import tailwindcss from "@tailwindcss/vite";

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: "src",
  webExt: {
    disabled: true,
  },
  modules: ["@wxt-dev/module-svelte"],
  manifest: {
    name: "Startover Extra",
    description: "Offline backup and browser for Startover.xyz",
    permissions: ["storage"],
    web_accessible_resources: [
      {
        resources: ["dashboard.html"],
        matches: ["*://*/*"],
      },
    ],
    action: {
      default_title: "Open Side Panel",
    },
  },
  vite: () => ({
    plugins: [wasm(), topLevelAwait(), tailwindcss()],
  }),
});
