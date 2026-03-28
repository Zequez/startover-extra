import { defineUnlistedScript } from "wxt/utils/define-unlisted-script";
import type { PageArchiveSummary } from "@/lib/pageArchiveDb";

export type ToPageMsg = {
  id: "analyze";
};

export type FromPageMsg =
  | {
      id: "links";
      from: string;
      links: string[];
    }
  | {
      id: "archive-start";
      archiveId: string;
      from: string;
      canonizedUrl: string;
      capturedAt: string;
      totalChunks: number;
    }
  | {
      id: "archive-chunk";
      archiveId: string;
      chunkIndex: number;
      chunk: string;
    }
  | {
      id: "archive-complete";
      archiveId: string;
    }
  | {
      id: "archive-failed";
      from: string;
      canonizedUrl: string;
      capturedAt: string;
      error: string;
    };

export type SidepanelToBackgroundMessage = {
  id: "to-page";
  msg: ToPageMsg;
};

export type BackgroundToSidepanelMessage =
  | {
      id: "from-page";
      msg: FromPageMsg;
    }
  | {
      id: "archive-stored";
      summary: PageArchiveSummary;
    }
  | {
      id: "archive-failed";
      canonizedUrl: string;
      capturedAt: string;
      error: string;
    };

export type ResourceFetchRequest =
  | {
      id: "fetch-resource-data-url";
      url: string;
    }
  | {
      id: "fetch-resource-text";
      url: string;
    };

export type ResourceFetchResponse =
  | {
      ok: true;
      dataUrl: string;
    }
  | {
      ok: true;
      text: string;
    }
  | {
      ok: false;
      error: string;
    };

export default defineUnlistedScript(() => {});
