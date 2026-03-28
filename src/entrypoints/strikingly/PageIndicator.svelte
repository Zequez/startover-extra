<script lang="ts">
  import { onMount } from "svelte";
  import { type Browser } from "wxt/browser";
  import { extractHtml } from "@/lib/extractHtml";
  import { normalizeMyStrikinglyUrl } from "@/lib/normalizePage";
  import type { FromPageMsg, ToPageMsg } from "../msgs";

  const ARCHIVE_CHUNK_SIZE = 256 * 1024;

  const { port } = $props<{ port: Browser.runtime.Port }>();

  let isAnalyzing = $state(false);
  let lastArchivedHtml = $state<string | null>(null);
  let lastArchivedAt = $state<string | null>(null);
  let errorMessage = $state<string | null>(null);

  function collectLinks(): FromPageMsg {
    const links = Array.from(
      document.querySelectorAll<HTMLAnchorElement>("a[href]"),
    )
      .map((link) => link.href)
      .filter((href, index, allLinks) => allLinks.indexOf(href) === index);

    return {
      id: "links",
      from: document.location.href.split("#")[0],
      links,
    };
  }

  async function handleMessage(message: ToPageMsg) {
    switch (message.id) {
      case "analyze":
        await analyzePage();
        break;
    }
  }

  async function analyzePage() {
    if (isAnalyzing) {
      return;
    }

    isAnalyzing = true;
    errorMessage = null;
    port.postMessage(collectLinks());

    const from = document.location.href.split("#")[0];
    const canonizedUrl = normalizeMyStrikinglyUrl(from) ?? from;
    const capturedAt = new Date().toISOString();

    try {
      const html = await extractHtml(document);
      const archiveId = crypto.randomUUID();
      const totalChunks = Math.ceil(html.length / ARCHIVE_CHUNK_SIZE);

      lastArchivedHtml = html;
      lastArchivedAt = capturedAt;

      port.postMessage({
        id: "archive-start",
        archiveId,
        from,
        canonizedUrl,
        capturedAt,
        totalChunks,
      } satisfies FromPageMsg);

      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
        const start = chunkIndex * ARCHIVE_CHUNK_SIZE;
        const end = start + ARCHIVE_CHUNK_SIZE;

        port.postMessage({
          id: "archive-chunk",
          archiveId,
          chunkIndex,
          chunk: html.slice(start, end),
        } satisfies FromPageMsg);
      }

      port.postMessage({
        id: "archive-complete",
        archiveId,
      } satisfies FromPageMsg);
    } catch (error) {
      const message = toErrorMessage(error);
      errorMessage = message;
      port.postMessage({
        id: "archive-failed",
        from,
        canonizedUrl,
        capturedAt,
        error: message,
      } satisfies FromPageMsg);
    } finally {
      isAnalyzing = false;
    }
  }

  function downloadLatestArchive() {
    if (lastArchivedHtml == null || lastArchivedAt == null) {
      return;
    }

    const blob = new Blob([lastArchivedHtml], {
      type: "text/html;charset=utf-8",
    });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = objectUrl;
    anchor.download = buildArchiveFileName(lastArchivedAt);
    anchor.click();

    window.setTimeout(() => {
      URL.revokeObjectURL(objectUrl);
    }, 60_000);
  }

  onMount(() => {
    const onMessage = (message: ToPageMsg) => {
      void handleMessage(message);
    };

    port.onMessage.addListener(onMessage);

    return () => {
      port.onMessage.removeListener(onMessage);
    };
  });

  function buildArchiveFileName(capturedAt: string) {
    const pageName =
      normalizeMyStrikinglyUrl(document.location.href)
        ?.replace("https://", "")
        .replace(".mystrikingly.com/", "") ?? "page";

    return `${pageName}-${capturedAt.replaceAll(":", "-")}.html`;
  }

  function toErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }
</script>

<div
  aria-label="Page indicator"
  class="pointer-events-none fixed top-3 left-3 z-[2147483647]"
>
  <div
    class="pointer-events-auto flex items-center gap-2 rounded-full border border-solid border-black/10 bg-white/95 px-2 py-1 text-xs text-slate-700 shadow-lg backdrop-blur"
  >
    <div
      class={[
        "size-3 rounded-full shadow-[0_0_0_2px_rgba(255,255,255,0.95)]",
        {
          "bg-amber-500": isAnalyzing,
          "bg-blue-600": !isAnalyzing,
        },
      ]}
    ></div>
    <button
      type="button"
      class="cursor-pointer rounded-md bg-slate-900 px-2 py-1 font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
      disabled={isAnalyzing || lastArchivedHtml == null}
      onclick={downloadLatestArchive}
    >
      {isAnalyzing ? "Archiving..." : "Download HTML"}
    </button>
  </div>

  {#if lastArchivedAt != null || errorMessage != null}
    <div
      class="pointer-events-auto mt-2 max-w-64 rounded-md border border-solid border-black/10 bg-white/95 px-2 py-1 text-[11px] text-slate-600 shadow-md"
    >
      {#if errorMessage != null}
        <div class="text-red-700">{errorMessage}</div>
      {:else if lastArchivedAt != null}
        Saved {new Date(lastArchivedAt).toLocaleString()}
      {/if}
    </div>
  {/if}
</div>
