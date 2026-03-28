import { lsState } from "@/lib/ls-state.svelte";
import {
  extractMyStrikinglyPageName,
  normalizeMyStrikinglyUrl,
} from "@/lib/normalizePage";

export function initPagesState() {
  const pages = lsState<string[]>("pages", [
    "https://spaceport.mystrikingly.com/",
    "https://4feelings.mystrikingly.com/",
  ]);

  const pagesDiscovery = lsState<{ [key: string]: string[] }>(
    "pagesDiscovery",
    {
      "https://4feelings.mystrikingly.com/": [],
      "https://spaceport.mystrikingly.com/": [],
    },
  );

  function processPages(fromUrl: string, nextPages: string[]) {
    const normalizedFromUrl = normalizeMyStrikinglyUrl(fromUrl);

    if (normalizedFromUrl == null) {
      return;
    }

    addPage(normalizedFromUrl);
    ensureDiscoveryBucket(normalizedFromUrl);

    for (const page of nextPages) {
      const normalizedPage = normalizeMyStrikinglyUrl(page);

      if (normalizedPage == null) {
        continue;
      }

      addPage(normalizedPage);
      ensureDiscoveryBucket(normalizedPage);

      if (pagesDiscovery[normalizedFromUrl].includes(normalizedPage)) {
        continue;
      }

      pagesDiscovery[normalizedFromUrl].push(normalizedPage);
    }
  }

  function addPage(page: string) {
    if (pages.includes(page)) {
      return;
    }

    pages.push(page);
  }

  function ensureDiscoveryBucket(page: string) {
    if (page in pagesDiscovery) {
      return;
    }

    pagesDiscovery[page] = [];
  }

  return {
    get pages() {
      return pages;
    },
    get pagesDiscovery() {
      return pagesDiscovery;
    },
    processPages,
    normalizePage: normalizeMyStrikinglyUrl,
    pageToName: extractMyStrikinglyPageName,
  };
}
