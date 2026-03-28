const LINK_ATTRIBUTES = ["href", "data-image-link"] as const;

export function replaceMyStrikinglyLinks(targetNode: ParentNode) {
  for (const attribute of LINK_ATTRIBUTES) {
    targetNode
      .querySelectorAll<HTMLElement>(`[${attribute}]`)
      .forEach((node) => {
        const currentValue = node.getAttribute(attribute);

        if (currentValue == null) {
          return;
        }

        const replacement = toLocalArchiveHref(currentValue);

        if (replacement == null) {
          return;
        }

        node.setAttribute(attribute, replacement);
      });
  }
}

function toLocalArchiveHref(value: string) {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(value, "https://example.mystrikingly.com/");
  } catch {
    return null;
  }

  const hostname = parsedUrl.hostname.toLowerCase();

  if (
    !hostname.endsWith(".mystrikingly.com") ||
    hostname === "www.mystrikingly.com"
  ) {
    return null;
  }

  return `${hostname.replace(/\.mystrikingly\.com/, "")}.html${parsedUrl.hash}`;
}
