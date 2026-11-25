# Requirements Document

## Introduction

The `core-analysis` feature is the pure engine that powers Necropolis. It runs unchanged in the browser and in Node.js, shared by the web page, the MCP server, and the gate CLI. It parses `requirements.txt` and `package.json` manifests, queries PyPI, npm, and OSV.dev, scores each dependency by state and contamination, and returns a structured audit result with evidence-backed verdicts and a Markdown report renderer.

## Glossary

- **Core**: The `packages/core` TypeScript module — no Node-only or DOM-only APIs; `fetch`, clock, and cache are injected.
- **Manifest**: A `requirements.txt` or `package.json` file containing direct dependencies.
- **Entry**: A single parsed dependency — name, optional pinned version, optional version range, and metadata flags.
- **PEP 503**: The PyPI package-name normalisation spec (lowercase, runs of `[-_.]` collapsed to `-`).
- **Pinned version**: An exact version specifier (`==` for PyPI, exact semver for npm) that enables per-version lookups and vulnerability queries.
- **State**: One of `alive`, `adrift`, `wreck`, or `unknown` — the health classification of a dependency.
- **Contaminated**: A flag set when OSV.dev reports one or more advisories for the pinned version of a package.
- **Ring count**: The number of contamination rings displayed: 1 for 1–2 advisories, 2 for 3–5, 3 for 6+.
- **Epitaph**: A short, deterministic-template string summarising a package's fate.
- **Evidence item**: A `{fact, source_url, observed_at}` triple recording a single observed fact about a package.
- **Successor**: An `{name, source_url}` pair suggesting a replacement package; always human-curated, never automatic.
- **Thresholds**: The two age cut-offs — 24 months (alive → adrift) and 48 months (adrift → wreck, presumed) — stored in one config object.
- **Fixture mode**: Operation with `NECROPOLIS_FIXTURES=1` set, causing all network calls to be served from recorded responses in `fixtures/`.
- **PyPI_Client**: The module responsible for fetching and parsing PyPI JSON API responses.
- **npm_Client**: The module responsible for fetching and parsing npm registry responses.
- **OSV_Client**: The module responsible for batching and fetching OSV.dev advisory data.
- **Requirements_Parser**: The module that parses `requirements.txt` text into a list of `Entry` objects.
- **Package_JSON_Parser**: The module that parses `package.json` text into a list of `Entry` objects.
- **Scorer**: The module that assigns a `State` and `contaminated` flag to each `Entry` given registry data.
- **Report_Renderer**: The module that serialises an audit result to Markdown.
- **Audit_Function**: The exported `audit(manifestText, kind)` function that orchestrates parsing, fetching, scoring, and reporting.
- **Cache**: The injected interface for 24-hour response caching (memory + `sessionStorage` in the browser; file cache at `~/.cache/necropolis/` in Node).

## Requirements

### Requirement 1: Parse `requirements.txt` Manifests

**User Story:** As a developer auditing a Python project, I want the Core to parse my `requirements.txt` so that every direct dependency is identified with its name and version constraints.

#### Acceptance Criteria

1. WHEN a `requirements.txt` line contains a package name with a `==` version specifier, THE Requirements_Parser SHALL produce an `Entry` with the normalised name, the pinned version, and no range.
2. WHEN a `requirements.txt` line contains a package name with a specifier other than `==` (e.g. `>=`, `~=`, `!=`), THE Requirements_Parser SHALL produce an `Entry` with the normalised name and the full specifier string stored as the range field.
3. WHEN a `requirements.txt` line contains extras in square brackets (e.g. `pkg[extra1,extra2]`), THE Requirements_Parser SHALL record the extras on the `Entry` and normalise only the package name per PEP 503.
4. WHEN a `requirements.txt` line contains an environment marker after a semicolon (e.g. `; python_version < "3.12"`), THE Requirements_Parser SHALL preserve the marker text on the `Entry` without altering the name or version fields.
5. WHEN a `requirements.txt` line ends with a backslash continuation character, THE Requirements_Parser SHALL join the continuation lines before parsing the resulting logical line.
6. WHEN a `requirements.txt` line is blank or contains only a comment beginning with `#`, THE Requirements_Parser SHALL skip the line and produce no `Entry`.
7. WHEN a `requirements.txt` line begins with `-r`, `-c`, `-e`, `--index-url`, a direct URL, or a VCS reference, THE Requirements_Parser SHALL skip the line and emit a warning that includes the line number and the skipped content.
8. THE Requirements_Parser SHALL normalise all package names per PEP 503 (lowercase; runs of `-`, `_`, and `.` collapsed to a single `-`).
9. WHEN given arbitrary text as input, THE Requirements_Parser SHALL return a result without throwing an exception, treating unrecognised lines as skipped-with-warning.
10. FOR ALL lists of valid `Entry` objects, serialising the list to `requirements.txt` format and then parsing the result SHALL produce a list of `Entry` objects equivalent to the original (round-trip property).
11. THE Requirements_Parser SHALL correctly parse the 20 acceptance-test cases defined in the test suite covering: plain name, `==` pin, `>=` range, `~=` range, extras, environment markers, inline comments, blank lines, continuation lines, and each of the six skip-with-warning prefixes.

