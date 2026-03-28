import { browser } from "wxt/browser";
import type {
  ResourceFetchRequest,
  ResourceFetchResponse,
} from "@/entrypoints/msgs";
import { replaceMyStrikinglyLinks } from "@/lib/replaceLinks";
import { cleanupNode, cleanupPage } from "@/lib/strikinglyCleanup";
import { removeNavbar } from "./replaceNavbar";

const REMOVE_SCRIPT_TAGS = true;
const PROGRESSIVE_SCROLL_BEFORE_EXTRACTION = true;
const PROGRESSIVE_SCROLL_PIXELS_PER_SECOND = 1200;
const WAIT_AFTER_SCROLL_MS = 5000;
const CSS_URL_PATTERN = /url\(\s*(['"]?)([^"'()]+)\1\s*\)/gi;
const CSS_IMPORT_PATTERN =
  /@import\s+(?:url\(\s*)?(['"]?)([^"'()]+)\1\s*\)?\s*;/gi;
const SRCSET_SEPARATOR_PATTERN = /\s+/;
const RESOURCE_ATTRIBUTES = [
  "src",
  "href",
  "poster",
  "data-src",
  "data-href",
] as const;

type ResourceCache = Map<string, Promise<string | null>>;

export async function extractHtml(document: Document) {
  const restoreScroll =
    PROGRESSIVE_SCROLL_BEFORE_EXTRACTION && document.defaultView != null
      ? await preparePageForExtraction(document.defaultView)
      : null;

  cleanupPage(document);

  const clone = document.documentElement.cloneNode(true) as HTMLElement;
  const cache: ResourceCache = new Map();

  try {
    cleanupNode(clone, document.location.href);
    replaceMyStrikinglyLinks(clone);
    clone.querySelector("#startover-extra-page-indicator-root")?.remove();

    await Promise.all([
      inlineStylesheets(document, clone, cache),
      inlineStyleTags(document, clone, cache),
      inlineStyleAttributes(clone, cache, document.baseURI),
      inlineResources(document, clone, cache),
      ...(REMOVE_SCRIPT_TAGS ? [] : [inlineScripts(document, clone)]),
      syncFormValues(document, clone),
      replaceCanvases(document, clone),
    ]);

    if (REMOVE_SCRIPT_TAGS) {
      clone.querySelectorAll("script").forEach((node) => node.remove());
    }

    clone
      .querySelectorAll(
        'script[src^="moz-extension://"], link[href^="moz-extension://"]',
      )
      .forEach((node) => node.remove());

    const doctype = serializeDoctype(document.doctype);

    return `${doctype}${clone.outerHTML}`;
  } finally {
    restoreScroll?.();
  }
}

async function inlineStylesheets(
  originalDocument: Document,
  cloneRoot: HTMLElement,
  cache: ResourceCache,
) {
  const originalLinks = Array.from(
    originalDocument.querySelectorAll<HTMLLinkElement>(
      'link[rel~="stylesheet"]',
    ),
  );
  const cloneLinks = Array.from(
    cloneRoot.querySelectorAll<HTMLLinkElement>('link[rel~="stylesheet"]'),
  );

  await Promise.all(
    originalLinks.map(async (originalLink, index) => {
      const cloneLink = cloneLinks[index];

      if (cloneLink == null || originalLink.href.length === 0) {
        return;
      }

      const cssText = await readCssText(originalLink);

      if (cssText == null) {
        return;
      }

      const inlinedCss = await rewriteCssText(
        cssText,
        originalLink.href,
        cache,
      );
      const style = cloneLink.ownerDocument.createElement("style");

      if (originalLink.media.length > 0) {
        style.media = originalLink.media;
      }

      style.dataset.originalHref = originalLink.href;
      style.textContent = inlinedCss;
      cloneLink.replaceWith(style);
    }),
  );
}

async function inlineStyleTags(
  originalDocument: Document,
  cloneRoot: HTMLElement,
  cache: ResourceCache,
) {
  const originalStyles = Array.from(
    originalDocument.querySelectorAll<HTMLStyleElement>("style"),
  );
  const cloneStyles = Array.from(
    cloneRoot.querySelectorAll<HTMLStyleElement>("style"),
  );

  await Promise.all(
    originalStyles.map(async (originalStyle, index) => {
      const cloneStyle = cloneStyles[index];

      if (cloneStyle == null) {
        return;
      }

      cloneStyle.textContent = await rewriteCssText(
        originalStyle.textContent ?? "",
        originalDocument.baseURI,
        cache,
      );
    }),
  );
}

