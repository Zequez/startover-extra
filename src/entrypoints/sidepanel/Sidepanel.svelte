<script lang="ts">
  import { onMount } from "svelte";
  import { initArchiveState } from "../../lib/archiveState.svelte";
  import { initPagesState } from "../../lib/pagesState.svelte";
  import { initBrowserState } from "../../lib/browserState.svelte";
  import { extractMyStrikinglyPageName } from "@/lib/normalizePage";

  const P = initPagesState();
  const A = initArchiveState();
  const B = initBrowserState(P, A, {
    onArchiveStored: (summary) => A.noteArchiveStored(summary),
    onArchiveFailed: (canonizedUrl, error) =>
      A.noteArchiveFailed(canonizedUrl, error),
  });
  const activeArchive = $derived(
    B.activeTab == null ? null : (A.latestByUrl[B.activeTab] ?? null),
  );
  const activeArchiveCount = $derived(
    B.activeTab == null ? 0 : (A.countByUrl[B.activeTab] ?? 0),
  );
  const activeArchiveError = $derived(
    B.activeTab == null ? null : (A.errorByUrl[B.activeTab] ?? null),
  );
  const activeArchiveLoading = $derived(
    B.activeTab == null ? false : (A.loadingByUrl[B.activeTab] ?? false),
  );
  const activeArchiveActionLoading = $derived(
    B.activeTab == null ? false : (A.actionLoadingByUrl[B.activeTab] ?? false),
  );

  onMount(() => {
    return B.mount();
  });

  $effect(() => {
    void A.refreshForUrl(B.activeTab);
  });

  $effect(() => {
    void A.refreshForUrls(P.pages);
  });

  function formatDate(value: string) {
    return new Date(value).toLocaleString();
  }

  function formatBytes(bytes: number) {
    if (bytes < 1024) {
      return `${bytes} B`;
    }

    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }

    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function backupCountLabel(page: string) {
    const count = A.countByUrl[page] ?? 0;
    return count === 1 ? "1 backup" : `${count} backups`;
  }

  const staleArchiveTimespans = {
    "0": 0,
    "1H": 60 * 60 * 1000,
    "8H": 8 * 60 * 60 * 1000,
    "24H": 24 * 60 * 60 * 1000,
    "1W": 7 * 24 * 60 * 60 * 1000,
    "1M": 28 * 24 * 60 * 60 * 1000,
    "4M": 112 * 24 * 60 * 60 * 1000,
  };

  const lastArchiveBadges = {
    "1H": { style: "bg-green-600", span: staleArchiveTimespans["1H"] },
    "8H": { style: "bg-green-300", span: staleArchiveTimespans["8H"] },
    "24H": { style: "bg-yellow-300", span: staleArchiveTimespans["24H"] },
    "1W": { style: "bg-orange-300", span: staleArchiveTimespans["1W"] },
    "1M": { style: "bg-red-300", span: staleArchiveTimespans["1M"] },
    "4M": { style: "bg-red-600", span: staleArchiveTimespans["4M"] },
    "4M+": { style: "bg-gray-300", span: Infinity },
  };

  function pickArchiveBadge(
    timeSinceLastArchive: number | null,
  ): keyof typeof lastArchiveBadges | null {
    if (timeSinceLastArchive === null) {
      return null;
    }
    for (const [label, { span }] of Object.entries(lastArchiveBadges)) {
      if (timeSinceLastArchive < span) {
        return label as keyof typeof lastArchiveBadges;
      }
    }
    return "4M+";
  }
</script>

