const DB_NAME = "startover-extra";
const DB_VERSION = 1;
const STORE_NAME = "page-archives";
const BY_CANONIZED_URL_AND_CAPTURED_AT = "by-canonized-url-and-captured-at";

export type SavedPageArchive = {
  id: number;
  canonizedUrl: string;
  capturedAt: string;
  html: Blob;
  htmlSize: number;
};

export type PageArchiveSummary = Omit<SavedPageArchive, "html">;

type SavedPageArchiveInput = {
  canonizedUrl: string;
  capturedAt: string;
  html: Blob | string;
};

let dbPromise: Promise<IDBDatabase> | null = null;

function openPageArchiveDb() {
  if (dbPromise != null) {
    return dbPromise;
  }

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      const store = database.createObjectStore(STORE_NAME, {
        keyPath: "id",
        autoIncrement: true,
      });

      store.createIndex(BY_CANONIZED_URL_AND_CAPTURED_AT, [
        "canonizedUrl",
        "capturedAt",
      ]);
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error ?? new Error("Failed to open archive database"));
    };
  });

  return dbPromise;
}

function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => Promise<T>,
) {
  return openPageArchiveDb().then(async (database) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    const result = await run(store);

    await transactionToPromise(transaction);

    return result;
  });
}

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error ?? new Error("IndexedDB request failed"));
    };
  });
}

function transactionToPromise(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => {
      resolve();
    };

    transaction.onabort = () => {
      reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
    };

    transaction.onerror = () => {
      reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    };
  });
}

function toSummary(archive: SavedPageArchive): PageArchiveSummary {
  const { html: _html, ...summary } = archive;
  return summary;
}

export async function savePageArchive(input: SavedPageArchiveInput) {
  const html =
    input.html instanceof Blob
      ? input.html
      : new Blob([input.html], { type: "text/html;charset=utf-8" });

  const record = {
    canonizedUrl: input.canonizedUrl,
    capturedAt: input.capturedAt,
    html,
    htmlSize: html.size,
  };

  return withStore("readwrite", async (store) => {
    const id = await requestToPromise(store.add(record));

    return {
      id: Number(id),
      canonizedUrl: record.canonizedUrl,
      capturedAt: record.capturedAt,
      htmlSize: record.htmlSize,
    } satisfies PageArchiveSummary;
  });
}

export async function getLatestPageArchiveSummary(canonizedUrl: string) {
  return withStore("readonly", async (store) => {
    const index = store.index(BY_CANONIZED_URL_AND_CAPTURED_AT);
    const range = IDBKeyRange.bound(
      [canonizedUrl, ""],
      [canonizedUrl, "\uffff"],
    );
    const cursor = await requestToPromise(index.openCursor(range, "prev"));

    if (cursor == null) {
      return null;
    }

    return toSummary(cursor.value as SavedPageArchive);
  });
}

export async function getLatestPageArchive(canonizedUrl: string) {
  return withStore("readonly", async (store) => {
    const index = store.index(BY_CANONIZED_URL_AND_CAPTURED_AT);
    const range = IDBKeyRange.bound(
      [canonizedUrl, ""],
      [canonizedUrl, "\uffff"],
    );
    const cursor = await requestToPromise(index.openCursor(range, "prev"));

    if (cursor == null) {
      return null;
    }

    return cursor.value as SavedPageArchive;
  });
}

export async function countPageArchives(canonizedUrl: string) {
  return withStore("readonly", async (store) => {
    const index = store.index(BY_CANONIZED_URL_AND_CAPTURED_AT);
    const range = IDBKeyRange.bound(
      [canonizedUrl, ""],
      [canonizedUrl, "\uffff"],
    );

    return requestToPromise(index.count(range));
  });
}

export async function deleteOldPageArchives(canonizedUrl: string) {
  return withStore("readwrite", async (store) => {
    const index = store.index(BY_CANONIZED_URL_AND_CAPTURED_AT);
    const range = IDBKeyRange.bound(
      [canonizedUrl, ""],
      [canonizedUrl, "\uffff"],
    );

    let removedCount = 0;
    let keepLatest = true;

    await iterateCursor(index.openCursor(range, "prev"), async (cursor) => {
      if (keepLatest) {
        keepLatest = false;
        return;
      }

      await requestToPromise(store.delete(cursor.primaryKey));
      removedCount += 1;
    });

    return removedCount;
  });
}

function iterateCursor<T>(
  request: IDBRequest<IDBCursorWithValue | null>,
  onCursor: (cursor: IDBCursorWithValue) => Promise<T> | T,
) {
  return new Promise<void>((resolve, reject) => {
    request.onerror = () => {
      reject(request.error ?? new Error("IndexedDB cursor request failed"));
    };

    request.onsuccess = async () => {
      const cursor = request.result;

      if (cursor == null) {
        resolve();
        return;
      }

      try {
        await onCursor(cursor);
        cursor.continue();
      } catch (error) {
        reject(error);
      }
    };
  });
}
