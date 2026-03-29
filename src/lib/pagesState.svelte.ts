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

  const REFERENCE = "https://spaceport.mystrikingly.com/";

  function setPagesList(pagesList: string[]) {
    const normalizedPagesList = pagesList
      .map(normalizeMyStrikinglyUrl)
      .filter((a) => a)
      .sort() as string[];
    pages.splice(0, pages.length);
    normalizedPagesList.forEach((page) => {
      if (!pages.includes(page)) {
        pages.push(page);
      }
    });

    console.log("SETTING PAGES", normalizedPagesList);
  }

  return {
    rootPage: REFERENCE,
    get pages() {
      return pages;
    },
    // get pagesDiscovery() {
    //   return pagesDiscovery;
    // },
    setPagesList,
    // processPages,
    normalizePage: normalizeMyStrikinglyUrl,
    pageToName: extractMyStrikinglyPageName,
  };
}
