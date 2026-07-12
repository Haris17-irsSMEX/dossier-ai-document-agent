function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function browserSafeBaseUrl(value: string) {
  const trimmed = trimTrailingSlash(value.trim());

  try {
    const parsed = new URL(trimmed);

    if (parsed.hostname === "0.0.0.0") {
      parsed.hostname = "localhost";
      return trimTrailingSlash(parsed.toString());
    }

    return trimmed;
  } catch {
    return trimmed;
  }
}

function vercelBrowserUrl() {
  const vercelHost =
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() ||
    process.env.VERCEL_URL?.trim();

  if (!vercelHost) {
    return null;
  }

  const normalizedHost = vercelHost
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");

  if (!normalizedHost || normalizedHost === "0.0.0.0") {
    return null;
  }

  return browserSafeBaseUrl(`https://${normalizedHost}`);
}

export function getAppBaseUrl() {
  const configured =
    process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.APP_BASE_URL?.trim();

  if (configured) {
    const safeConfigured = browserSafeBaseUrl(configured);

    if (process.env.NODE_ENV !== "production" || !isPrivateOrLocalUrl(safeConfigured)) {
      return safeConfigured;
    }
  }

  const vercelUrl = vercelBrowserUrl();

  if (vercelUrl) {
    return vercelUrl;
  }

  if (process.env.NODE_ENV === "development") {
    return "http://localhost:3000";
  }

  return "http://localhost:3000";
}

export function getPublicAppUrl() {
  return getAppBaseUrl();
}

export function buildAbsoluteAppUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getAppBaseUrl()}${normalizedPath}`;
}

export function isPrivateOrLocalUrl(url: string) {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return true;
    }

    if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
      return true;
    }

    if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
      return true;
    }

    const match = hostname.match(/^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);

    if (match) {
      const secondOctet = Number(match[1]);
      return secondOctet >= 16 && secondOctet <= 31;
    }

    return false;
  } catch {
    return false;
  }
}
