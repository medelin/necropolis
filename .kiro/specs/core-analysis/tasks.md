# Implementation Plan: core-analysis

## Overview

Build the pure analysis engine in `packages/core` — a TypeScript ES-module package with zero Node-only or DOM-only dependencies. The engine parses `requirements.txt` and `package.json` manifests, queries PyPI, npm, and OSV.dev (or returns fixture responses), scores every dependency, and renders a Markdown report. Each group of tasks is designed so the previous group's output is a prerequisite for the next.

## Tasks

- [x] 1. Workspace scaffolding and configuration
  - Create `packages/core/package.json` as an npm workspace member with name `@necropolis/core`, type `"module"`, and no Node-only or DOM-only dependencies
  - Add `packages/core` to the root `package.json` workspaces array
  - Create `packages/core/tsconfig.json` with `strict: true`, `module: NodeNext`, `moduleResolution: NodeNext`, and `target: ES2022`
  - Create `packages/core/vitest.config.ts` referencing Vitest and fast-check as dev dependencies
  - Install `vitest` and `fast-check` as dev dependencies in `packages/core`
  - Create `packages/core/src/config.ts` exporting the `config` object with `ADRIFT_MONTHS: 24` and `WRECK_MONTHS: 48` as `const`; add SPDX header `// SPDX-License-Identifier: AGPL-3.0-only`
  - Create `packages/core/src/config.test.ts` asserting both constants are exported with the correct values
  - All new `.ts` source files carry the SPDX header `// SPDX-License-Identifier: AGPL-3.0-only`
  - _Requirements: 6.7, 7.4_

- [x] 2. Shared type definitions
  - [x] 2.1 Create `packages/core/src/parsers/types.ts` exporting `Ecosystem`, `Entry`, `ParseWarning`, and `ParseResult` exactly as specified in the design's "Parser types" section
    - _Requirements: 1.1–1.4, 2.1–2.4_

  - [x] 2.2 Create `packages/core/src/sources/types.ts` exporting `FetchFn`, `Clock`, `Cache`, `CoreDeps`, and `RegistryData` exactly as specified in the design's "Injected interfaces" and "Registry data" sections
    - _Requirements: 7.4_

  - [x] 2.3 Create `packages/core/src/scoring/scorer.ts` (types portion only) exporting `State`, `EvidenceItem`, `Successor`, and `ScoredPackage`; and `packages/core/src/audit.ts` (types portion only) exporting `AuditSummary` and `AuditResult`
    - _Requirements: 6.8, 8.1–8.2_

- [x] 3. `requirements.txt` parser
  - [x] 3.1 Implement `packages/core/src/parsers/requirements.ts` exporting `parseRequirements(text: string): ParseResult`
    - Handle `==` pin, non-`==` range specifiers, extras in `[]`, environment markers after `;`, backslash continuation lines
    - Skip blank lines and `#` comments silently
    - Skip and emit `ParseWarning` for lines beginning with `-r`, `-c`, `-e`, `--index-url`, direct URLs, and VCS references (Req 1.7)
    - Normalise all package names per PEP 503 (lowercase; runs of `-`, `_`, `.` → single `-`)
    - Never throw for any string input; unrecognised lines are skipped-with-warning
    - _Requirements: 1.1–1.9_

  - [x]* 3.2 Write property test `prop_parser_no_throw` for `parseRequirements`
    - **Property 1: Parser never throws**
    - Use `fc.string()` as the generator; assert that `parseRequirements(input)` always returns an object with `entries` and `warnings` arrays without throwing
    - Tag comment: `// Feature: core-analysis, Property 1: Parser never throws`
    - File: `packages/core/src/parsers/requirements.test.ts`
    - **Validates: Requirements 1.9**

  - [x]* 3.3 Write property test `prop_round_trip_requirements` for `parseRequirements`
    - **Property 2: requirements.txt round-trip**
    - Generate arbitrary lists of valid `Entry` objects with `ecosystem = 'pypi'` using fast-check; serialise to `requirements.txt` text; parse; assert equivalence of name, pinnedVersion, range, extras, marker
    - Tag comment: `// Feature: core-analysis, Property 2: requirements.txt round-trip`
    - File: `packages/core/src/parsers/requirements.test.ts`
    - **Validates: Requirements 1.10**

  - [x]* 3.4 Write 20-case acceptance tests for `parseRequirements`
    - Cover: plain name, `==` pin, `>=` range, `~=` range, extras, environment marker, inline comment, blank line, continuation line, and each of the six skip-with-warning prefixes (`-r`, `-c`, `-e`, `--index-url`, direct URL, VCS ref)
    - File: `packages/core/src/parsers/requirements_parser.acceptance.test.ts`
    - _Requirements: 1.11_

