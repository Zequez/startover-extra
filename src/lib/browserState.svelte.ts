import { browser, type Browser } from "wxt/browser";
import type { PageArchiveSummary } from "@/lib/pageArchiveDb";
import type {
  BackgroundToSidepanelMessage,
  FromPageMsg,
  SidepanelToBackgroundMessage,
  ToPageMsg,
} from "../entrypoints/msgs";
import type { initPagesState } from "./pagesState.svelte";
import type { initArchiveState } from "./archiveState.svelte";

const SIDEPANEL_PORT = "sidepanel";

type BrowserStateOptions = {
  onArchiveStored?: (summary: PageArchiveSummary) => void;
  onArchiveFailed?: (canonizedUrl: string, error: string) => void;
};

type PagesState = ReturnType<typeof initPagesState>;
type ArchiveState = ReturnType<typeof initArchiveState>;

export function initBrowserState(
  pagesState: PagesState,
  archiveState: ArchiveState,
  options: BrowserStateOptions = {},
) {
  let activeTab = $state<string | null>(null);
  let analyzing = $state(false);
  let sequentialArchive = $state<boolean>(false);
  let port: Browser.runtime.Port | null = null;
  let staleArchiveTimespan = $state(0);

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

    console.log("TAB STATUS", tab.status);

    setActiveTab(tab?.url ?? null);
  }

  async function activeTabIsStillLoading() {
    const [tab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });

    return tab?.status === "loading";
  }

  let pageLoadingCb = $state<
    [url: string, timestamp: Date, cb: () => void] | null
  >(null);

  let isWaitingForPage = $derived(pageLoadingCb && pageLoadingCb[0]);

  function storePageLoadingCb(url: string, cb: () => void) {
    const date = new Date();
    pageLoadingCb = [url, date, cb];

    async function reCheck() {
      if (pageLoadingCb && pageLoadingCb[1] === date) {
        if (await activeTabIsStillLoading()) {
          setTimeout(reCheck, 1000);
          return;
        } else {
          pageLoadingCb[2]();
          pageLoadingCb = null;
        }
      }
    }

    setTimeout(reCheck, 10000);
  }

  function handleFromPageMessage(msg: FromPageMsg) {
    switch (msg.id) {
      case "page-ready":
        console.log("PAGE READY!");
        if (pageLoadingCb && pageLoadingCb[0] === msg.from) {
          pageLoadingCb[2]();
          pageLoadingCb = null;
        }
        break;
      case "links":
        pagesState.setPagesList(msg.links);
        break;
    }
  }

  function sendToBackground(msg: SidepanelToBackgroundMessage) {
    port?.postMessage(msg);
  }

  function analyzeCurrentTab() {
    analyzing = true;
    sendToBackground({
      id: "to-page",
      msg: { id: "analyze" },
    });
  }

  function fetchLinks() {
    sendToBackground({
      id: "to-page",
      msg: { id: "fetch-links" },
    });
  }

  async function openInCurrentTab(url: string, callback?: () => void) {
    if (pageLoadingCb && pageLoadingCb[0] === url) {
      return;
    }

    storePageLoadingCb(url, () => {
      console.log(`Page ${url} loaded`);
      if (callback) callback();
    });

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

  async function openAndFetchLinks(url: string) {
    await openInCurrentTab(url, () => {
      console.log("YES! DONE!");
      fetchLinks();
    });
  }

  function openAndAnalyze(url: string) {
    openInCurrentTab(url, () => {
      console.log("YES! IT OPENED!");
      analyzeCurrentTab();
    });
  }

  function enableSequentialArchive() {
    sequentialArchive = true;
  }

  function getNextPage() {
    if (activeTab) {
      let currentPageIndex = pagesState.pages.indexOf(activeTab);
      if (currentPageIndex !== -1) {
        function tryNext() {
          currentPageIndex += 1;
          const nextPage = pagesState.pages[currentPageIndex];
          if (nextPage) {
            const timeSinceLastArchive =
              archiveState.timeSinceLastArchiveByUrl[nextPage];
            const isStale =
              timeSinceLastArchive === null
                ? true
                : timeSinceLastArchive > staleArchiveTimespan;
            if (isStale) {
              return nextPage;
            } else {
              return tryNext();
            }
          } else {
            return null;
          }
        }
        return tryNext();
      }
    }
    return null;
  }

  function disableSequentialArchive() {
    sequentialArchive = false;
  }

  function mount() {
    void syncActiveTab();

    const nextPort = browser.runtime.connect({ name: SIDEPANEL_PORT });

    const onMessage = (message: BackgroundToSidepanelMessage) => {
      console.log("MESSAGE", message);
      switch (message.id) {
        case "from-page":
          handleFromPageMessage(message.msg);
          break;
        case "archive-stored":
          console.log("SEQUENTIAL ARCHIVE", sequentialArchive);
          options.onArchiveStored?.(message.summary);
          if (sequentialArchive) {
            const nextPage = getNextPage();
            console.log("Next page!", nextPage);
            if (nextPage) {
              openAndAnalyze(nextPage);
            } else {
              sequentialArchive = false;
            }
          } else {
            analyzing = false;
          }

          break;
        case "archive-failed":
          options.onArchiveFailed?.(message.canonizedUrl, message.error);
          sequentialArchive = false;
          analyzing = false;
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
    get sequentialArchive() {
      return sequentialArchive;
    },
    get isWaitingForPage() {
      return isWaitingForPage;
    },
    get staleArchiveTimespan() {
      return staleArchiveTimespan;
    },
    mount,
    enableSequentialArchive,
    disableSequentialArchive,
    syncActiveTab,
    setActiveTab,
    openInCurrentTab,
    openAndFetchLinks,
    analyzeCurrentTab,
    setStaleArchiveTimespan(ms: number) {
      staleArchiveTimespan = ms;
    },
  };
}
