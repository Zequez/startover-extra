import { defineConfig } from "wxt";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";
// import tailwindcss from "@tailwindcss/vite";
import UnoCSS from "unocss/vite";

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: "src",
  webExt: {
    disabled: true,
  },
  modules: ["@wxt-dev/module-svelte", "@wxt-dev/auto-icons"],
  manifest: {
    name: "Startover Backup",
    description: "Offline backup orchestrator for Startover.xyz",
    permissions: ["storage", "tabs", "<all_urls>"],
    web_accessible_resources: [
      {
        resources: ["dashboard.html"],
        matches: ["*://*/*"],
      },
      {
        resources: ["sidepanel.html"],
        matches: ["*://*/*"],
      },
    ],
    side_panel: {
      default_path: "sidepanel.html",
    },
    action: {
      default_title: "Open Startover Backup Sidebar",
    },
  },
  vite: () => ({
    plugins: [wasm(), topLevelAwait(), UnoCSS()],
  }),
});
