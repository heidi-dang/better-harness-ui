/**
 * Route utilities for Better Harness.
 * Supports /server/:serverKey/project/:dir/better-harness and /:dir/better-harness
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

export function buildHarnessRoute(serverKey: string | undefined, projectDir: string): string {
  const encodedDir = encodeProjectDir(projectDir);
  if (serverKey) {
    return `/server/${encodeURIComponent(serverKey)}/project/${encodedDir}/better-harness`;
  }
  return `/${encodedDir}/better-harness`;
}

export interface ParsedHarnessRoute {
  serverKey?: string;
  projectDir: string;
  rawEncodedDir: string;
  isValid: boolean;
}

export function parseHarnessRoute(pathname: string): ParsedHarnessRoute {
  const serverProjectMatch = pathname.match(
    /^\/server\/([^/]+)\/project\/([^/]+)\/better-harness\/?$/
  );
  if (serverProjectMatch) {
    const serverKey = decodeURIComponent(serverProjectMatch[1]);
    const rawEncodedDir = serverProjectMatch[2];
    const projectDir = decodeProjectDir(rawEncodedDir);
    return {
      serverKey,
      projectDir,
      rawEncodedDir,
      isValid: Boolean(projectDir),
    };
  }

  const legacyMatch = pathname.match(/^\/([^/]+)\/better-harness\/?$/);
  if (legacyMatch && legacyMatch[1] !== "server") {
    const rawEncodedDir = legacyMatch[1];
    const projectDir = decodeProjectDir(rawEncodedDir);
    return {
      projectDir,
      rawEncodedDir,
      isValid: Boolean(projectDir),
    };
  }

  return {
    projectDir: "",
    rawEncodedDir: "",
    isValid: false,
  };
}
