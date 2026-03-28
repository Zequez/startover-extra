import {
  countPageArchives,
  deleteOldPageArchives,
  getLatestPageArchive,
  getLatestPageArchiveSummary,
  type PageArchiveSummary,
} from "@/lib/pageArchiveDb";

export function initArchiveState() {
  let latestByUrl = $state<Record<string, PageArchiveSummary | null>>({});
  let countByUrl = $state<Record<string, number>>({});
  let loadingByUrl = $state<Record<string, boolean>>({});
  let errorByUrl = $state<Record<string, string | null>>({});
  let actionLoadingByUrl = $state<Record<string, boolean>>({});

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
    } catch (error) {
      errorByUrl[canonizedUrl] = toErrorMessage(error);
    } finally {
      loadingByUrl[canonizedUrl] = false;
    }
  }

  async function refreshForUrls(canonizedUrls: string[]) {
    await Promise.all(canonizedUrls.map((canonizedUrl) => refreshForUrl(canonizedUrl)));
  }

  function noteArchiveStored(summary: PageArchiveSummary) {
    latestByUrl[summary.canonizedUrl] = summary;
    countByUrl[summary.canonizedUrl] = (countByUrl[summary.canonizedUrl] ?? 0) + 1;
    errorByUrl[summary.canonizedUrl] = null;
  }

  function noteArchiveFailed(canonizedUrl: string, error: string) {
    errorByUrl[canonizedUrl] = error;
  }

  async function downloadLatestForUrl(canonizedUrl: string) {
    actionLoadingByUrl[canonizedUrl] = true;

    try {
      const archive = await getLatestPageArchive(canonizedUrl);

      if (archive == null) {
        errorByUrl[canonizedUrl] = "No backups available for this page.";
        return;
      }

      errorByUrl[canonizedUrl] = null;
      downloadBlob(
        archive.html,
        buildArchiveFileName(canonizedUrl, archive.capturedAt),
      );
    } catch (error) {
      errorByUrl[canonizedUrl] = toErrorMessage(error);
    } finally {
      actionLoadingByUrl[canonizedUrl] = false;
    }
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
    refreshForUrl,
    refreshForUrls,
    noteArchiveStored,
    noteArchiveFailed,
    downloadLatestForUrl,
    cleanupOldBackupsForUrl,
  };
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function buildArchiveFileName(canonizedUrl: string, capturedAt: string) {
  const hostname = new URL(canonizedUrl).hostname;
  return `${hostname}-${capturedAt.replaceAll(":", "-")}.html`;
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