---

### Requirement 2: Parse `package.json` Manifests

**User Story:** As a developer auditing a JavaScript project, I want the Core to parse my `package.json` so that every direct and dev dependency is identified with its name and version range.

#### Acceptance Criteria

1. WHEN a `package.json` document contains a `dependencies` object, THE Package_JSON_Parser SHALL produce an `Entry` for each key–value pair with the package name, the version specifier, and `dev` set to `false`.
2. WHEN a `package.json` document contains a `devDependencies` object, THE Package_JSON_Parser SHALL produce an `Entry` for each key–value pair with the package name, the version specifier, and `dev` set to `true`.
3. WHEN a version specifier is a valid exact semver string (no range operators), THE Package_JSON_Parser SHALL mark the `Entry` as pinned.
4. WHEN a version specifier contains semver range operators (`^`, `~`, `>=`, `<=`, `>`, `<`, `||`, `-`), THE Package_JSON_Parser SHALL store the full specifier string as the range field and leave the pinned field unset.
5. WHEN a version specifier begins with `npm:`, `git`, `github:`, `http://`, `https://`, `file:`, `link:`, or `workspace:`, THE Package_JSON_Parser SHALL skip the entry and emit a warning that includes the package name and the skipped specifier.
6. WHEN the input text is not valid JSON, THE Package_JSON_Parser SHALL return a single structured error and produce no entries, without throwing an exception.
7. WHEN given arbitrary text as input, THE Package_JSON_Parser SHALL return a result without throwing an exception.
8. FOR ALL lists of valid `Entry` objects derived from `package.json`, serialising the list back to `package.json` format and then parsing the result SHALL produce a list of `Entry` objects equivalent to the original (round-trip property).
9. THE Package_JSON_Parser SHALL correctly parse the 20 acceptance-test cases defined in the test suite covering: plain `dependencies`, plain `devDependencies`, exact semver pin, caret range, tilde range, combined range, and each of the six skip-with-warning specifier prefixes.

---

### Requirement 3: Fetch PyPI Package Data

**User Story:** As a developer, I want the Core to retrieve PyPI metadata for each Python dependency so that I can see whether a package is current, abandoned, or yanked.

#### Acceptance Criteria

1. WHEN a Python package has a pinned version, THE PyPI_Client SHALL request `GET https://pypi.org/pypi/<name>/<version>/json` and `GET https://pypi.org/pypi/<name>/json` to obtain both release-specific and latest metadata.
2. WHEN a Python package does not have a pinned version, THE PyPI_Client SHALL request only `GET https://pypi.org/pypi/<name>/json`.
3. WHEN the PyPI JSON response is received, THE PyPI_Client SHALL extract: the latest version string, the upload date of the latest release (taken as the earliest file upload time among all files in that release), whether the pinned release is yanked, the yanked reason when present, the presence of the classifier `Development Status :: 7 - Inactive`, the project URLs and repository URL when present, and the `vulnerabilities` array when present.
4. WHEN the PyPI API returns a 404 response for a package name, THE PyPI_Client SHALL record state `unknown` and emit an evidence item naming the 404 as the source.
5. WHEN the PyPI API request fails due to a network error or timeout, THE PyPI_Client SHALL record state `unknown` and emit an evidence item describing the failure, without affecting the lookup of any other package.
6. THE PyPI_Client SHALL return correct extracted values for the 10 packages defined in the recorded fixture suite, covering yanked, inactive-classifier, healthy, and not-found cases.

---

### Requirement 4: Fetch npm Package Data

