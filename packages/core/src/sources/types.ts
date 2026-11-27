// SPDX-License-Identifier: AGPL-3.0-only

/** Injected fetch — same signature as the WHATWG Fetch API. */
export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

/** Injected clock — returns epoch milliseconds. */
export interface Clock {
  now(): number;
}

/** Injected cache — 24-hour TTL store keyed by URL. */
export interface Cache {
  get(url: string): string | undefined;
  set(url: string, body: string, ttlMs: number): void;
}

/** All host-provided dependencies passed to audit(). */
export interface CoreDeps {
  fetch: FetchFn;
  clock: Clock;
  cache: Cache;
  fixtureMode?: boolean; // override fetch with fixture adapter
}

export interface RegistryData {
  latestVersion: string;
  latestPublishedAt: string;      // ISO 8601
  pinnedYanked?: boolean;         // PyPI only
  yankReason?: string;
  deprecated?: string;            // npm: deprecated message for latest
  deprecatedPinned?: string;      // npm: deprecated message for pinned version
  isInactive?: boolean;           // PyPI classifier 7-Inactive
  repositoryUrl?: string;
  vulnerabilities?: string[];     // advisory IDs from OSV batch
}
