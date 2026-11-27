// SPDX-License-Identifier: AGPL-3.0-only

import type { FetchFn } from "./types.js";

/**
 * Error thrown when a requested URL has no corresponding fixture file.
 * Fulfils Req 9.4: any test that reaches a URL with no fixture fails with a
 * descriptive error that names the URL.
 */
export class FixtureNotFoundError extends Error {
  constructor(url: string) {
    super(`No fixture found for URL: ${url}`);
    this.name = "FixtureNotFoundError";
    // Maintain correct prototype chain in environments that transpile classes.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * A loader function that reads a fixture file by its repo-root-relative path
 * (e.g. "fixtures/pypi/requests.json") and returns its parsed JSON content.
 *
 * The default implementation uses dynamic `import()` with
 * `{ with: { type: 'json' } }`, which works in Node ≥ 20.10 and in browser
 * bundlers (Vite handles the path at build time when not @vite-ignore'd).
 *
 * Tests that run in Node can supply a custom loader built on `node:fs` to
 * resolve paths relative to the repo root without relying on import resolution.
 */
export type FixtureLoader = (fixturePath: string) => Promise<unknown>;

/**
 * Canonicalise a JSON value by recursively sorting object keys.
 * Used to produce a stable string for SHA-256 hashing of OSV querybatch bodies.
 */
function canonicalizeJson(value: unknown): string {
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalizeJson).join(",") + "]";
  }
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return (
      "{" +
      keys
        .map(
          (k) =>
            JSON.stringify(k) +
            ":" +
            canonicalizeJson((value as Record<string, unknown>)[k])
        )
        .join(",") +
      "}"
    );
  }
  return JSON.stringify(value);
}

/**
 * Compute a hex SHA-256 digest of `text` using the Web Crypto API
 * (`crypto.subtle`), available natively in both Node 20+ and browsers.
 */
async function sha256Hex(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Map a URL (and optional RequestInit) to a repo-root-relative fixture path.
 *
 * URL patterns:
 *   https://pypi.org/pypi/<name>/json             → fixtures/pypi/<name>.json
 *   https://pypi.org/pypi/<name>/<ver>/json        → fixtures/pypi/<name>-<ver>.json
 *   https://registry.npmjs.org/<name>/latest       → fixtures/npm/<name>-latest.json
 *   https://registry.npmjs.org/<name>              → fixtures/npm/<name>-full.json
 *   POST https://api.osv.dev/v1/querybatch         → fixtures/osv/<sha256>.json
 *   GET  https://api.osv.dev/v1/vulns/<id>         → fixtures/osv/<id>.json
 */
async function urlToFixturePath(
  url: string,
  init?: RequestInit
): Promise<string> {
  // PyPI single:  https://pypi.org/pypi/<name>/json
  // PyPI versioned: https://pypi.org/pypi/<name>/<ver>/json
  const pypiMatch = url.match(
    /^https:\/\/pypi\.org\/pypi\/([^/]+)(?:\/([^/]+))?\/json$/
  );
  if (pypiMatch) {
    const [, name, ver] = pypiMatch;
    return ver
      ? `fixtures/pypi/${name}-${ver}.json`
      : `fixtures/pypi/${name}.json`;
  }

  // npm latest: https://registry.npmjs.org/<name>/latest
  const npmLatestMatch = url.match(
    /^https:\/\/registry\.npmjs\.org\/(.+)\/latest$/
  );
  if (npmLatestMatch) {
    return `fixtures/npm/${npmLatestMatch[1]}-latest.json`;
  }

  // npm full: https://registry.npmjs.org/<name>
  const npmFullMatch = url.match(/^https:\/\/registry\.npmjs\.org\/(.+)$/);
  if (npmFullMatch) {
    return `fixtures/npm/${npmFullMatch[1]}-full.json`;
  }

  // OSV querybatch: POST https://api.osv.dev/v1/querybatch
  if (
    url === "https://api.osv.dev/v1/querybatch" &&
    init?.method?.toUpperCase() === "POST"
  ) {
    const rawBody =
      typeof init.body === "string" ? init.body : JSON.stringify(init.body);
    const parsed: unknown = JSON.parse(rawBody);
    const canonical = canonicalizeJson(parsed);
    const hash = await sha256Hex(canonical);
    return `fixtures/osv/${hash}.json`;
  }

  // OSV vuln detail: GET https://api.osv.dev/v1/vulns/<id>
  const osvVulnMatch = url.match(/^https:\/\/api\.osv\.dev\/v1\/vulns\/(.+)$/);
  if (osvVulnMatch) {
    return `fixtures/osv/${osvVulnMatch[1]}.json`;
  }

  throw new FixtureNotFoundError(url);
}

/**
 * Build the default loader that uses dynamic `import()` with the
 * `{ with: { type: 'json' } }` import attribute.
 *
 * The fixture path (e.g. "fixtures/pypi/requests.json") is resolved relative
 * to this module's location using `import.meta.url`, which works in both
 * Node and browser bundlers.  For Vite the `@vite-ignore` comment suppresses
 * the "dynamic import with variable path" warning.
 */
function makeDefaultLoader(): FixtureLoader {
  // Repo root is four levels up from packages/core/src/sources/
  // (sources → src → core → packages → repo-root)
  const repoRoot = new URL("../../../../", import.meta.url).href;

  return async (fixturePath: string) => {
    const absoluteUrl = new URL(fixturePath, repoRoot).href;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const mod = await import(
      /* @vite-ignore */
      absoluteUrl,
      { with: { type: "json" } }
    );
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    return (mod as { default: unknown }).default;
  };
}

/**
 * Create a `FetchFn` that serves responses from recorded fixture files instead
 * of issuing real network requests.  The optional `loader` parameter lets tests
 * inject a custom file reader (e.g. one built on `node:fs`) without changing
 * the zero-argument call signature used by the browser and MCP hosts.
 *
 * Usage (fixture mode):
 *   const fixtureFetch = makeFixtureFetch();      // zero-arg call in production
 *   const fixtureFetch = makeFixtureFetch(loader); // injected in tests
 *
 * Any URL with no corresponding fixture file throws `FixtureNotFoundError`
 * whose message includes the requested URL (Req 9.4).
 */
export function makeFixtureFetch(loader?: FixtureLoader): FetchFn {
  const resolve = loader ?? makeDefaultLoader();

  return async (url: string, init?: RequestInit): Promise<Response> => {
    // urlToFixturePath throws FixtureNotFoundError for unrecognised URLs.
    const fixturePath = await urlToFixturePath(url, init);

    let data: unknown;
    try {
      data = await resolve(fixturePath);
    } catch (err) {
      // Re-throw FixtureNotFoundError unchanged; wrap loader errors.
      if (err instanceof FixtureNotFoundError) throw err;
      throw new FixtureNotFoundError(url);
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
}
