import {
  countPageArchives,
  deleteOldPageArchives,
  getLatestPageArchive,
  getLatestPageArchiveSummary,
  type PageArchiveSummary,
} from "@/lib/pageArchiveDb";
import { extractMyStrikinglyPageName } from "./normalizePage";

export function initArchiveState() {
  let latestByUrl = $state<Record<string, PageArchiveSummary | null>>({});
  let countByUrl = $state<Record<string, number>>({});
  let loadingByUrl = $state<Record<string, boolean>>({});
  let timeSinceLastArchiveByUrl = $state<Record<string, number | null>>({});
  let errorByUrl = $state<Record<string, string | null>>({});
  let actionLoadingByUrl = $state<Record<string, boolean>>({});
  let downloading = $state(false);

  async function refreshForUrl(canonizedUrl: string | null) {
    if (canonizedUrl == null) {
      return;
    }

    loadingByUrl[canonizedUrl] = true;

    try {
      const [latestArchive, archiveCount] = await Promise.all([
        getLatestPageArchiveSummary(canonizedUrl),
        countPageArchives(canonizedUrl),
      ]);

      latestByUrl[canonizedUrl] = latestArchive;
      countByUrl[canonizedUrl] = archiveCount;
      errorByUrl[canonizedUrl] = null;
      timeSinceLastArchiveByUrl[canonizedUrl] = latestArchive
        ? Date.now() - new Date(latestArchive.capturedAt).getTime()
        : null;
    } catch (error) {
      errorByUrl[canonizedUrl] = toErrorMessage(error);
    } finally {
      loadingByUrl[canonizedUrl] = false;
    }
  }

  async function refreshForUrls(canonizedUrls: string[]) {
    await Promise.all(
      canonizedUrls.map((canonizedUrl) => refreshForUrl(canonizedUrl)),
    );
  }

  function noteArchiveStored(summary: PageArchiveSummary) {
    latestByUrl[summary.canonizedUrl] = summary;
    countByUrl[summary.canonizedUrl] =
      (countByUrl[summary.canonizedUrl] ?? 0) + 1;
    errorByUrl[summary.canonizedUrl] = null;
  }

  function noteArchiveFailed(canonizedUrl: string, error: string) {
    errorByUrl[canonizedUrl] = error;
  }

  async function downloadLatestForUrl(
    canonizedUrl: string,
    ignoreError: boolean = false,
  ) {
    actionLoadingByUrl[canonizedUrl] = true;

    try {
      const archive = await getLatestPageArchive(canonizedUrl);

      if (archive == null) {
        if (ignoreError) return;
        errorByUrl[canonizedUrl] = "No backups available for this page.";
        return false;
      }

      errorByUrl[canonizedUrl] = null;

      downloadBlob(
        archive.html,
        buildArchiveFileName(canonizedUrl, archive.capturedAt),
      );
      return true;
    } catch (error) {
      errorByUrl[canonizedUrl] = toErrorMessage(error);
    } finally {
      actionLoadingByUrl[canonizedUrl] = false;
    }
    return false;
  }

  async function downloadAll() {
    downloading = true;
    for (const url in latestByUrl) {
      if (downloading) {
        const didIt = await downloadLatestForUrl(url, true);
        if (didIt) {
          await waitMs(250);
        }
      }
    }
    downloading = false;
  }

  function waitMs(ms: number) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  async function cleanupOldBackupsForUrl(canonizedUrl: string) {
    actionLoadingByUrl[canonizedUrl] = true;

    try {
      await deleteOldPageArchives(canonizedUrl);
      await refreshForUrl(canonizedUrl);
      errorByUrl[canonizedUrl] = null;
    } catch (error) {
      errorByUrl[canonizedUrl] = toErrorMessage(error);
    } finally {
      actionLoadingByUrl[canonizedUrl] = false;
    }
  }

  return {
    get latestByUrl() {
      return latestByUrl;
    },
    get countByUrl() {
      return countByUrl;
    },
    get loadingByUrl() {
      return loadingByUrl;
    },
    get errorByUrl() {
      return errorByUrl;
    },
    get actionLoadingByUrl() {
      return actionLoadingByUrl;
    },
    get timeSinceLastArchiveByUrl() {
      return timeSinceLastArchiveByUrl;
    },
    get downloading() {
      return downloading;
    },
    refreshForUrl,
    refreshForUrls,
    noteArchiveStored,
    noteArchiveFailed,
    downloadLatestForUrl,
    downloadAll,
    interruptDownload() {
      downloading = false;
    },
    cleanupOldBackupsForUrl,
  };
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function buildArchiveFileName(canonizedUrl: string, capturedAt: string) {
  const name = extractMyStrikinglyPageName(canonizedUrl);
  return `${name}.html`;
}

function downloadBlob(blob: Blob, fileName: string) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.click();

  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, 60_000);
}
