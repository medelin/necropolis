// SPDX-License-Identifier: AGPL-3.0-only

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { makeFixtureFetch, FixtureNotFoundError } from "./fixture-fetch.js";

// ---------------------------------------------------------------------------
// Test-only loader: reads fixture files via node:fs, resolving paths relative
// to the repo root.  Using node:fs here is intentional — this is a test helper,
// not part of the portable core adapter.  The adapter itself only uses the
// Web Crypto API (crypto.subtle) for hashing, which is available everywhere.
// ---------------------------------------------------------------------------

/** Repo root resolved from this file's location (packages/core/src/sources → 4 levels up) */
const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));

/** Inject a node:fs-based loader so tests never rely on dynamic import resolution. */
function makeNodeLoader() {
  return async (fixturePath: string): Promise<unknown> => {
    const absPath = join(repoRoot, fixturePath);
    const text = await readFile(absPath, "utf-8");
    return JSON.parse(text) as unknown;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** POST body for the querybatch fixture (must match the hash in the filename). */
const OSV_BATCH_BODY = JSON.stringify({
  queries: [
    {
      package: { name: "requests", ecosystem: "PyPI" },
      version: "2.28.0",
    },
  ],
});

/** Pre-computed sha256 of the canonicalised OSV_BATCH_BODY (see fixture filename). */
const OSV_BATCH_HASH =
  "029b159b356be65892c8159dff1c1de9ab354ad26e9cb1555309d0b51a33aad9";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("makeFixtureFetch — URL-to-path mapping", () => {
  it("1. PyPI single: resolves to fixtures/pypi/<name>.json", async () => {
    const fetch = makeFixtureFetch(makeNodeLoader());
    const res = await fetch("https://pypi.org/pypi/requests/json");
    expect(res.status).toBe(200);
    const data = (await res.json()) as { info?: { name: string } };
    expect(data.info?.name).toBe("requests");
  });

  it("2. PyPI versioned: resolves to fixtures/pypi/<name>-<ver>.json", async () => {
    const fetch = makeFixtureFetch(makeNodeLoader());
    const res = await fetch("https://pypi.org/pypi/requests/2.28.0/json");
    expect(res.status).toBe(200);
    const data = (await res.json()) as { info?: { version: string } };
    expect(data.info?.version).toBe("2.28.0");
  });

  it("3. npm latest: resolves to fixtures/npm/<name>-latest.json", async () => {
    const fetch = makeFixtureFetch(makeNodeLoader());
    const res = await fetch("https://registry.npmjs.org/express/latest");
    expect(res.status).toBe(200);
    const data = (await res.json()) as { name: string };
    expect(data.name).toBe("express");
  });

  it("4. npm full: resolves to fixtures/npm/<name>-full.json", async () => {
    const fetch = makeFixtureFetch(makeNodeLoader());
    const res = await fetch("https://registry.npmjs.org/express");
    expect(res.status).toBe(200);
    const data = (await res.json()) as { name: string };
    expect(data.name).toBe("express");
  });

  it("5. OSV querybatch: resolves to fixtures/osv/<sha256>.json", async () => {
    const fetch = makeFixtureFetch(makeNodeLoader());
    const res = await fetch("https://api.osv.dev/v1/querybatch", {
      method: "POST",
      body: OSV_BATCH_BODY,
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { results: unknown[] };
    expect(Array.isArray(data.results)).toBe(true);
    // Confirm the fixture was resolved by its sha256 (not by name)
    // by checking the content matches what we put in the hash-named file.
    expect((data.results[0] as { vulns: { id: string }[] }).vulns[0].id).toBe(
      "GHSA-test-0001-abcd"
    );
  });

  it("5b. OSV querybatch hash is stable and matches expected SHA-256", async () => {
    // Derive the hash the same way the adapter does, and confirm it equals
    // the known pre-computed value.
    const encoder = new TextEncoder();
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
    const parsed: unknown = JSON.parse(OSV_BATCH_BODY);
    const canonical = canonicalizeJson(parsed);
    const hashBuf = await crypto.subtle.digest(
      "SHA-256",
      encoder.encode(canonical)
    );
    const hash = Array.from(new Uint8Array(hashBuf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    expect(hash).toBe(OSV_BATCH_HASH);
  });

  it("6. OSV vuln detail: resolves to fixtures/osv/<id>.json", async () => {
    const fetch = makeFixtureFetch(makeNodeLoader());
    const res = await fetch(
      "https://api.osv.dev/v1/vulns/GHSA-test-0001-abcd"
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { id: string };
    expect(data.id).toBe("GHSA-test-0001-abcd");
  });
});

describe("makeFixtureFetch — FixtureNotFoundError", () => {
  it("throws FixtureNotFoundError for an unrecognised URL", async () => {
    const fetch = makeFixtureFetch(makeNodeLoader());
    await expect(
      fetch("https://example.com/unknown/endpoint")
    ).rejects.toThrow(FixtureNotFoundError);
  });

  it("FixtureNotFoundError message includes the requested URL", async () => {
    const fetch = makeFixtureFetch(makeNodeLoader());
    const unknownUrl = "https://example.com/no/fixture/here";
    await expect(fetch(unknownUrl)).rejects.toThrow(unknownUrl);
  });

  it("throws FixtureNotFoundError when fixture file is missing for a valid URL pattern", async () => {
    const fetch = makeFixtureFetch(makeNodeLoader());
    // This matches the PyPI pattern but no fixture file exists for 'nonexistent-pkg'
    await expect(
      fetch("https://pypi.org/pypi/nonexistent-pkg/json")
    ).rejects.toThrow(FixtureNotFoundError);
  });

  it("FixtureNotFoundError is an instance of Error", async () => {
    const fetch = makeFixtureFetch(makeNodeLoader());
    let caught: unknown;
    try {
      await fetch("https://example.com/no/fixture");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught).toBeInstanceOf(FixtureNotFoundError);
    expect((caught as FixtureNotFoundError).name).toBe("FixtureNotFoundError");
  });
});
