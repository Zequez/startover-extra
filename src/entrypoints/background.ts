import { browser, type Browser } from "wxt/browser";
import { savePageArchive } from "@/lib/pageArchiveDb";
import type {
  BackgroundToSidepanelMessage,
  FromPageMsg,
  ResourceFetchRequest,
  ResourceFetchResponse,
  SidepanelToBackgroundMessage,
  ToPageMsg,
} from "./msgs";

const SIDEPANEL_PORT = "sidepanel";
const PAGE_PORT = "mystrikingly-page";

type PendingArchive = {
  tabId: number;
  canonizedUrl: string;
  capturedAt: string;
  chunks: string[];
};

export default defineBackground(() => {
  const toolbarAction = browser.browserAction ?? browser.action;
  const pagePorts = new Map<number, Browser.runtime.Port>();
  const pendingArchives = new Map<string, PendingArchive>();
  let sidepanelPort: Browser.runtime.Port | null = null;

  async function getActiveTabId() {
    const [activeTab] = await browser.tabs.query({
      active: true,
      lastFocusedWindow: true,
    });

    return activeTab?.id ?? null;
  }

  async function forwardToActivePage(msg: ToPageMsg) {
    const activeTabId = await getActiveTabId();

    if (activeTabId == null) {
      return;
    }

    pagePorts.get(activeTabId)?.postMessage(msg);
  }

  function attachSidepanelPort(port: Browser.runtime.Port) {
    sidepanelPort = port;

    port.onMessage.addListener((message: SidepanelToBackgroundMessage) => {
      switch (message.id) {
        case "to-page":
          void forwardToActivePage(message.msg);
          break;
      }
    });

    port.onDisconnect.addListener(() => {
      if (sidepanelPort === port) {
        sidepanelPort = null;
      }
    });
  }

  function attachPagePort(port: Browser.runtime.Port) {
    const tabId = port.sender?.tab?.id;

    if (tabId == null) {
      port.disconnect();
      return;
    }

    const existingPort = pagePorts.get(tabId);

    if (existingPort != null && existingPort !== port) {
      try {
        existingPort.disconnect();
      } catch (error) {
        console.warn("Failed to replace page port", error);
      }
    }

    pagePorts.set(tabId, port);

    port.onMessage.addListener((message: FromPageMsg) => {
      void handlePageMessage(tabId, message);
    });

    port.onDisconnect.addListener(() => {
      if (pagePorts.get(tabId) === port) {
        pagePorts.delete(tabId);
      }

      for (const [archiveId, archive] of pendingArchives.entries()) {
        if (archive.tabId === tabId) {
          pendingArchives.delete(archiveId);
        }
      }
    });
  }

  async function handlePageMessage(tabId: number, message: FromPageMsg) {
    switch (message.id) {
      case "archive-start":
        pendingArchives.set(message.archiveId, {
          tabId,
          canonizedUrl: message.canonizedUrl,
          capturedAt: message.capturedAt,
          chunks: new Array(message.totalChunks),
        });
        break;
      case "archive-chunk": {
        const pendingArchive = pendingArchives.get(message.archiveId);

        if (pendingArchive == null) {
          return;
        }

        pendingArchive.chunks[message.chunkIndex] = message.chunk;
        break;
      }
      case "archive-complete":
        await persistPendingArchive(message.archiveId);
        break;
      case "archive-failed":
        notifySidepanel({
          id: "archive-failed",
          canonizedUrl: message.canonizedUrl,
          capturedAt: message.capturedAt,
          error: message.error,
        });
        break;
      default:
        await forwardFromPage(tabId, message);
        break;
    }
  }

  async function persistPendingArchive(archiveId: string) {
    const pendingArchive = pendingArchives.get(archiveId);

    if (pendingArchive == null) {
      return;
    }

    pendingArchives.delete(archiveId);

    const missingChunk = pendingArchive.chunks.findIndex(
      (chunk) => typeof chunk !== "string",
    );

    if (missingChunk !== -1) {
      notifySidepanel({
        id: "archive-failed",
        canonizedUrl: pendingArchive.canonizedUrl,
        capturedAt: pendingArchive.capturedAt,
        error: `Archive chunk ${missingChunk + 1} is missing`,
      });
      return;
    }

    try {
      const summary = await savePageArchive({
        canonizedUrl: pendingArchive.canonizedUrl,
        capturedAt: pendingArchive.capturedAt,
        html: new Blob(pendingArchive.chunks, {
          type: "text/html;charset=utf-8",
        }),
      });

      notifySidepanel({
        id: "archive-stored",
        summary,
      });
    } catch (error) {
      notifySidepanel({
        id: "archive-failed",
        canonizedUrl: pendingArchive.canonizedUrl,
        capturedAt: pendingArchive.capturedAt,
        error: toErrorMessage(error),
      });
    }
  }

  async function forwardFromPage(tabId: number, message: FromPageMsg) {
    const activeTabId = await getActiveTabId();

    if (activeTabId !== tabId) {
      return;
    }

    notifySidepanel({
      id: "from-page",
      msg: message,
    });
  }

  function notifySidepanel(message: BackgroundToSidepanelMessage) {
    sidepanelPort?.postMessage(message);
  }

  browser.runtime.onConnect.addListener((port) => {
    switch (port.name) {
      case SIDEPANEL_PORT:
        attachSidepanelPort(port);
        break;
      case PAGE_PORT:
        attachPagePort(port);
        break;
    }
  });

  browser.runtime.onMessage.addListener((message: ResourceFetchRequest) => {
    switch (message.id) {
      case "fetch-resource-data-url":
        return fetchResourceAsDataUrl(message.url);
      case "fetch-resource-text":
        return fetchResourceAsText(message.url);
      default:
        return undefined;
    }
  });

  toolbarAction?.onClicked.addListener(async () => {
    await (browser as any).sidebarAction?.open();
  });
});

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function fetchResourceAsDataUrl(
  url: string,
): Promise<ResourceFetchResponse> {
  try {
    const response = await fetch(url);

    if (!response.ok) {
      return {
        ok: false,
        error: `Failed to fetch resource: ${response.status} ${response.statusText}`,
      };
    }

    const blob = await response.blob();

    return {
      ok: true,
      dataUrl: await blobToDataUrl(blob),
    };
  } catch (error) {
    return {
      ok: false,
      error: toErrorMessage(error),
    };
  }
}

async function fetchResourceAsText(url: string): Promise<ResourceFetchResponse> {
  try {
    const response = await fetch(url);

    if (!response.ok) {
      return {
        ok: false,
        error: `Failed to fetch resource: ${response.status} ${response.statusText}`,
      };
    }

    return {
      ok: true,
      text: await response.text(),
    };
  } catch (error) {
    return {
      ok: false,
      error: toErrorMessage(error),
    };
  }
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Failed to convert blob to data URL"));
    };

    reader.onerror = () => {
      reject(reader.error ?? new Error("Failed to read blob"));
    };

    reader.readAsDataURL(blob);
  });
}
