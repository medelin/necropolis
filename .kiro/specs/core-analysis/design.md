# Design Document — `core-analysis`

## Overview

`packages/core` is the pure analysis engine shared by the web frontend, the MCP server, and the gate CLI. It has zero Node-only or DOM-only dependencies; `fetch`, clock, and cache are constructor-injected so each host provides its own implementation. The engine parses `requirements.txt` and `package.json` manifests, queries PyPI, npm, and OSV.dev (or returns fixture responses), scores every dependency, and renders a Markdown report.

## Architecture

```
packages/core/
├── index.ts                  # Re-exports audit(), AuditResult, config
├── config.ts                 # Thresholds: ADRIFT_MONTHS=24, WRECK_MONTHS=48
├── parsers/
│   ├── requirements.ts       # Requirements_Parser  → Req 1
│   ├── package-json.ts       # Package_JSON_Parser  → Req 2
│   └── types.ts              # Entry, ParseResult, ParseWarning
├── sources/
│   ├── pypi.ts               # PyPI_Client          → Req 3
│   ├── npm.ts                # npm_Client           → Req 4
│   ├── osv.ts                # OSV_Client           → Req 5
│   ├── concurrency.ts        # 6-request limiter    → Req 7.2
│   ├── fixture-fetch.ts      # Fixture-mode adapter → Req 7.7, 9
│   └── types.ts              # RegistryData, FetchFn, Clock, Cache
├── scoring/
│   ├── scorer.ts             # Scorer               → Req 6
│   └── epitaph.ts            # Epitaph templates    → Req 6.9
├── report/
│   └── markdown.ts           # Report_Renderer      → Req 8.3–8.4
├── successors/
│   └── lookup.ts             # Loads data/successors.json → Req 6.10
└── audit.ts                  # Audit_Function       → Req 8.1–8.2, 8.5–8.6
```

**Dependency flow** (no cycles, no host APIs in core):

```
audit.ts
  ├─ parsers/requirements.ts | parsers/package-json.ts
  ├─ sources/pypi.ts | sources/npm.ts | sources/osv.ts
  │     └─ sources/concurrency.ts (wraps FetchFn)
  ├─ scoring/scorer.ts
  │     └─ scoring/epitaph.ts
  │     └─ successors/lookup.ts
  └─ report/markdown.ts
```

## Components and Interfaces

### Injected interfaces

```ts
// sources/types.ts

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
```

### Parser types

```ts
// parsers/types.ts

export type Ecosystem = 'pypi' | 'npm';

export interface Entry {
  name: string;            // PEP 503-normalised for PyPI; lowercase for npm
  ecosystem: Ecosystem;
  pinnedVersion?: string;  // exact ==x.y.z or exact semver
  range?: string;          // any other specifier string
  dev?: boolean;           // npm devDependencies
  extras?: string[];       // PyPI extras in []
  marker?: string;         // PyPI environment marker after ;
}

export interface ParseWarning {
  lineNumber: number;
  line: string;
  reason: string;
}

export interface ParseResult {
  entries: Entry[];
  warnings: ParseWarning[];
}
```

### Registry data

```ts
// sources/types.ts (continued)

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
```

### Scoring types

```ts
// scoring/scorer.ts (types exported from index)

export type State = 'alive' | 'adrift' | 'wreck' | 'unknown';

export interface EvidenceItem {
  fact: string;
  source_url: string;
  observed_at: string; // ISO 8601
}

export interface Successor {
  name: string;
  source_url: string;
}

export interface ScoredPackage {
  entry: Entry;
  state: State;
  contaminated: boolean;
  ringCount: 0 | 1 | 2 | 3;
  evidence: EvidenceItem[];
  epitaph: string;
  successor?: Successor;
}
```

### Audit result

```ts
// audit.ts

export interface AuditSummary {
  alive: number;
  adrift: number;
  wreck: number;
  unknown: number;
  contaminated: number;
}

export interface AuditResult {
  summary: AuditSummary;
  packages: ScoredPackage[];
  warnings: string[];
}
```

## Data Models

### config.ts — thresholds (Req 6.7)

```ts
export const config = {
  ADRIFT_MONTHS: 24,   // alive → adrift boundary
  WRECK_MONTHS: 48,    // adrift → wreck (presumed) boundary
} as const;
```

Both thresholds are referenced from `config` everywhere; changing these two numbers reconfigures the entire scoring engine.

