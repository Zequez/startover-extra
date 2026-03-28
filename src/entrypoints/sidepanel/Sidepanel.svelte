<script lang="ts">
  import { onMount } from "svelte";
  import { initArchiveState } from "../../lib/archiveState.svelte";
  import { initPagesState } from "../../lib/pagesState.svelte";
  import { initBrowserState } from "../../lib/browserState.svelte";

  const P = initPagesState();
  const A = initArchiveState();
  const B = initBrowserState(P, {
    onArchiveStored: (summary) => A.noteArchiveStored(summary),
    onArchiveFailed: (canonizedUrl, error) =>
      A.noteArchiveFailed(canonizedUrl, error),
  });
  const sortedPages = $derived([...P.pages].sort());
  const activeTabDiscoveredPages = $derived(
    B.activeTab == null
      ? []
      : ([...(P.pagesDiscovery[B.activeTab] ?? [])].sort() ?? []),
  );
  const activeArchive = $derived(
    B.activeTab == null ? null : A.latestByUrl[B.activeTab] ?? null,
  );
  const activeArchiveCount = $derived(
    B.activeTab == null ? 0 : A.countByUrl[B.activeTab] ?? 0,
  );
  const activeArchiveError = $derived(
    B.activeTab == null ? null : A.errorByUrl[B.activeTab] ?? null,
  );
  const activeArchiveLoading = $derived(
    B.activeTab == null ? false : A.loadingByUrl[B.activeTab] ?? false,
  );
  const activeArchiveActionLoading = $derived(
    B.activeTab == null ? false : A.actionLoadingByUrl[B.activeTab] ?? false,
  );

  onMount(() => {
    return B.mount();
  });

  $effect(() => {
    void A.refreshForUrl(B.activeTab);
  });

  $effect(() => {
    void A.refreshForUrls(sortedPages);
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
</script>

<div class="space-y-2 px-1 py-1">
  <div
    class="rounded-md border border-solid border-black/10 bg-white px-2 py-2 text-sm"
  >
    Messages target the current active `*.mystrikingly.com` tab.
  </div>

  <button
    type="button"
    class="block w-full cursor-pointer rounded-md border border-solid border-black/10 bg-red-100 px-2 py-1 text-left hover:bg-red-50"
    onclick={() => B.analyzeCurrentTab()}
  >
    Analyze Active Tab
  </button>

  <div
    class="rounded-md border border-solid border-black/10 bg-slate-50 px-2 py-2 text-sm text-slate-700"
  >
    {#if B.activeTab == null}
      No active canonical page selected.
    {:else if activeArchiveLoading}
      Looking up the latest stored HTML snapshot...
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

  {#each sortedPages as page}
    <div class="flex items-center gap-1">
      <button
        type="button"
        class={[
          "block w-full cursor-pointer rounded-md border border-solid border-black/10 px-2 py-1 text-left hover:bg-gray-100",
          {
            "bg-slate-300": B.activeTab === page,
            "bg-gray-200": B.activeTab !== page,
          },
        ]}
        onclick={() => B.openInCurrentTab(page)}
      >
        {P.pageToName(page)}
      </button>
      <div
        class={[
          "min-w-18 rounded-md border border-solid px-2 py-1 text-center text-xs",
          {
            "border-emerald-200 bg-emerald-50 text-emerald-700":
              (A.countByUrl[page] ?? 0) > 0,
            "border-black/10 bg-white text-slate-500":
              (A.countByUrl[page] ?? 0) === 0,
          },
        ]}
        title={backupCountLabel(page)}
      >
        {A.loadingByUrl[page] ? "..." : A.countByUrl[page] ?? 0}
      </div>
    </div>
    {#if B.activeTab === page}
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
              disabled={
                (A.actionLoadingByUrl[page] ?? false) ||
                (A.countByUrl[page] ?? 0) <= 1
              }
              onclick={() => A.cleanupOldBackupsForUrl(page)}
            >
              Clean old backups
            </button>
          </div>
        {/if}
        {#each activeTabDiscoveredPages as discoveredPage}
          {@const discoveredPageName = P.pageToName(discoveredPage)}
          <button
            type="button"
            class="block ml-6 w-full cursor-pointer truncate text-left text-sm text-blue-700 hover:text-blue-800 underline"
            onclick={() => B.openInCurrentTab(discoveredPage)}
            title={discoveredPageName}
          >
            {discoveredPageName}
          </button>
        {/each}
      </div>
    {/if}
  {/each}
</div>
