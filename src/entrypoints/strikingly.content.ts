import { mount, unmount } from "svelte";
import { browser } from "wxt/browser";
import { defineContentScript } from "wxt/utils/define-content-script";
import appCss from "../app.css?inline";
import CustomNavbar from "./strikingly/CustomNavbar.svelte";
import PageIndicator from "./strikingly/PageIndicator.svelte";

const PAGE_PORT = "mystrikingly-page";
const HOST_ID = "startover-extra-page-indicator-root";
const NAVBAR_HOST_ID = "startover-extra-custom-navbar-root";

declare global {
  interface Window {
    __startoverExtraPageCleanup__?: () => void;
  }
}

export default defineContentScript({
  matches: ["*://*.mystrikingly.com/*"],
  runAt: "document_idle",
  main() {
    window.__startoverExtraPageCleanup__?.();

    const navHost = document.createElement("div");
    navHost.id = NAVBAR_HOST_ID;

    document.body.prepend(navHost);

    const host = document.createElement("div");
    host.id = HOST_ID;
    document.documentElement.append(host);

    const shadowRoot = host.attachShadow({ mode: "open" });
    const stylesheet = document.createElement("style");
    stylesheet.textContent = appCss;
    shadowRoot.append(stylesheet);

    const target = document.createElement("div");
    shadowRoot.append(target);

    const port = browser.runtime.connect({ name: PAGE_PORT });
    const navbarComponent = mount(CustomNavbar, {
      target: navHost,
    });
    const component = mount(PageIndicator, {
      target,
      props: {
        port,
      },
    });

    let cleanedUp = false;

    const cleanup = () => {
      if (cleanedUp) {
        return;
      }

      cleanedUp = true;
      port.onDisconnect.removeListener(cleanup);
      unmount(navbarComponent);
      unmount(component);
      navHost.remove();
      host.remove();

      if (window.__startoverExtraPageCleanup__ === cleanup) {
        delete window.__startoverExtraPageCleanup__;
      }
    };

    window.__startoverExtraPageCleanup__ = cleanup;
    port.onDisconnect.addListener(cleanup);
  },
});