### JSON Schema for AuditResult (Req 8.5)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://necropolis.app/schemas/audit-result.json",
  "type": "object",
  "required": ["summary", "packages", "warnings"],
  "additionalProperties": false,
  "properties": {
    "summary": {
      "type": "object",
      "required": ["alive", "adrift", "wreck", "unknown", "contaminated"],
      "additionalProperties": false,
      "properties": {
        "alive":        { "type": "integer", "minimum": 0 },
        "adrift":       { "type": "integer", "minimum": 0 },
        "wreck":        { "type": "integer", "minimum": 0 },
        "unknown":      { "type": "integer", "minimum": 0 },
        "contaminated": { "type": "integer", "minimum": 0 }
      }
    },
    "packages": {
      "type": "array",
      "items": { "$ref": "#/$defs/ScoredPackage" }
    },
    "warnings": {
      "type": "array",
      "items": { "type": "string" }
    }
  },
  "$defs": {
    "ScoredPackage": {
      "type": "object",
      "required": ["entry", "state", "contaminated", "ringCount", "evidence", "epitaph"],
      "properties": {
        "entry":       { "$ref": "#/$defs/Entry" },
        "state":       { "enum": ["alive", "adrift", "wreck", "unknown"] },
        "contaminated":{ "type": "boolean" },
        "ringCount":   { "enum": [0, 1, 2, 3] },
        "evidence":    { "type": "array", "items": { "$ref": "#/$defs/EvidenceItem" } },
        "epitaph":     { "type": "string" },
        "successor":   { "$ref": "#/$defs/Successor" }
      }
    },
    "Entry": {
      "type": "object",
      "required": ["name", "ecosystem"],
      "properties": {
        "name":          { "type": "string" },
        "ecosystem":     { "enum": ["pypi", "npm"] },
        "pinnedVersion": { "type": "string" },
        "range":         { "type": "string" },
        "dev":           { "type": "boolean" },
        "extras":        { "type": "array", "items": { "type": "string" } },
        "marker":        { "type": "string" }
      }
    },
    "EvidenceItem": {
      "type": "object",
      "required": ["fact", "source_url", "observed_at"],
      "properties": {
        "fact":        { "type": "string" },
        "source_url":  { "type": "string", "format": "uri" },
        "observed_at": { "type": "string", "format": "date-time" }
      }
    },
    "Successor": {
      "type": "object",
      "required": ["name", "source_url"],
      "properties": {
        "name":       { "type": "string" },
        "source_url": { "type": "string", "format": "uri" }
      }
    }
  }
}
```

### Scoring decision table

State assignment rules applied in priority order (first match wins):

| Registry responded | Explicit signal | Age from last release | State | Label |
|---|---|---|---|---|
| No | — | — | `unknown` | "no signal" |
| Yes | deprecated / yanked / Inactive | any | `wreck` | signal text |
| Yes | none | ≤ 24 months | `alive` | — |
| Yes | none | > 24 and ≤ 48 months | `adrift` | "silent since \<year\>" |
| Yes | none | > 48 months | `wreck` | "presumed lost" |

> "dead" is used only when an explicit registry signal is present (deprecated, yanked, Inactive).

Contamination and ring count (Req 6.6):

| OSV advisory count | `contaminated` | `ringCount` |
|---|---|---|
| 0 | false | 0 |
| 1–2 | true | 1 |
| 3–5 | true | 2 |
| 6+ | true | 3 |

No pinned version → advisory lookup skipped → `contaminated: false`, `ringCount: 0`.

### Epitaph templates (Req 6.9)

One template per state, evaluated at scoring time. `{name}` is the package name, `{year}` is the year of the last-known release, `{survivors}` is a comma-joined list of dependent package names when available.

| State | Explicit signal? | Template |
|---|---|---|
| `alive` | — | `"{name} sails on. Last transmission: {date}."` |
| `adrift` | — | `"Here drifts {name}. Silent since {year}."` |
| `wreck` | yes (deprecated) | `"Here lies {name}. Deprecated: {signal}."` |
| `wreck` | yes (yanked) | `"Here lies {name}. Yanked from orbit: {yankReason}."` |
| `wreck` | yes (Inactive) | `"Here lies {name}. Registry classified inactive."` |
| `wreck` | no (age > 48 mo) | `"Wreck of {name}. Presumed lost. Last signal: {year}."` |
| `unknown` | — | `"Ghost: {name}. No signal from the registry."` |

No third-party names, no film/game references, no word "dead" except on explicit registry signal.

### Fixture-mode adapter (Req 7.7, 9)

When `fixtureMode` is `true`, the real `FetchFn` is replaced before the audit begins:

```ts
// sources/fixture-fetch.ts