**User Story:** As a developer, I want the Core to retrieve npm registry metadata for each JavaScript dependency so that I can see whether a package is current, deprecated, or abandoned.

#### Acceptance Criteria

1. WHEN an npm package is requested, THE npm_Client SHALL first request `GET https://registry.npmjs.org/<name>/latest` to obtain the latest-version metadata.
2. WHEN release dates are required (e.g. to score adrift/wreck state), THE npm_Client SHALL request `GET https://registry.npmjs.org/<name>` to obtain the full document containing the `time` map.
3. WHEN the npm registry response is received, THE npm_Client SHALL extract: the latest version string, the publish date of the latest version, the `deprecated` message for the latest version when present, the `deprecated` message for the pinned version when present, and the repository URL when present.
4. WHEN the npm registry returns a 404 response for a package name, THE npm_Client SHALL record state `unknown` and emit an evidence item naming the 404 as the source.
5. WHEN the npm registry request fails due to a network error or timeout, THE npm_Client SHALL record state `unknown` and emit an evidence item describing the failure, without affecting the lookup of any other package.
6. THE npm_Client SHALL return correct extracted values for the 10 packages defined in the recorded fixture suite, covering deprecated, healthy, and not-found cases.

---

### Requirement 5: Fetch OSV.dev Vulnerability Data

**User Story:** As a developer, I want the Core to look up known vulnerabilities for each pinned dependency so that I can flag contaminated packages.

#### Acceptance Criteria

1. WHEN a manifest contains one or more packages with pinned versions, THE OSV_Client SHALL send a single `POST https://api.osv.dev/v1/querybatch` request containing all pinned packages, using ecosystem `PyPI` for Python and `npm` for JavaScript packages.
2. WHEN the OSV batch response is received, THE OSV_Client SHALL map each response element to its corresponding package and record the advisory IDs found.
3. WHEN advisory details are needed (e.g. for the evidence list), THE OSV_Client SHALL request `GET https://api.osv.dev/v1/vulns/<id>` lazily, only on demand.
4. WHEN a package does not have a pinned version, THE OSV_Client SHALL skip the advisory lookup for that package and record an evidence item stating that no pinned version was available for vulnerability scanning.
5. WHEN the OSV.dev batch request fails due to a network error or timeout, THE OSV_Client SHALL record `unknown` advisory status for all affected packages and emit an evidence item describing the failure, without affecting the scoring of any other package.

---

### Requirement 6: Score Package States

**User Story:** As a developer, I want each dependency classified into a health state with supporting evidence so that I can quickly understand which packages need attention.

#### Acceptance Criteria

1. WHEN a package's most recent release date is within the 24-month threshold from the audit time, THE Scorer SHALL assign state `alive`, provided no explicit deprecation, yanked, or inactive signal is present.
2. WHEN a package's most recent release date is more than 24 months but no more than 48 months before the audit time, and no explicit deprecation, yanked, or inactive signal is present, THE Scorer SHALL assign state `adrift`.
3. WHEN a package carries an explicit registry signal (npm `deprecated`, PyPI `yanked`, or PyPI classifier `Development Status :: 7 - Inactive`), THE Scorer SHALL assign state `wreck` regardless of the last release date.
4. WHEN a package's most recent release date is more than 48 months before the audit time and no explicit registry signal is present, THE Scorer SHALL assign state `wreck` and label the package as "presumed lost" rather than "dead" in its evidence.
5. WHEN the registry did not respond or the package was not found, THE Scorer SHALL assign state `unknown`.
6. WHEN OSV.dev reports one or more advisories for a package's pinned version, THE Scorer SHALL set the `contaminated` flag on that package's result and assign a ring count of 1 for 1–2 advisories, 2 for 3–5 advisories, and 3 for 6 or more advisories.
7. THE Scorer SHALL store the 24-month and 48-month age thresholds in a single exported configuration object so they can be changed in one place.
8. THE Scorer SHALL attach to each result an `evidence[]` array where every item carries a `fact` string, a `source_url` string pointing to the registry page or API endpoint, and an `observed_at` ISO 8601 timestamp.
9. THE Scorer SHALL generate a deterministic epitaph string for each result using a template that references only the package name, the last-transmission date, and survivors from registry data — never the word "dead" unless an explicit registry signal is present.
10. WHERE a successor entry exists in `data/successors.json` for the package, THE Scorer SHALL attach the successor `{name, source_url}` to the result.
11. FOR ALL pairs of scored results where one package's most recent release is strictly older than another's (all other inputs equal), THE Scorer SHALL never assign the older package a healthier state than the newer package (monotonic-in-age property).
12. FOR ALL pairs of scored results where one package has strictly more OSV advisories than another (all other inputs equal), THE Scorer SHALL never assign the package with more advisories a lower ring count than the package with fewer advisories (monotonic-in-advisories property).