async function inlineStyleAttributes(
  cloneRoot: HTMLElement,
  cache: ResourceCache,
  baseUrl: string,
) {
  const elements = Array.from(
    cloneRoot.querySelectorAll<HTMLElement>("[style]"),
  );

  await Promise.all(
    elements.map(async (element) => {
      const style = element.getAttribute("style");

      if (style == null || style.length === 0) {
        return;
      }

      element.setAttribute(
        "style",
        await rewriteCssText(style, baseUrl, cache),
      );
    }),
  );
}

async function inlineResources(
  originalDocument: Document,
  cloneRoot: HTMLElement,
  cache: ResourceCache,
) {
  await Promise.all([
    inlineAttributeResources(
      originalDocument,
      cloneRoot,
      cache,
      "img[src]",
      "src",
    ),
    inlineAttributeResources(
      originalDocument,
      cloneRoot,
      cache,
      "source[src]",
      "src",
    ),
    inlineAttributeResources(
      originalDocument,
      cloneRoot,
      cache,
      "audio[src]",
      "src",
    ),
    inlineAttributeResources(
      originalDocument,
      cloneRoot,
      cache,
      "video[src]",
      "src",
    ),
    inlineAttributeResources(
      originalDocument,
      cloneRoot,
      cache,
      "video[poster]",
      "poster",
    ),
    inlineAttributeResources(
      originalDocument,
      cloneRoot,
      cache,
      "track[src]",
      "src",
    ),
    inlineAttributeResources(
      originalDocument,
      cloneRoot,
      cache,
      "embed[src]",
      "src",
    ),
    inlineAttributeResources(
      originalDocument,
      cloneRoot,
      cache,
      'input[type="image"][src]',
      "src",
    ),
    inlineAttributeResources(
      originalDocument,
      cloneRoot,
      cache,
      'link[rel~="icon"][href]',
      "href",
    ),
    inlineSrcsets(originalDocument, cloneRoot, cache),
  ]);
}

async function inlineAttributeResources(
  originalDocument: Document,
  cloneRoot: HTMLElement,
  cache: ResourceCache,
  selector: string,
  attribute: (typeof RESOURCE_ATTRIBUTES)[number],
) {
  const originalNodes = Array.from(
    originalDocument.querySelectorAll<HTMLElement>(selector),
  );
  const cloneNodes = Array.from(
    cloneRoot.querySelectorAll<HTMLElement>(selector),
  );

  await Promise.all(
    originalNodes.map(async (originalNode, index) => {
      const cloneNode = cloneNodes[index];
      const rawValue = originalNode.getAttribute(attribute);

      if (cloneNode == null || rawValue == null) {
        return;
      }

      const inlinedValue = await resolveResourceValue(
        rawValue,
        originalDocument.baseURI,
        cache,
      );

      if (inlinedValue != null) {
        cloneNode.setAttribute(attribute, inlinedValue);
      }
    }),
  );
}

async function inlineSrcsets(
  originalDocument: Document,
  cloneRoot: HTMLElement,
  cache: ResourceCache,
) {
  const originalNodes = Array.from(
    originalDocument.querySelectorAll<HTMLElement>("[srcset]"),
  );
  const cloneNodes = Array.from(
    cloneRoot.querySelectorAll<HTMLElement>("[srcset]"),
  );

  await Promise.all(
    originalNodes.map(async (originalNode, index) => {
      const cloneNode = cloneNodes[index];
      const srcset = originalNode.getAttribute("srcset");

      if (cloneNode == null || srcset == null) {
        return;
      }

      const candidates = srcset
        .split(",")
        .map((candidate) => candidate.trim())
        .filter(Boolean);

      const rewritten = await Promise.all(
        candidates.map(async (candidate) => {
          const [rawUrl, ...rest] = candidate.split(SRCSET_SEPARATOR_PATTERN);
          const descriptor = rest.join(" ").trim();
          const value = await resolveResourceValue(
            rawUrl,
            originalDocument.baseURI,
            cache,
          );

          if (value == null) {
            return candidate;
          }

          return descriptor.length > 0 ? `${value} ${descriptor}` : value;
        }),
      );

      cloneNode.setAttribute("srcset", rewritten.join(", "));
    }),
  );
}