- [x] 4. `package.json` parser
  - [x] 4.1 Implement `packages/core/src/parsers/package-json.ts` exporting `parsePackageJson(text: string): ParseResult`
    - Produce `Entry` with `dev: false` for `dependencies`, `dev: true` for `devDependencies`
    - Mark entry as pinned when version is exact semver (no range operators)
    - Store full specifier as `range` for semver range operators (`^`, `~`, `>=`, `<=`, `>`, `<`, `||`, `-`)
    - Skip and emit `ParseWarning` for specifiers beginning with `npm:`, `git`, `github:`, `http://`, `https://`, `file:`, `link:`, `workspace:`
    - Return zero entries and one `ParseWarning` when input is not valid JSON; never throw
    - _Requirements: 2.1–2.7_

  - [x]* 4.2 Write property test `prop_parser_no_throw` for `parsePackageJson`
    - **Property 1: Parser never throws**
    - Use `fc.string()` and arbitrary JSON-like strings as generators; assert that `parsePackageJson(input)` always returns `{ entries, warnings }` without throwing
    - Tag comment: `// Feature: core-analysis, Property 1: Parser never throws`
    - File: `packages/core/src/parsers/package-json.test.ts`
    - **Validates: Requirements 2.7**

  - [x]* 4.3 Write property test `prop_round_trip_package_json` for `parsePackageJson`
    - **Property 3: package.json round-trip**
    - Generate arbitrary lists of valid `Entry` objects with `ecosystem = 'npm'`; serialise to `package.json` text; parse; assert equivalence of name, pinnedVersion, range, dev
    - Tag comment: `// Feature: core-analysis, Property 3: package.json round-trip`
    - File: `packages/core/src/parsers/package-json.test.ts`
    - **Validates: Requirements 2.8**

  - [x]* 4.4 Write 20-case acceptance tests for `parsePackageJson`
    - Cover: plain `dependencies`, plain `devDependencies`, exact semver pin, caret range, tilde range, combined range, and each of the six skip-with-warning specifier prefixes
    - File: `packages/core/src/parsers/package_json_parser.acceptance.test.ts`
    - _Requirements: 2.9_

- [x] 5. Concurrency limiter
  - [x] 5.1 Implement `packages/core/src/sources/concurrency.ts` exporting `makeLimitedFetch(fetch: FetchFn, limit?: number): FetchFn`
    - Default limit is 6; queues requests beyond the limit and drains the queue in FIFO order as slots free
    - Implementation matches the design's queue-based pattern exactly
    - _Requirements: 7.2_

  - [x]* 5.2 Write unit test for `makeLimitedFetch`
    - Assert that at no point during a burst of 20 simultaneous requests are more than 6 fetches in-flight concurrently (use mock timer + in-flight counter)
    - File: `packages/core/src/sources/concurrency.test.ts`
    - _Requirements: 7.2_

- [x] 6. Fixture-mode adapter
  - [ ] 6.1 Implement `packages/core/src/sources/fixture-fetch.ts` exporting `makeFixtureFetch(): FetchFn`
    - Map URLs to fixture paths per the design's `urlToFixturePath` rules: PyPI single → `fixtures/pypi/<name>.json`; PyPI versioned → `fixtures/pypi/<name>-<ver>.json`; npm latest → `fixtures/npm/<name>-latest.json`; npm full → `fixtures/npm/<name>-full.json`; OSV batch → `fixtures/osv/<sha256>.json`; OSV detail → `fixtures/osv/<id>.json`
    - Throw an error named `FixtureNotFoundError` that includes the requested URL for any URL with no corresponding fixture file (Req 9.4)
    - _Requirements: 7.7, 9.4_

  - [ ]* 6.2 Write unit tests for `makeFixtureFetch`
    - Assert correct path mapping for one URL of each of the six URL patterns
    - Assert that an unknown URL throws `FixtureNotFoundError` with the URL in the message
    - File: `packages/core/src/sources/fixture-fetch.test.ts`
    - _Requirements: 7.7, 9.4_