---

### Requirement 7: Resilience, Concurrency, and Caching

**User Story:** As a developer, I want the audit to complete reliably even when some registries are slow or unavailable, and to avoid redundant network requests, so that the tool is fast and robust in real-world conditions.

#### Acceptance Criteria

1. WHEN a registry request for one package fails or times out, THE Core SHALL continue processing all other packages, recording state `unknown` only for the affected package.
2. THE Core SHALL issue at most 6 concurrent outbound requests at any point during an audit.
3. WHEN a registry request does not complete within the per-request timeout, THE Core SHALL cancel the request and record the timeout as an evidence item for the affected package.
4. THE Core SHALL accept injected implementations of `fetch`, clock, and cache interfaces, and SHALL use only those interfaces for network calls, time retrieval, and response caching — no direct use of `globalThis.fetch`, `Date.now`, or storage APIs.
5. WHEN the injected cache contains a valid (non-expired) entry for a registry URL, THE Core SHALL return the cached response without issuing a network request.
6. WHEN the injected cache does not contain a valid entry, THE Core SHALL store the registry response in the cache with a 24-hour TTL after a successful fetch.
7. WHEN `NECROPOLIS_FIXTURES` is set to `1` or fixture mode is otherwise activated, THE Core SHALL serve all registry responses from the recorded files in `fixtures/` and SHALL NOT issue any network request.
8. WHEN a manifest contains more than 150 packages, THE Core SHALL process only the first 150 packages and emit a warning listing the count of packages that were omitted.

---

### Requirement 8: Audit Function and Report Output

**User Story:** As a developer, I want a single function that accepts a manifest and returns a structured result with a Markdown renderer so that I can display the audit in the browser, paste it into an issue, or consume it programmatically.

#### Acceptance Criteria

1. THE Audit_Function SHALL accept a `manifestText` string and a `kind` value of either `"requirements.txt"` or `"package.json"` and return a result object.
2. THE Audit_Function SHALL return a result object containing: a `summary` with counts for each state (`alive`, `adrift`, `wreck`, `unknown`) and a `contaminated` count; a `packages` array of scored package results; and a `warnings` array of string messages emitted during parsing and fetching.
3. THE Report_Renderer SHALL accept the audit result object and return a Markdown string containing a summary table, a per-package table with columns for name, state, last release, and advisory count, and inline evidence links pointing to the source registry pages.
4. THE Report_Renderer SHALL produce Markdown that is valid for pasting into a GitHub issue, using standard Markdown table syntax with no HTML tags.
5. THE Core SHALL define a JSON schema for the audit result object, and every result returned by the Audit_Function SHALL conform to that schema.
6. WHEN the Audit_Function is called with an empty manifest string, THE Audit_Function SHALL return a result with empty `packages` and `warnings` arrays and a `summary` with all counts set to zero.

---

### Requirement 9: Fixture Capture and Test Isolation

**User Story:** As a developer, I want a fixture-capture script and a fixture-only test suite so that tests are deterministic and never depend on live network responses.

#### Acceptance Criteria

1. THE `scripts/capture-fixtures.ts` script SHALL issue real network requests to PyPI, npm, and OSV.dev and write the raw responses to files under `fixtures/`, recording the capture date in each fixture file's metadata.
2. THE fixture suite SHALL include responses for at least the following packages: `nose`, `pycrypto` (PyPI), and `request`, `left-pad`, `node-uuid`, `tslint` (npm), and at least nine additional packages across both ecosystems that represent healthy, adrift, and wreck states.
3. THE fixture suite SHALL include at least one sample `requirements.txt` manifest and one sample `package.json` manifest, each containing approximately 15 packages.
4. WHEN tests run, THE Core test suite SHALL use only fixture responses and SHALL NOT issue any network request; any test that would require a live request SHALL fail with a descriptive error naming the URL that was requested.
5. THE fixture files SHALL record the capture date so that age-based state calculations in tests use that date as the reference point, ensuring test results remain stable as calendar time passes.
