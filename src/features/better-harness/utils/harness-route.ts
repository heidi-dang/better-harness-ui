/**
 * Route utilities for Better Harness.
 *
 * # Route Format
 *
 * Preferred (server-aware):
 *   /server/:serverKey/project/:projectKey/better-harness
 *
 * Legacy (no server):
 *   /:projectKey/better-harness
 *
 * Optional display path (cosmetic only, does not affect API access):
 *   /server/:serverKey/project/:projectKey/better-harness?path=/workspace/foo
 *
 * # Identity Separation
 *
 * - projectKey  = opaque FlowDeck-registered identifier (never decoded to a filesystem path)
 * - serverKey   = identifies which FlowDeck server instance
 * - displayProjectPath = browser-only cosmetic path hint (not used for API auth)
 *
 * The old format used Base64(encodeURIComponent(dir)) as the project segment.
 * For backward compatibility, the raw encoded string is still accepted as the
 * projectKey value, and the decoder runs only for displayProjectPath extraction.
 */

export function encodeProjectDir(dir: string): string {
  try {
    return btoa(encodeURIComponent(dir))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  } catch {
    return encodeURIComponent(dir);
  }
}

export function decodeProjectDir(encoded: string): string {
  if (!encoded) return "";
  try {
    // Restore base64 standard characters and padding
    let base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4) {
      base64 += "=";
    }
    return decodeURIComponent(atob(base64));
  } catch {
    try {
      return decodeURIComponent(encoded);
    } catch {
      return encoded;
    }
  }
}

/**
 * Build a route string using opaque projectKey.
 * The displayProjectPath, if provided, is appended as a query parameter
 * for cosmetic use only — it never reaches the API.
 */
export function buildHarnessRoute(
  serverKey: string | undefined,
  projectKey: string,
  displayProjectPath?: string,
): string {
  let route: string;
  if (serverKey) {
    route = `/server/${encodeURIComponent(serverKey)}/project/${encodeURIComponent(projectKey)}/better-harness`;
  } else {
    route = `/${encodeURIComponent(projectKey)}/better-harness`;
  }
  if (displayProjectPath) {
    route += `?path=${encodeURIComponent(displayProjectPath)}`;
  }
  return route;
}

export interface ParsedHarnessRoute {
  serverKey?: string;
  projectKey: string;
  /** Cosmetic-only path hint for the UI. Never used for API access. */
  displayProjectPath?: string;
  isValid: boolean;
}

/** Detect whether a string looks like URL-safe base64. */
function looksLikeBase64(s: string): boolean {
  return /^[A-Za-z0-9\-_]{4,}$/.test(s);
}

export function parseHarnessRoute(pathname: string): ParsedHarnessRoute {
  // New format: /server/:serverKey/project/:projectKey/better-harness
  const serverProjectMatch = pathname.match(
    /^\/server\/([^/]+)\/project\/([^?/]+)\/better-harness\/?(\?.*)?$/,
  );
  if (serverProjectMatch) {
    const serverKey = decodeURIComponent(serverProjectMatch[1]);
    const projectKey = decodeURIComponent(serverProjectMatch[2]);

    // Extract optional ?path= query param for displayProjectPath
    const queryString = serverProjectMatch[3] || "";
    const queryParams = new URLSearchParams(queryString.replace(/^\?/, ""));
    let displayProjectPath: string | undefined = queryParams.get("path") || undefined;

    // Backward compatibility: if the projectKey looks like old-style base64,
    // try to decode it for display purposes only
    if (!displayProjectPath && looksLikeBase64(projectKey)) {
      const decoded = decodeProjectDir(projectKey);
      if (decoded && decoded !== projectKey) {
        displayProjectPath = decoded;
      }
    }

    return {
      serverKey,
      projectKey,
      displayProjectPath,
      isValid: Boolean(projectKey),
    };
  }

  // Legacy format (no server): /:projectKey/better-harness
  const legacyMatch = pathname.match(/^\/([^?/]+)\/better-harness\/?(\?.*)?$/);
  if (legacyMatch && legacyMatch[1] !== "server") {
    const projectKey = decodeURIComponent(legacyMatch[1]);

    const queryString = legacyMatch[2] || "";
    const queryParams = new URLSearchParams(queryString.replace(/^\?/, ""));
    let displayProjectPath: string | undefined = queryParams.get("path") || undefined;

    if (!displayProjectPath && looksLikeBase64(projectKey)) {
      const decoded = decodeProjectDir(projectKey);
      if (decoded && decoded !== projectKey) {
        displayProjectPath = decoded;
      }
    }

    return {
      projectKey,
      displayProjectPath,
      isValid: Boolean(projectKey),
    };
  }

  return {
    projectKey: "",
    isValid: false,
  };
}