async function inlineScripts(
  originalDocument: Document,
  cloneRoot: HTMLElement,
) {
  const originalScripts = Array.from(
    originalDocument.querySelectorAll<HTMLScriptElement>("script[src]"),
  );
  const cloneScripts = Array.from(
    cloneRoot.querySelectorAll<HTMLScriptElement>("script[src]"),
  );

  await Promise.all(
    originalScripts.map(async (originalScript, index) => {
      const cloneScript = cloneScripts[index];

      if (cloneScript == null || originalScript.src.length === 0) {
        return;
      }

      try {
        const response = await fetch(originalScript.src, {
          credentials: "include",
        });

        if (!response.ok) {
          return;
        }

        cloneScript.textContent = await response.text();
        cloneScript.removeAttribute("src");
      } catch {
        // Keep the original src if the script cannot be fetched.
      }
    }),
  );
}

function syncFormValues(originalDocument: Document, cloneRoot: HTMLElement) {
  const originalInputs = Array.from(
    originalDocument.querySelectorAll<HTMLInputElement>("input"),
  );
  const cloneInputs = Array.from(
    cloneRoot.querySelectorAll<HTMLInputElement>("input"),
  );

  originalInputs.forEach((originalInput, index) => {
    const cloneInput = cloneInputs[index];

    if (cloneInput == null) {
      return;
    }

    if (originalInput.type === "checkbox" || originalInput.type === "radio") {
      cloneInput.checked = originalInput.checked;

      if (originalInput.checked) {
        cloneInput.setAttribute("checked", "");
      } else {
        cloneInput.removeAttribute("checked");
      }

      return;
    }

    cloneInput.value = originalInput.value;
    cloneInput.setAttribute("value", originalInput.value);
  });

  const originalTextareas = Array.from(
    originalDocument.querySelectorAll<HTMLTextAreaElement>("textarea"),
  );
  const cloneTextareas = Array.from(
    cloneRoot.querySelectorAll<HTMLTextAreaElement>("textarea"),
  );

  originalTextareas.forEach((originalTextarea, index) => {
    const cloneTextarea = cloneTextareas[index];

    if (cloneTextarea == null) {
      return;
    }

    cloneTextarea.value = originalTextarea.value;
    cloneTextarea.textContent = originalTextarea.value;
  });

  const originalSelects = Array.from(
    originalDocument.querySelectorAll<HTMLSelectElement>("select"),
  );
  const cloneSelects = Array.from(
    cloneRoot.querySelectorAll<HTMLSelectElement>("select"),
  );

  originalSelects.forEach((originalSelect, index) => {
    const cloneSelect = cloneSelects[index];

    if (cloneSelect == null) {
      return;
    }

    Array.from(cloneSelect.options).forEach((option, optionIndex) => {
      option.selected = originalSelect.options[optionIndex]?.selected ?? false;
    });
  });
}

function replaceCanvases(originalDocument: Document, cloneRoot: HTMLElement) {
  const originalCanvases = Array.from(
    originalDocument.querySelectorAll<HTMLCanvasElement>("canvas"),
  );
  const cloneCanvases = Array.from(
    cloneRoot.querySelectorAll<HTMLCanvasElement>("canvas"),
  );

  originalCanvases.forEach((originalCanvas, index) => {
    const cloneCanvas = cloneCanvases[index];

    if (cloneCanvas == null) {
      return;
    }

    try {
      const image = cloneCanvas.ownerDocument.createElement("img");
      image.src = originalCanvas.toDataURL("image/png");
      image.width = originalCanvas.width;
      image.height = originalCanvas.height;
      image.alt = cloneCanvas.getAttribute("aria-label") ?? "Canvas snapshot";
      cloneCanvas.replaceWith(image);
    } catch {
      // Ignore canvases that cannot be serialized because of tainted drawing state.
    }
  });
}

async function readCssText(link: HTMLLinkElement) {
  try {
    const stylesheet = link.sheet as CSSStyleSheet | null;

    if (stylesheet?.cssRules != null) {
      return Array.from(stylesheet.cssRules, (rule) => rule.cssText).join("\n");
    }
  } catch {
    // Fall back to fetching the stylesheet text when cssRules are not readable.
  }

  try {
    const text = await fetchTextViaExtension(link.href);

    if (text == null) {
      return null;
    }

    return text;
  } catch {
    return null;
  }
}

