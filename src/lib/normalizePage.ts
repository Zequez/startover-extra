export function normalizeMyStrikinglyUrl(url: string) {
  const pageName = extractMyStrikinglyPageName(url);

  if (pageName == null) {
    return null;
  }

  return `https://${pageName}.mystrikingly.com/`;
}

export function extractMyStrikinglyPageName(value: string) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();

    if (!hostname.endsWith(".mystrikingly.com")) {
      return null;
    }

    const parts = hostname.split(".");

    if (parts.length !== 3 || parts[0] === "www") {
      return null;
    }

    return parts[0];
  } catch {
    return null;
  }
}
