// SPDX-License-Identifier: AGPL-3.0-only

import type { Entry, ParseResult, ParseWarning } from './types';

/**
 * Specifier prefixes that cause an entry to be skipped with a warning.
 * Order matters: longer/more-specific prefixes should come first.
 */
const SKIP_PREFIXES: ReadonlyArray<{ prefix: string; reason: string }> = [
  { prefix: 'npm:', reason: 'npm alias reference' },
  { prefix: 'github:', reason: 'GitHub reference' },
  { prefix: 'http://', reason: 'HTTP URL reference' },
  { prefix: 'https://', reason: 'HTTPS URL reference' },
  { prefix: 'file:', reason: 'local file reference' },
  { prefix: 'link:', reason: 'local link reference' },
  { prefix: 'workspace:', reason: 'workspace protocol reference' },
  // 'git' must come after 'github:' to avoid shadowing it
  { prefix: 'git', reason: 'git reference' },
];

/**
 * Semver range operators that make a specifier a range rather than a pin.
 * A specifier containing any of these is stored as `range`.
 */
const RANGE_OPERATORS_RE = /[\^~]|>=|<=|>(?!=)|<(?!=)|\|\||\s+-\s+/;

/**
 * Exact semver pattern: X.Y.Z with optional pre-release and/or build metadata.
 * No leading range operator. The full string must match.
 */
const EXACT_SEMVER_RE =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

/**
 * Parse a version specifier and return pinned/range/skip info.
 */
function classifySpecifier(
  specifier: string,
): { kind: 'skip'; reason: string } | { kind: 'pinned'; version: string } | { kind: 'range' } {
  for (const { prefix, reason } of SKIP_PREFIXES) {
    if (specifier.startsWith(prefix)) {
      return { kind: 'skip', reason };
    }
  }

  if (EXACT_SEMVER_RE.test(specifier)) {
    return { kind: 'pinned', version: specifier };
  }

  return { kind: 'range' };
}

/**
 * Process a dependencies object (either `dependencies` or `devDependencies`)
 * and push entries/warnings into the provided arrays.
 */
function processDepsObject(
  deps: Record<string, unknown>,
  dev: boolean,
  entries: Entry[],
  warnings: ParseWarning[],
): void {
  for (const [name, raw] of Object.entries(deps)) {
    const specifier = typeof raw === 'string' ? raw : String(raw);
    const classified = classifySpecifier(specifier);

    if (classified.kind === 'skip') {
      warnings.push({
        lineNumber: 0,
        line: `${name}: "${specifier}"`,
        reason: `${classified.reason} — entry skipped`,
      });
      continue;
    }

    const entry: Entry = {
      name: name.toLowerCase(),
      ecosystem: 'npm',
      dev,
    };

    if (classified.kind === 'pinned') {
      entry.pinnedVersion = classified.version;
    } else {
      entry.range = specifier;
    }

    entries.push(entry);
  }
}

/**
 * Parse `package.json` text into entries and warnings. Never throws.
 */
export function parsePackageJson(text: string): ParseResult {
  const entries: Entry[] = [];
  const warnings: ParseWarning[] = [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    warnings.push({
      lineNumber: 0,
      line: '',
      reason: `invalid JSON — ${message}`,
    });
    return { entries, warnings };
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    warnings.push({
      lineNumber: 0,
      line: '',
      reason: 'invalid JSON — root value is not an object',
    });
    return { entries, warnings };
  }

  const doc = parsed as Record<string, unknown>;

  if (doc['dependencies'] !== null && typeof doc['dependencies'] === 'object' && !Array.isArray(doc['dependencies'])) {
    processDepsObject(doc['dependencies'] as Record<string, unknown>, false, entries, warnings);
  }

  if (doc['devDependencies'] !== null && typeof doc['devDependencies'] === 'object' && !Array.isArray(doc['devDependencies'])) {
    processDepsObject(doc['devDependencies'] as Record<string, unknown>, true, entries, warnings);
  }

  return { entries, warnings };
}