async function rewriteCssText(
  cssText: string,
  baseUrl: string,
  cache: ResourceCache,
): Promise<string> {
  let rewritten = cssText;
  const imports = Array.from(rewritten.matchAll(CSS_IMPORT_PATTERN));

  for (const match of imports) {
    const rawImport = match[2];
    const absoluteUrl = toAbsoluteUrl(rawImport, baseUrl);

    if (absoluteUrl == null) {
      continue;
    }

    try {
      const importedCss = await fetchTextViaExtension(absoluteUrl);

      if (importedCss == null) {
        continue;
      }

      const rewrittenImport = await rewriteCssText(
        importedCss,
        absoluteUrl,
        cache,
      );

      rewritten = rewritten.replace(match[0], rewrittenImport);
    } catch {
      // Keep the original @import if the resource cannot be fetched.
    }
  }

  const matches = Array.from(rewritten.matchAll(CSS_URL_PATTERN));

  for (const match of matches) {
    const rawUrl = match[2];
    const resolved = await resolveResourceValue(rawUrl, baseUrl, cache);

    if (resolved == null) {
      continue;
    }

    rewritten = rewritten.replace(match[0], `url("${resolved}")`);
  }

  return rewritten;
}

async function resolveResourceValue(
  rawValue: string,
  baseUrl: string,
  cache: ResourceCache,
) {
  const trimmed = rawValue.trim();

  if (
    trimmed.length === 0 ||
    trimmed.startsWith("data:") ||
    trimmed.startsWith("javascript:") ||
    trimmed.startsWith("about:")
  ) {
    return trimmed;
  }

  const absoluteUrl = toAbsoluteUrl(trimmed, baseUrl);

  if (absoluteUrl == null) {
    return null;
  }

  const cached = cache.get(absoluteUrl);

  if (cached != null) {
    return cached;
  }

  const nextValue = fetchAsDataUrl(absoluteUrl);
  cache.set(absoluteUrl, nextValue);

  return nextValue;
}

async function fetchAsDataUrl(url: string) {
  try {
    return fetchDataUrlViaExtension(url);
  } catch {
    return null;
  }
}

function toAbsoluteUrl(value: string, baseUrl: string) {
  try {
    return new URL(value, baseUrl).href;
  } catch {
    return null;
  }
}

function serializeDoctype(doctype: DocumentType | null) {
  if (doctype == null) {
    return "";
  }

  const publicId =
    doctype.publicId.length > 0 ? ` PUBLIC "${doctype.publicId}"` : "";
  const systemId = doctype.systemId.length > 0 ? ` "${doctype.systemId}"` : "";

  return `<!DOCTYPE ${doctype.name}${publicId}${systemId}>\n`;
}

async function preparePageForExtraction(window: Window) {
  const initialScrollX = window.scrollX;
  const initialScrollY = window.scrollY;

  await progressivelyScrollToBottom(window);
  cleanupPage(window.document);
  removeNavbar(window.document);
  await wait(WAIT_AFTER_SCROLL_MS);

  return () => {
    window.scrollTo({
      left: initialScrollX,
      top: initialScrollY,
      behavior: "instant" as ScrollBehavior,
    });
  };
}

function progressivelyScrollToBottom(window: Window) {
  return new Promise<void>((resolve) => {
    const start = performance.now();
    const startY = window.scrollY;

    const step = (now: number) => {
      const elapsedSeconds = (now - start) / 1000;
      const targetY =
        startY + elapsedSeconds * PROGRESSIVE_SCROLL_PIXELS_PER_SECOND;
      const maxScrollY = getMaxScrollY(window);
      const nextY = Math.min(targetY, maxScrollY);

      window.scrollTo({
        left: window.scrollX,
        top: nextY,
        behavior: "auto",
      });

      if (nextY >= maxScrollY) {
        resolve();
        return;
      }

      window.requestAnimationFrame(step);
    };

    window.requestAnimationFrame(step);
  });
}

function getMaxScrollY(window: Window) {
  const document = window.document;
  const root = document.documentElement;
  const body = document.body;
  const scrollHeight = Math.max(
    root.scrollHeight,
    root.offsetHeight,
    root.clientHeight,
    body?.scrollHeight ?? 0,
    body?.offsetHeight ?? 0,
    body?.clientHeight ?? 0,
  );

  return Math.max(0, scrollHeight - window.innerHeight);
}

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function fetchDataUrlViaExtension(url: string) {
  const response = await sendResourceFetchMessage({
    id: "fetch-resource-data-url",
    url,
  });

  if (!response.ok || !("dataUrl" in response)) {
    return null;
  }

  return response.dataUrl;
}

async function fetchTextViaExtension(url: string) {
  const response = await sendResourceFetchMessage({
    id: "fetch-resource-text",
    url,
  });

  if (!response.ok || !("text" in response)) {
    return null;
  }

  return response.text;
}

function sendResourceFetchMessage(message: ResourceFetchRequest) {
  return browser.runtime.sendMessage(message) as Promise<ResourceFetchResponse>;
}
