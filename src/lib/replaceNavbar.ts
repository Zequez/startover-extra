export type NavLink = {
  label: string;
  href: string;
};

export type NavButton = {
  label: string;
  href: string;
};

export type ExtractedNavData = {
  links: NavLink[];
  navBtn: NavButton | null;
  img: string | null;
  title: string | null;
  theme: {
    backgroundColor: string | null;
    textColor: string | null;
  };
};

export function extractNavDataAndTheme(
  targetDoc: Document,
): ExtractedNavData | null {
  const topBar = targetDoc.querySelector<HTMLElement>(".navigator");

  if (topBar == null) {
    return null;
  }

  const navList = topBar.querySelector(".s-uncollapsed-nav, .s-nav-items");
  const linkItems = Array.from(navList?.children ?? []) as HTMLLIElement[];
  const links = linkItems
    .filter((item) => isVisibleNavItem(item))
    .map((item) => item.querySelector<HTMLAnchorElement>("a[href]"))
    .filter((link): link is HTMLAnchorElement => link != null)
    .map((link) => ({
      label: cleanText(link.textContent),
      href: link.href,
    }))
    .filter((link) => link.label.length > 0);

  const navButtonEl =
    topBar.querySelector<HTMLAnchorElement>(".s-nav-btn a[href]");
  const navBtn =
    navButtonEl == null
      ? null
      : {
          label: cleanText(navButtonEl.textContent),
          href: navButtonEl.href,
        };

  const logoImage = topBar.querySelector<HTMLImageElement>(".s-logo-image img");
  const img = logoImage?.src ?? null;
  const title = cleanText(topBar.querySelector(".s-logo-title")?.textContent);

  const backgroundEl = topBar.querySelector<HTMLElement>(".s-navbar-desktop");
  const backgroundStyles =
    backgroundEl == null ? null : window.getComputedStyle(backgroundEl);

  const backgroundColor =
    backgroundStyles?.backgroundColor ?? backgroundStyles?.background ?? "#fff";
  const finalBackgroundColor =
    backgroundColor === "none" || backgroundColor === "rgba(0, 0, 0, 0)"
      ? "#fff"
      : backgroundColor;

  return {
    links,
    navBtn,
    img,
    title,
    theme: {
      backgroundColor: finalBackgroundColor,
      textColor: getContrastingTextColor(finalBackgroundColor),
    },
  };
}

export function removeNavbar(targetDoc: Document) {
  targetDoc.querySelector(".navigator")?.remove();
}

function isVisibleNavItem(item: HTMLLIElement) {
  return (
    item.style.display !== "none" &&
    // !item.classList.contains("hidden") && // This is actually intentional, ellipsified items have class=hidden (and we want those), but other items use style = display: none (and we don't want those)
    !item.classList.contains("s-nav-ellipsis")
  );
}

function cleanText(value: string | null | undefined) {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function getContrastingTextColor(backgroundColor: string | null) {
  const rgb = parseColorToRgb(backgroundColor);

  if (rgb == null) {
    return "#111827";
  }

  const luminance =
    (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;

  return luminance > 0.55 ? "#111827" : "#ffffff";
}

function parseColorToRgb(color: string | null) {
  if (color == null) {
    return null;
  }

  const trimmed = color.trim();

  if (trimmed.length === 0 || trimmed === "transparent") {
    return null;
  }

  const rgbMatch = trimmed.match(
    /^rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)(?:\s*,\s*[0-9.]+\s*)?\)$/i,
  );

  if (rgbMatch != null) {
    return {
      r: Number(rgbMatch[1]),
      g: Number(rgbMatch[2]),
      b: Number(rgbMatch[3]),
    };
  }

  const hexMatch = trimmed.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);

  if (hexMatch != null) {
    const hex = hexMatch[1];
    const normalized =
      hex.length === 3
        ? hex
            .split("")
            .map((char) => `${char}${char}`)
            .join("")
        : hex;

    return {
      r: Number.parseInt(normalized.slice(0, 2), 16),
      g: Number.parseInt(normalized.slice(2, 4), 16),
      b: Number.parseInt(normalized.slice(4, 6), 16),
    };
  }

  return null;
}
