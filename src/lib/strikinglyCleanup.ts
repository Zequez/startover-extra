const REMOVABLE_SELECTORS = [
  ".s-cookie-notification-bar",
  ".s-footer-logo-wrapper",
  "#strikingly-tooltip-container",
  "#s-footer-section-container",
  "#ecommerce-drawer",
  "#blog-category-drawer",
  "#s-support-widget-container",
  "#fb-root",
  "#app-script-root",
  "#app-view-root",
  ".s-floated-components",
  "#fixedContainer",
  "#fixedLoginContainer",
  "#fixedMultiLangSwitcher",
  "#s-new-mobile-actions-wrapper",
  "#s-ecommerce-shopping-cart-wrapper",
  "#prerendered-inline-theme-html",
] as const;

const REMOVABLE_HEAD_SELECTORS = [
  'meta[name="strikingly-host-suffix"]',
  'meta[name="support-helper"]',
  'meta[name="asset-url"]',
] as const;

export function cleanupPage(targetDocument: Document = document) {
  cleanupNode(targetDocument, targetDocument.location.href);
}

export function cleanupNode(targetNode: ParentNode, sourcePageUrl?: string) {
  for (const selector of REMOVABLE_SELECTORS) {
    targetNode.querySelectorAll(selector).forEach((node) => node.remove());
  }

  for (const selector of REMOVABLE_HEAD_SELECTORS) {
    targetNode.querySelectorAll(selector).forEach((node) => node.remove());
  }

  targetNode.querySelectorAll(".waypoint").forEach((node) => {
    if (node.textContent?.trim().length) {
      return;
    }

    if (node.children.length > 0) {
      return;
    }

    node.remove();
  });

  replaceEmbedlyIframes(targetNode, sourcePageUrl);
  removePoweredByStrikinglyComments(targetNode);

  targetNode.querySelectorAll(".s-bg-image").forEach((node) => {
    (node as HTMLDivElement).style.backgroundSize = "contain";
  });
}

function replaceEmbedlyIframes(targetNode: ParentNode, sourcePageUrl?: string) {
  const iframes = Array.from(
    targetNode.querySelectorAll<HTMLIFrameElement>(
      'iframe[src*="cdn.embedly.com/widgets/media.html"]',
    ),
  );

  for (const iframe of iframes) {
    const replacementUrl = getStandardEmbedUrl(iframe.src, sourcePageUrl);

    if (replacementUrl == null) {
      continue;
    }

    iframe.src = replacementUrl;
    iframe.setAttribute("allowfullscreen", "");
    iframe.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
    iframe.setAttribute(
      "allow",
      "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share",
    );
    iframe.setAttribute("loading", "lazy");

    if (iframe.title.trim().length === 0) {
      iframe.title = replacementUrl.includes("youtube")
        ? "YouTube video"
        : "Vimeo video";
    }
  }
}

function getStandardEmbedUrl(embedlyUrl: string, sourcePageUrl?: string) {
  const parsedEmbedlyUrl = toAbsoluteUrl(
    embedlyUrl,
    "https://cdn.embedly.com/",
  );

  if (parsedEmbedlyUrl == null) {
    return null;
  }

  const candidateValues = [
    parsedEmbedlyUrl.searchParams.get("src"),
    parsedEmbedlyUrl.searchParams.get("url"),
  ].filter((value): value is string => value != null && value.length > 0);

  for (const candidateValue of candidateValues) {
    const replacementUrl = normalizeVideoEmbedUrl(
      candidateValue,
      sourcePageUrl,
    );

    if (replacementUrl != null) {
      return replacementUrl;
    }
  }

  return null;
}

function normalizeVideoEmbedUrl(value: string, sourcePageUrl?: string) {
  const parsedUrl = toAbsoluteUrl(value, "https://www.youtube.com/");

  if (parsedUrl == null) {
    return null;
  }

  const hostname = parsedUrl.hostname.toLowerCase().replace(/^www\./, "");

  if (
    hostname === "youtube.com" ||
    hostname === "m.youtube.com" ||
    hostname === "youtu.be"
  ) {
    const videoId = extractYoutubeVideoId(parsedUrl);

    if (videoId != null) {
      return buildYoutubeEmbedUrl(videoId, sourcePageUrl);
    }
  }

  if (hostname === "vimeo.com" || hostname === "player.vimeo.com") {
    const videoId = extractVimeoVideoId(parsedUrl);

    if (videoId != null) {
      return `https://player.vimeo.com/video/${videoId}`;
    }
  }

  return null;
}

function buildYoutubeEmbedUrl(videoId: string, sourcePageUrl?: string) {
  const url = new URL(`https://www.youtube-nocookie.com/embed/${videoId}`);

  url.searchParams.set("rel", "0");

  if (sourcePageUrl != null) {
    try {
      const sourceUrl = new URL(sourcePageUrl);
      url.searchParams.set("origin", sourceUrl.origin);
      url.searchParams.set("widget_referrer", sourceUrl.href);
    } catch {
      // Keep the basic embed URL if the source page URL cannot be parsed.
    }
  }

  return url.href;
}

function extractYoutubeVideoId(url: URL) {
  if (url.hostname.toLowerCase() === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0];
    return id?.trim() || null;
  }

  if (url.pathname.startsWith("/embed/")) {
    const id = url.pathname.split("/")[2];
    return id?.trim() || null;
  }

  if (url.pathname === "/watch") {
    const id = url.searchParams.get("v");
    return id?.trim() || null;
  }

  return null;
}

function extractVimeoVideoId(url: URL) {
  const segments = url.pathname.split("/").filter(Boolean);

  if (segments.length === 0) {
    return null;
  }

  if (segments[0] === "video") {
    return segments[1]?.trim() || null;
  }

  return segments[0]?.trim() || null;
}

function toAbsoluteUrl(value: string, baseUrl: string) {
  try {
    return new URL(value, baseUrl);
  } catch {
    return null;
  }
}

function removePoweredByStrikinglyComments(targetNode: ParentNode) {
  const root = targetNode as Node;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
  const commentsToRemove: Comment[] = [];

  while (walker.nextNode()) {
    const comment = walker.currentNode;

    if (
      comment instanceof Comment &&
      comment.textContent?.includes("Powered by Strikingly.com")
    ) {
      commentsToRemove.push(comment);
    }
  }

  commentsToRemove.forEach((comment) => comment.remove());
}