- [ ] 7. PyPI client
  - [ ] 7.1 Implement `packages/core/src/sources/pypi.ts` exporting `fetchPypiData(name: string, pinnedVersion: string | undefined, deps: CoreDeps): Promise<RegistryData | null>`
    - For pinned packages: `GET https://pypi.org/pypi/<name>/<version>/json` and `GET https://pypi.org/pypi/<name>/json`
    - For unpinned packages: `GET https://pypi.org/pypi/<name>/json` only
    - Extract: latest version, upload date of latest release (earliest file upload time), `pinnedYanked`, `yankReason`, `isInactive` (classifier `Development Status :: 7 - Inactive`), `repositoryUrl`, `vulnerabilities`
    - On HTTP 404: return `null` with an evidence item recording the 404 and URL
    - On network error or timeout: return `null` with an evidence item describing the failure; do not propagate the error
    - _Requirements: 3.1–3.5_

  - [ ]* 7.2 Write fixture-based acceptance tests for the PyPI client
    - Test 10 fixture packages covering yanked, Inactive-classifier, healthy, and 404 cases
    - Assert extracted field values match fixture data for each case
    - File: `packages/core/src/sources/pypi_client.fixture.test.ts`
    - _Requirements: 3.6_

- [ ] 8. npm client
  - [ ] 8.1 Implement `packages/core/src/sources/npm.ts` exporting `fetchNpmData(name: string, pinnedVersion: string | undefined, deps: CoreDeps): Promise<RegistryData | null>`
    - Always fetch `GET https://registry.npmjs.org/<name>/latest` first
    - Fetch `GET https://registry.npmjs.org/<name>` lazily only when the package is neither deprecated nor 404, to obtain the `time` map for age-based scoring
    - Extract: latest version, publish date of latest version, `deprecated` message for latest, `deprecatedPinned` message for pinned version, `repositoryUrl`
    - On HTTP 404: return `null` with an evidence item; on network error or timeout: return `null` with an evidence item; do not propagate
    - _Requirements: 4.1–4.5_

  - [ ]* 8.2 Write fixture-based acceptance tests for the npm client
    - Test 10 fixture packages covering deprecated, healthy, and 404 cases
    - Assert extracted field values match fixture data for each case
    - File: `packages/core/src/sources/npm_client.fixture.test.ts`
    - _Requirements: 4.6_

- [ ] 9. OSV.dev client
  - [ ] 9.1 Implement `packages/core/src/sources/osv.ts` exporting `fetchOsvData(entries: Entry[], deps: CoreDeps): Promise<Map<string, string[]>>`
    - Send a single `POST https://api.osv.dev/v1/querybatch` for all pinned packages; use ecosystem `PyPI` for PyPI entries and `npm` for npm entries
    - Skip unpinned packages and record an evidence item stating no pinned version was available
    - Map each batch response element to its package and collect advisory IDs
    - Export `fetchOsvVulnDetail(id: string, deps: CoreDeps): Promise<unknown>` for lazy detail fetch via `GET https://api.osv.dev/v1/vulns/<id>`
    - On batch request failure: record `unknown` advisory status for all queried packages and emit an evidence item; do not propagate
    - _Requirements: 5.1–5.5_

  - [ ]* 9.2 Write unit tests for the OSV client using fixture responses
    - Assert that one batch request is issued for all pinned packages
    - Assert that unpinned packages are skipped and produce the correct evidence item
    - Assert that batch failure produces unknown advisory status without throwing
    - File: `packages/core/src/sources/osv.test.ts`
    - _Requirements: 5.1–5.5_

