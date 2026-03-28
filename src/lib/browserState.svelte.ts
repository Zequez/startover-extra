import { browser, type Browser } from "wxt/browser";
import type { PageArchiveSummary } from "@/lib/pageArchiveDb";
import type {
  BackgroundToSidepanelMessage,
  FromPageMsg,
  SidepanelToBackgroundMessage,
  ToPageMsg,
} from "../entrypoints/msgs";
import type { initPagesState } from "./pagesState.svelte";

const SIDEPANEL_PORT = "sidepanel";

type BrowserStateOptions = {
  onArchiveStored?: (summary: PageArchiveSummary) => void;
  onArchiveFailed?: (canonizedUrl: string, error: string) => void;
};

type PagesState = ReturnType<typeof initPagesState>;

export function initBrowserState(
  pagesState: PagesState,
  options: BrowserStateOptions = {},
) {
  let activeTab = $state<string | null>(null);
  let port: Browser.runtime.Port | null = null;

  function setActiveTab(url: string | null) {
    activeTab = pagesState.normalizePage(url ?? "") ?? url;
  }

  async function syncActiveTab(force?: string) {
    if (force != null) {
      setActiveTab(force);
      return;
    }

    const [tab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });

    setActiveTab(tab?.url ?? null);
  }

  function handleFromPageMessage(msg: FromPageMsg) {
    switch (msg.id) {
      case "links":
        pagesState.processPages(msg.from, msg.links);
        break;
    }
  }

  function sendToBackground(msg: SidepanelToBackgroundMessage) {
    port?.postMessage(msg);
  }

  function analyzeCurrentTab() {
    sendToBackground({
      id: "to-page",
      msg: { id: "analyze" },
    });
  }

  async function openInCurrentTab(url: string) {
    const [browserActiveTab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });

    void syncActiveTab(url);

    if (browserActiveTab?.id != null) {
      await browser.tabs.update(browserActiveTab.id, { url });
      return;
    }

    await browser.tabs.create({ url });
  }

  function mount() {
    void syncActiveTab();

    const nextPort = browser.runtime.connect({ name: SIDEPANEL_PORT });

    const onMessage = (message: BackgroundToSidepanelMessage) => {
      switch (message.id) {
        case "from-page":
          handleFromPageMessage(message.msg);
          break;
        case "archive-stored":
          options.onArchiveStored?.(message.summary);
          break;
        case "archive-failed":
          options.onArchiveFailed?.(message.canonizedUrl, message.error);
          break;
      }
    };

    const handleActivated = () => {
      void syncActiveTab();
    };

    const handleUpdated = (
      _tabId: number,
      changeInfo: { status?: string; url?: string },
      tab: Browser.tabs.Tab,
    ) => {
      if (
        tab.active ||
        changeInfo.status === "complete" ||
        changeInfo.url != null
      ) {
        void syncActiveTab();
      }
    };

    port = nextPort;
    nextPort.onMessage.addListener(onMessage);
    browser.tabs.onActivated.addListener(handleActivated);
    browser.tabs.onUpdated.addListener(handleUpdated);

    return () => {
      nextPort.onMessage.removeListener(onMessage);
      nextPort.disconnect();
      browser.tabs.onActivated.removeListener(handleActivated);
      browser.tabs.onUpdated.removeListener(handleUpdated);

      if (port === nextPort) {
        port = null;
      }
    };
  }

  return {
    get activeTab() {
      return activeTab;
    },
    mount,
    syncActiveTab,
    setActiveTab,
    openInCurrentTab,
    analyzeCurrentTab,
  };
}