<div class="flex flex-col px-1 py-1 space-y-2 h-screen">
  <div class="bg-slate-200 px-2 py-2 border border-black/10 rounded-md">
    <button
      type="button"
      class="block mb-2 w-full text-center! font-semibold uppercase cursor-pointer rounded-md border border-solid border-black/10 bg-gray-100 px-2 py-1 hover:bg-gray-200"
      onclick={() => B.openAndFetchLinks(P.rootPage)}
    >
      Fetch Spaceport Pages
    </button>

    <button
      type="button"
      class="block w-full text-center! font-semibold uppercase cursor-pointer rounded-md border border-solid border-black/10 bg-gray-100 px-2 py-1 hover:bg-gray-200"
      onclick={() => P.setPagesList([])}
    >
      Purge Pages
    </button>
  </div>

  <div class="bg-slate-200 px-2 py-2 border border-black/10 rounded-md">
    <div class="flex items-center justify-center">
      <span class="mr-2 whitespace-nowrap">Auto-next</span>
      {#if !B.sequentialArchive}
        <button
          type="button"
          class="block text-center! w-full cursor-pointer font-semibold uppercase rounded-md border border-solid border-black/10 bg-gray-100 px-2 py-1 hover:bg-gray-200"
          onclick={() => B.enableSequentialArchive()}
        >
          DISABLED
        </button>
      {:else}
        <button
          type="button"
          class="block w-full text-center! uppercase font-semibold cursor-pointer rounded-md border border-solid border-black/10 bg-green-400 px-2 py-1 hover:bg-green-400 text-white"
          onclick={() => B.disableSequentialArchive()}
        >
          ENABLED
        </button>
      {/if}
    </div>
    <button
      type="button"
      class="block mt-2 text-center! w-full font-semibold uppercase cursor-pointer rounded-md border border-solid border-black/10 bg-gray-100 px-2 py-1 hover:bg-gray-200"
      onclick={() => B.analyzeCurrentTab()}
    >
      Begin Archiving
    </button>
    <div class="mt-2">
      <div class="mb-2">How fresh is fresh enough?:</div>
      <div class="flex text-white space-x-1 mb-2">
        {#each Object.entries(staleArchiveTimespans) as [label, timespan]}
          <button
            onclick={() => B.setStaleArchiveTimespan(timespan)}
            class={[
              "bg-slate-400 rounded-sm px-1 cursor-pointer",
              {
                "bg-slate-600": timespan === B.staleArchiveTimespan,
              },
            ]}>{label === "0" ? "NOW" : label}</button
          >
        {/each}
      </div>
      <div>Fresher pages will be skipped in auto-archiving</div>
    </div>
  </div>

  <div
    class="rounded-md h-40 border border-solid border-black/10 bg-slate-50 px-2 py-2 text-sm text-slate-700"
  >
    <h2 class="font-bold flex">
      <span class="flex-grow">Current Page</span>
      <span class="font-mono font-bold"
        >{B.activeTab ? extractMyStrikinglyPageName(B.activeTab) : ""}</span
      >
    </h2>
    {#if activeArchiveLoading}
      Looking up the latest stored HTML snapshots...
    {:else if activeArchive != null}
      Latest HTML snapshot: {formatDate(activeArchive.capturedAt)}
      ({formatBytes(activeArchive.htmlSize)}), {activeArchiveCount} total
    {:else}
      No stored HTML snapshot for this page yet.
    {/if}

    {#if B.activeTab != null && activeArchiveCount > 0}
      <div class="mt-2 flex gap-2">
        <button
          type="button"
          class="cursor-pointer rounded-md border border-solid border-black/10 bg-white px-2 py-1 text-xs hover:bg-slate-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
          disabled={activeArchiveActionLoading}
          onclick={() => A.downloadLatestForUrl(B.activeTab!)}
        >
          Download latest
        </button>
        <button
          type="button"
          class="cursor-pointer rounded-md border border-solid border-black/10 bg-white px-2 py-1 text-xs hover:bg-slate-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
          disabled={activeArchiveActionLoading || activeArchiveCount <= 1}
          onclick={() => A.cleanupOldBackupsForUrl(B.activeTab!)}
        >
          Clean old backups
        </button>
      </div>
    {/if}

    {#if activeArchiveError != null}
      <div class="mt-1 text-red-700">{activeArchiveError}</div>
    {/if}
  </div>

  <div class="flex">
    <button
      onclick={() => {
        A.downloading ? A.interruptDownload() : A.downloadAll();
      }}
      class="grow text-center! w-full cursor-pointer font-semibold uppercase rounded-md border border-solid border-black/10 bg-gray-100 px-2 py-1 hover:bg-gray-200"
    >
      {A.downloading ? "Interrupt download" : "Download All"}
    </button>

    {#if A.downloading}
      <div class=" w-8 h-8 flex items-center justify-center">
        <div class="loader-black"></div>
      </div>
    {/if}
  </div>

  <div class="overflow-auto h-full w-full">
    {#each P.pages as page}
      {@const isActive = B.activeTab === page}
      {@const isWaitingFor = B.isWaitingForPage === page}
      {@const notWaitingForAnything = B.isWaitingForPage == null}
      {@const hasArchive = (A.countByUrl[page] ?? 0) > 0}
      {@const timeSinceLastArchive = A.timeSinceLastArchiveByUrl[page]}
      {@const archiveBadge = pickArchiveBadge(timeSinceLastArchive)}
      <div class="flex items-center gap-1">
        <button
          type="button"
          class={[
            "w-full flex font-mono items-center text-xs cursor-pointer hover:brightness-105 px-2 py-1 text-left ",
            {
              "bg-slate-500 text-white":
                (isActive && notWaitingForAnything) || isWaitingFor,
              "bg-slate-300 text-white": isActive && !isWaitingFor,
              "bg-gray-200": !isActive && !isWaitingFor,
            },
          ]}
          onclick={() => B.openInCurrentTab(page)}
        >
          <div class="grow">{P.pageToName(page)}</div>
          {#if isWaitingFor}
            <div class="loader"></div>
          {/if}
        </button>
        <div
          class={[
            "w-5.5 h-5.5 shrink-0 text-white rounded-full border border-solid border-black/10 flex items-center justify-center font-bold text-xs",
            archiveBadge
              ? lastArchiveBadges[archiveBadge].style
              : "bg-gray-100",
          ]}
          title={backupCountLabel(page)}
        >
          {archiveBadge ? archiveBadge : ""}
        </div>
        <button
          disabled={!hasArchive}
          aria-label="Download HTML"
          onclick={() => A.downloadLatestForUrl(page)}
          class={[
            "i-fa-download w-6 h-6 shrink-0  ",
            {
              " text-emerald-700 hover:text-emerald-500 cursor-pointer":
                hasArchive,
              "text-gray-300": !hasArchive,
            },
          ]}
        ></button>
      </div>
      <!-- {#if B.activeTab === page}
      <div class="space-y-1">
        {#if (A.countByUrl[page] ?? 0) > 0}
          <div class="ml-6 flex items-center gap-2 text-xs text-slate-600">
            <span>{backupCountLabel(page)}</span>
            <button
              type="button"
              class="cursor-pointer underline hover:text-slate-900 disabled:cursor-not-allowed disabled:text-slate-400"
              disabled={A.actionLoadingByUrl[page] ?? false}
              onclick={() => A.downloadLatestForUrl(page)}
            >
              Download latest
            </button>
            <button
              type="button"
              class="cursor-pointer underline hover:text-slate-900 disabled:cursor-not-allowed disabled:text-slate-400"
              disabled={(A.actionLoadingByUrl[page] ?? false) ||
                (A.countByUrl[page] ?? 0) <= 1}
              onclick={() => A.cleanupOldBackupsForUrl(page)}
            >
              Clean old backups
            </button>
          </div>
        {/if}
      </div>
    {/if} -->
    {/each}
  </div>
</div>

<style>
  /* HTML: <div class="loader"></div> */
  .loader {
    width: 12px;
    aspect-ratio: 1;
    border-radius: 50%;
    border: 2px solid #fff;
    animation:
      l20-1 0.8s infinite linear alternate,
      l20-2 1.6s infinite linear;
  }
  .loader-black {
    width: 12px;
    aspect-ratio: 1;
    border-radius: 50%;
    border: 2px solid #000;
    animation:
      l20-1 0.8s infinite linear alternate,
      l20-2 1.6s infinite linear;
  }
  @keyframes l20-1 {
    0% {
      clip-path: polygon(50% 50%, 0 0, 50% 0%, 50% 0%, 50% 0%, 50% 0%, 50% 0%);
    }
    12.5% {
      clip-path: polygon(
        50% 50%,
        0 0,
        50% 0%,
        100% 0%,
        100% 0%,
        100% 0%,
        100% 0%
      );
    }
    25% {
      clip-path: polygon(
        50% 50%,
        0 0,
        50% 0%,
        100% 0%,
        100% 100%,
        100% 100%,
        100% 100%
      );
    }
    50% {
      clip-path: polygon(
        50% 50%,
        0 0,
        50% 0%,
        100% 0%,
        100% 100%,
        50% 100%,
        0% 100%
      );
    }
    62.5% {
      clip-path: polygon(
        50% 50%,
        100% 0,
        100% 0%,
        100% 0%,
        100% 100%,
        50% 100%,
        0% 100%
      );
    }
    75% {
      clip-path: polygon(
        50% 50%,
        100% 100%,
        100% 100%,
        100% 100%,
        100% 100%,
        50% 100%,
        0% 100%
      );
    }
    100% {
      clip-path: polygon(
        50% 50%,
        50% 100%,
        50% 100%,
        50% 100%,
        50% 100%,
        50% 100%,
        0% 100%
      );
    }
  }
  @keyframes l20-2 {
    0% {
      transform: scaleY(1) rotate(0deg);
    }
    49.99% {
      transform: scaleY(1) rotate(135deg);
    }
    50% {
      transform: scaleY(-1) rotate(0deg);
    }
    100% {
      transform: scaleY(-1) rotate(-135deg);
    }
  }
</style>