- [ ] 10. Scorer and epitaphs
  - [ ] 10.1 Implement `packages/core/src/scoring/epitaph.ts` exporting `renderEpitaph(pkg: ScoredPackage): string`
    - Apply the seven epitaph templates from the design's template table (alive, adrift, wreck-deprecated, wreck-yanked, wreck-inactive, wreck-presumed, unknown)
    - Append `" Survived by {successor}."` when a successor is present
    - Never use the word "dead" unless an explicit registry signal is present
    - _Requirements: 6.9_

  - [ ] 10.2 Implement the scoring logic in `packages/core/src/scoring/scorer.ts` exporting `scorePackage(entry: Entry, registry: RegistryData | null, advisoryIds: string[], clock: Clock, successors: Map<string, Successor>): ScoredPackage`
    - Apply the priority-ordered state decision table from the design: no-response → `unknown`; explicit signal → `wreck`; age ≤ 24 mo → `alive`; age 24–48 mo → `adrift`; age > 48 mo → `wreck` (presumed)
    - Compute `contaminated` and `ringCount` from advisory count (0 → false/0; 1–2 → true/1; 3–5 → true/2; 6+ → true/3)
    - Attach `evidence[]` with `fact`, `source_url`, and `observed_at` (ISO 8601) for every material fact
    - Attach `successor` from the successors map when present
    - Call `renderEpitaph` to populate the `epitaph` field
    - Use `config.ADRIFT_MONTHS` and `config.WRECK_MONTHS` throughout; never hardcode 24 or 48
    - _Requirements: 6.1–6.10_

  - [ ] 10.3 Implement `packages/core/src/successors/lookup.ts` exporting `loadSuccessors(): Map<string, Successor>` that reads `data/successors.json` and returns a name-keyed map
    - _Requirements: 6.10_

  - [ ]* 10.4 Write unit tests for `scorer.ts` and `epitaph.ts`
    - `scorer.test.ts`: boundary values at exactly 24 months and 48 months; ring-count thresholds at 1, 2, 3, and 6 advisories; `contaminated = false` when no pinned version; each of the five state paths
    - `epitaph.test.ts`: one assertion per template row in the design's epitaph table (seven combinations); assert "dead" never appears without an explicit registry signal; assert successor appended correctly
    - _Requirements: 6.1–6.9_

  - [ ]* 10.5 Write property test `prop_scoring_monotonic_age`
    - **Property 4: Scoring monotonic in age**
    - Generate two `RegistryData` records identical except `latestPublishedAt`; use an arbitrary clock; assert the package with the older date never receives a strictly healthier state
    - State ordering for comparison: `alive` > `adrift` > `wreck` > `unknown`
    - Tag comment: `// Feature: core-analysis, Property 4: Scoring monotonic in age`
    - File: `packages/core/src/scoring/scorer.test.ts`
    - **Validates: Requirements 6.11**

  - [ ]* 10.6 Write property test `prop_scoring_monotonic_advisories`
    - **Property 5: Scoring monotonic in advisory count**
    - Generate two advisory-count integers `a > b ≥ 0`; assert `ringCount(a) ≥ ringCount(b)`
    - Tag comment: `// Feature: core-analysis, Property 5: Scoring monotonic in advisory count`
    - File: `packages/core/src/scoring/scorer.test.ts`
    - **Validates: Requirements 6.12**

- [ ] 11. Audit function, report renderer, and JSON schema
  - [ ] 11.1 Complete `packages/core/src/audit.ts` implementing `audit(manifestText: string, kind: 'requirements.txt' | 'package.json', deps: CoreDeps): Promise<AuditResult>`
    - Dispatch to the correct parser based on `kind`
    - Wrap the injected `FetchFn` with `makeLimitedFetch` before passing to clients
    - Fetch PyPI or npm data and OSV data concurrently per package; collect `RegistryData` and advisory IDs
    - Score each package via `scorePackage`
    - Enforce the 150-package cap: slice to the first 150 and push `"Omitted N packages (limit 150)"` onto `warnings`
    - Collect all `ParseWarning` messages and any client-emitted warnings into `result.warnings`
    - Return an `AuditResult` with correct `summary` counts
    - On empty manifest: return `{ summary: {alive:0,adrift:0,wreck:0,unknown:0,contaminated:0}, packages: [], warnings: [] }`
    - _Requirements: 7.1–7.8, 8.1–8.2, 8.6_

  - [ ] 11.2 Implement `packages/core/src/report/markdown.ts` exporting `renderMarkdown(result: AuditResult): string`
    - Produce a summary table with state counts, then a per-package table with columns: Package, State, Last Release, Advisories, Epitaph
    - Append evidence footnotes below the table as `- \`<name>\`: [source](url) · observed <timestamp>`
    - Use only standard Markdown pipe-table syntax; zero HTML tags
    - _Requirements: 8.3–8.4_

  - [ ] 11.3 Write the JSON schema for `AuditResult` in `packages/core/src/audit-schema.json` matching the design's schema definition exactly; wire schema validation into `audit.ts` using a lightweight validator (e.g. `ajv` or a hand-rolled check) so every returned result is validated at runtime
    - _Requirements: 8.5_

  - [ ] 11.4 Create `packages/core/src/index.ts` re-exporting `audit`, `AuditResult`, `config`, and `renderMarkdown`
    - _Requirements: 8.1_

  - [ ]* 11.5 Write unit tests for `report/markdown.ts`
    - Assert summary table contains correct state emoji and counts
    - Assert per-package table rows contain name, state label, last-release date, advisory count, and epitaph
    - Assert evidence footnotes appear below the tables and contain source links
    - Assert output contains no HTML tags
    - File: `packages/core/src/report/markdown.test.ts`
    - _Requirements: 8.3–8.4_

  - [ ]* 11.6 Write schema-conformance test for the audit function
    - Run `audit()` against each sample manifest in fixture mode; assert every result passes JSON schema validation
    - File: `packages/core/src/audit.fixture.test.ts` (partial — schema check portion)
    - _Requirements: 8.5_