export function makeFixtureFetch(): FetchFn {
  return async (url: string): Promise<Response> => {
    const path = urlToFixturePath(url);
    // Dynamic import works in both Node and browser bundlers
    const module = await import(/* @vite-ignore */ path, { assert: { type: 'json' } });
    return new Response(JSON.stringify(module.default), { status: 200 });
  };
}

function urlToFixturePath(url: string): string {
  // https://pypi.org/pypi/<name>/json          → fixtures/pypi/<name>.json
  // https://pypi.org/pypi/<name>/<ver>/json    → fixtures/pypi/<name>-<ver>.json
  // https://registry.npmjs.org/<name>/latest   → fixtures/npm/<name>-latest.json
  // https://registry.npmjs.org/<name>          → fixtures/npm/<name>-full.json
  // https://api.osv.dev/v1/querybatch          → fixtures/osv/<sha256-of-body>.json
  // https://api.osv.dev/v1/vulns/<id>          → fixtures/osv/<id>.json
  ...
}
```

The fixture path maps to `fixtures/<ecosystem>/<name>.json` for single-package lookups and `fixtures/osv/<batch-hash>.json` for OSV batch requests (hash of the canonicalised request body). Any URL with no fixture file throws an error that names the URL — fulfilling Req 9.4.

### Concurrency limiter (Req 7.2)

```ts
// sources/concurrency.ts