- [ ] 12. Checkpoint — Ensure all unit and property tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 13. Fixture capture script and full audit acceptance test
  - [ ] 13.1 Implement `scripts/capture-fixtures.ts` issuing real network requests to PyPI, npm, and OSV.dev
    - Capture PyPI data for: `nose`, `pycrypto`, and at least 13 additional packages spanning healthy, adrift, and wreck states
    - Capture npm data for: `request`, `left-pad`, `node-uuid`, `tslint`, and at least 11 additional packages
    - Write raw responses to `fixtures/pypi/`, `fixtures/npm/`, and `fixtures/osv/` using the fixture-fetch path conventions
    - Embed the capture date as a `capturedAt` field in each fixture file's JSON envelope so age-based tests can use it as the reference clock (Req 9.5)
    - _Requirements: 9.1–9.3, 9.5_

  - [ ] 13.2 Create a sample `requirements.txt` manifest in `fixtures/` containing approximately 15 packages drawn from the captured PyPI fixtures
    - _Requirements: 9.3_

  - [ ] 13.3 Create a sample `package.json` manifest in `fixtures/` containing approximately 15 packages drawn from the captured npm fixtures
    - _Requirements: 9.3_

  - [ ]* 13.4 Write full-round fixture-based audit acceptance test
    - Run `audit()` in fixture mode against both sample manifests using `capturedAt` from the fixture envelope as the reference clock
    - Assert the returned `AuditResult` for each manifest conforms to the JSON schema
    - Assert known states for key packages (e.g. `nose` → `wreck`, `pycrypto` → `wreck` with `contaminated: true`, `request` → `wreck`, `left-pad` → `wreck`)
    - Assert no live network request is issued; any attempt throws `FixtureNotFoundError` with the URL
    - File: `packages/core/src/audit.fixture.test.ts`
    - _Requirements: 9.4, 9.5, 8.5_

- [ ] 14. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Property tests run with fast-check's default of ≥ 100 iterations; each is tagged with the Feature and Property number from the design's "Correctness Properties" section for traceability
- The 24-month and 48-month thresholds live exclusively in `config.ts`; scorers and clients reference `config.ADRIFT_MONTHS` and `config.WRECK_MONTHS` only
- All source files carry the SPDX header `// SPDX-License-Identifier: AGPL-3.0-only`
- Tests never issue live network requests; any fixture miss throws `FixtureNotFoundError` naming the URL
- The concurrency limiter is applied in `audit.ts`, not inside individual clients, keeping clients pure
- `successors/lookup.ts` reads `data/successors.json`; the `data/` directory and its contents are created separately outside this spec

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2.1", "2.2", "2.3"] },
    { "id": 2, "tasks": ["3.1"] },
    { "id": 3, "tasks": ["3.2", "3.3", "3.4", "4.1"] },
    { "id": 4, "tasks": ["4.2", "4.3", "4.4", "5.1"] },
    { "id": 5, "tasks": ["5.2", "6.1"] },
    { "id": 6, "tasks": ["6.2", "7.1"] },
    { "id": 7, "tasks": ["7.2", "8.1"] },
    { "id": 8, "tasks": ["8.2", "9.1"] },
    { "id": 9, "tasks": ["9.2", "10.1", "10.2", "10.3"] },
    { "id": 10, "tasks": ["10.4", "10.5", "10.6"] },
    { "id": 11, "tasks": ["11.1", "11.2", "11.3", "11.4"] },
    { "id": 12, "tasks": ["11.5", "11.6"] },
    { "id": 13, "tasks": ["12"] },
    { "id": 14, "tasks": ["13.1"] },
    { "id": 15, "tasks": ["13.2", "13.3"] },
    { "id": 16, "tasks": ["13.4"] },
    { "id": 17, "tasks": ["14"] }
  ]
}
```