export function makeLimitedFetch(fetch: FetchFn, limit = 6): FetchFn {
  let active = 0;
  const queue: Array<() => void> = [];

  return async (url, init) => {
    if (active >= limit) {
      await new Promise<void>(resolve => queue.push(resolve));
    }
    active++;
    try {
      return await fetch(url, init);
    } finally {
      active--;
      queue.shift()?.();
    }
  };
}
```

`audit()` wraps the injected `FetchFn` with `makeLimitedFetch` before passing it to the clients.

### npm light-endpoint decision (Req 4.1–4.2)

`GET /latest` is always fetched first because it returns the latest version, deprecation message, and repository URL in a single small response; the full document (`GET /<name>`) is fetched lazily only when the package is neither deprecated nor 404, since the full document's `time` map is needed only to determine whether the package is adrift or a wreck.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Parser never throws

*For any* string input (including empty, binary-looking, and structurally invalid text), calling `parseRequirements(input)` or `parsePackageJson(input)` SHALL return a `ParseResult` without throwing an exception.

**Validates: Requirements 1.9, 2.7**

---

### Property 2: requirements.txt round-trip

*For any* list of valid `Entry` objects with `ecosystem = 'pypi'`, serialising the list to `requirements.txt` text and then parsing that text SHALL produce a list of entries equivalent to the original (same name, pinnedVersion, range, extras, marker).

**Validates: Requirements 1.10**

---

### Property 3: package.json round-trip

*For any* list of valid `Entry` objects with `ecosystem = 'npm'`, serialising the list to `package.json` format and then parsing that text SHALL produce a list of entries equivalent to the original (same name, pinnedVersion, range, dev).

**Validates: Requirements 2.8**

---

### Property 4: Scoring monotonic in age

*For any* two packages where all inputs are equal except that package A's last-release date is strictly older than package B's, the scorer SHALL never assign A a state that is strictly healthier than B's state (ordering: `alive` > `adrift` > `wreck` > `unknown`).

**Validates: Requirements 6.11**

---

### Property 5: Scoring monotonic in advisory count

*For any* two packages where all inputs are equal except that package A has strictly more OSV advisories than package B, the scorer SHALL never assign A a `ringCount` lower than B's `ringCount`.

**Validates: Requirements 6.12**

---

## Error Handling

| Failure | Boundary | Outcome |
|---|---|---|
| Network error / timeout (single package) | Client catch block | `state = 'unknown'`; error message stored as `EvidenceItem`; other packages unaffected |
| HTTP 404 from PyPI or npm | Client response check | `state = 'unknown'`; evidence records the 404 and URL |
| OSV batch request failure | `osv.ts` catch block | All queried packages get advisory-status unknown; `contaminated` stays `false`; other scoring unaffected |
| Invalid JSON from npm / PyPI | Client JSON.parse try/catch | `state = 'unknown'`; evidence records parse failure |
| Manifest > 150 packages | `audit.ts` after parse | Slice to first 150; push one warning: `"Omitted N packages (limit 150)"` |
| `package.json` not valid JSON | `parsePackageJson` | Returns `ParseResult` with zero entries and one `ParseWarning` |
| Timeout | `AbortSignal.timeout(ms)` passed in `RequestInit` | `fetch` rejects; caught at client boundary; recorded as above |

Timeouts are set via `AbortSignal.timeout` within the `FetchFn` wrapper in `audit.ts`, keeping clients free of hardcoded timeouts.

## Testing Strategy

**Framework**: Vitest + fast-check for property tests; Vitest alone for fixture-based acceptance tests.

**Network isolation**: Any test that reaches the real network fails with a descriptive error naming the URL (Req 9.4). In CI, the injected `FetchFn` always throws `NetworkAccessDeniedError` unless `fixtureMode` is `true`.

### Property-based tests (fast-check)

Each test runs ≥ 100 iterations (fast-check default is 100).

| Property | fast-check generator sketch | Verifies | Req |
|---|---|---|---|
| `prop_parser_no_throw` | `fc.string()` for requirements, arbitrary JSON-like strings for package.json | No exception thrown; result has `entries` and `warnings` arrays | 1.9, 2.7 |
| `prop_round_trip_requirements` | `fc.array(fc.record({ name: fc.string(), pinnedVersion: fc.option(semverArb), ... }))` → serialise → parse | Parsed entries equal originals | 1.10 |
| `prop_round_trip_package_json` | Same entry generator with `ecosystem = 'npm'` | Parsed entries equal originals | 2.8 |
| `prop_scoring_monotonic_age` | Two `RegistryData` records differing only in `latestPublishedAt`; arbitrary clock | Older package never healthier | 6.11 |
| `prop_scoring_monotonic_advisories` | Two advisory-count integers `a > b ≥ 0` | `ringCount(a) ≥ ringCount(b)` | 6.12 |

Tag comment format in test files:
```ts
// Feature: core-analysis, Property 2: requirements.txt round-trip
```

### Fixture-based acceptance tests

| Test group | Coverage |
|---|---|
| `requirements_parser.acceptance.test.ts` | 20 cases from Req 1.11 (plain name, pin, ranges, extras, markers, skips) |
| `package_json_parser.acceptance.test.ts` | 20 cases from Req 2.9 (deps, devDeps, pins, ranges, skip prefixes) |
| `pypi_client.fixture.test.ts` | 10 fixture packages: yanked, Inactive, healthy, 404 (Req 3.6) |
| `npm_client.fixture.test.ts` | 10 fixture packages: deprecated, healthy, 404 (Req 4.6) |
| `audit.fixture.test.ts` | Full-round audit of sample manifests; validates JSON schema conformance (Req 8.5) |

### Unit tests

- `config.test.ts`: threshold constants exported correctly.
- `epitaph.test.ts`: one test per state/signal combination from the template table.
- `markdown.test.ts`: renderer produces correct table headers, footnote links, no HTML tags.
- `scorer.test.ts`: boundary values at exactly 24 and 48 months; ring-count thresholds at 1, 2, 3, 6 advisories; `contaminated = false` when no pinned version.
- `concurrency.test.ts`: at most 6 in-flight fetches at any point (mock timer + counter).
- `fixture-fetch.test.ts`: URL-to-path mapping; throws descriptive error for unknown URLs.

### Markdown report layout (Req 8.3–8.4)

The renderer produces two GitHub-compatible Markdown tables followed by per-package evidence footnotes.

**Summary table:**

```markdown
| State     | Count |
|-----------|-------|
| ⛵ Alive  |     8 |
| 🌊 Adrift |     3 |
| 💀 Wreck  |     2 |
| ❓ Unknown|     1 |
| ☣ Contaminated | 2 |
```

**Per-package table:**

```markdown
| Package | State | Last Release | Advisories | Epitaph |
|---------|-------|--------------|------------|---------|
| requests | ⛵ alive | 2024-11-01 | — | "requests sails on. Last transmission: 2024." |
| left-pad | 💀 wreck | 2017-03-23 | — | "Here lies left-pad. Yanked from orbit: sabotage." |
| pycrypto | 💀 wreck | 2014-05-21 | ☣ 3 | "Wreck of pycrypto. Presumed lost. Last signal: 2014." |
```

Evidence links appear below the table as footnote-style references:

```markdown
**Evidence**
- `requests`: [PyPI metadata](https://pypi.org/pypi/requests/json) · observed 2025-01-15T10:00:00Z
- `pycrypto`: [OSV advisory GHSA-xxxx](https://api.osv.dev/v1/vulns/GHSA-xxxx) · observed 2025-01-15T10:00:00Z
```

No HTML tags anywhere; standard Markdown pipe-table syntax only.
