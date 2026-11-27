// SPDX-License-Identifier: AGPL-3.0-only

import type { Entry, ParseResult, ParseWarning } from './types';

/**
 * PEP 503 name normalisation: lowercase, runs of `-`, `_`, `.` → single `-`.
 */
export function normalizePep503(name: string): string {
  return name.toLowerCase().replace(/[-_.]+/g, '-');
}

const NAME_EXTRAS_RE = /^([A-Za-z0-9][A-Za-z0-9._-]*)\s*(\[[^\]]*\])?/;
const OPERATOR_RE = /^(===|==|~=|!=|<=|>=|<|>)/;

const SKIP_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  { re: /^--index-url\b/, reason: 'unsupported option: --index-url' },
  { re: /^--[A-Za-z]/, reason: 'unsupported global option' },
  { re: /^-(r|c|e)\s/, reason: 'unsupported option' },
  { re: /^-(r|c|e)$/, reason: 'unsupported option' },
  { re: /^https?:\/\//, reason: 'direct URL reference' },
  { re: /^(git|svn|hg|bzr)\+/, reason: 'VCS reference' },
];

/** Strip a trailing inline comment: `#` at line start or preceded by whitespace. */
function stripComment(line: string): string {
  const m = line.match(/(^|\s)#/);
  if (m && m.index !== undefined) {
    return line.slice(0, m.index);
  }
  return line;
}

interface ParsedSpec {
  pinnedVersion?: string;
  range?: string;
}

function parseSpecifier(spec: string): ParsedSpec | null {
  const clauses = spec.split(',').map((c) => c.trim()).filter((c) => c.length > 0);
  if (clauses.length === 0) return {};
  // every clause must start with a valid operator
  for (const clause of clauses) {
    if (!OPERATOR_RE.test(clause)) return null;
  }
  const pin = clauses[0].match(/^==\s*([^*\s]+)$/);
  if (clauses.length === 1 && pin) {
    return { pinnedVersion: pin[1] };
  }
  return { range: spec.trim() };
}

/**
 * Parse `requirements.txt` text into entries and warnings. Never throws.
 */
export function parseRequirements(text: string): ParseResult {
  const entries: Entry[] = [];
  const warnings: ParseWarning[] = [];

  const physical = text.split(/\r?\n/);

  let i = 0;
  while (i < physical.length) {
    const startLine = i + 1;
    let logical = physical[i];
    // join backslash-continued physical lines into one logical line
    while (/\\\s*$/.test(logical) && i + 1 < physical.length) {
      logical = logical.replace(/\\\s*$/, '');
      i += 1;
      logical += physical[i];
    }
    i += 1;

    const withoutComment = stripComment(logical).trim();
    if (withoutComment.length === 0) continue;

    for (const p of SKIP_PATTERNS) {
      if (p.re.test(withoutComment)) {
        warnings.push({
          lineNumber: startLine,
          line: withoutComment,
          reason: `${p.reason} — line skipped`,
        });
        break;
      }
    }
    if (SKIP_PATTERNS.some((p) => p.re.test(withoutComment))) continue;

    // direct reference: `name @ https://...`
    if (/@\s*https?:\/\//.test(withoutComment)) {
      warnings.push({
        lineNumber: startLine,
        line: withoutComment,
        reason: 'direct URL reference — line skipped',
      });
      continue;
    }

    // split off environment marker at first `;`
    let specPart = withoutComment;
    let marker: string | undefined;
    const semi = withoutComment.indexOf(';');
    if (semi !== -1) {
      specPart = withoutComment.slice(0, semi);
      marker = withoutComment.slice(semi + 1).trim() || undefined;
    }

    const m = specPart.match(NAME_EXTRAS_RE);
    if (!m || m.index === undefined || m.index !== 0) {
      warnings.push({
        lineNumber: startLine,
        line: withoutComment,
        reason: 'unrecognised line — skipped',
      });
      continue;
    }

    const rawName = m[1];
    const rest = specPart.slice(m[0].length).trim();

    if (rest.length > 0 && !OPERATOR_RE.test(rest)) {
      warnings.push({
        lineNumber: startLine,
        line: withoutComment,
        reason: 'unrecognised line — skipped',
      });
      continue;
    }

    const extras = (m[2] ?? '')
      .slice(1, -1)
      .split(',')
      .map((e) => e.trim())
      .filter((e) => e.length > 0);

    const spec = parseSpecifier(rest);
    if (spec === null) {
      warnings.push({
        lineNumber: startLine,
        line: withoutComment,
        reason: 'invalid version specifier — skipped',
      });
      continue;
    }

    const entry: Entry = {
      name: normalizePep503(rawName),
      ecosystem: 'pypi',
    };
    if (spec.pinnedVersion !== undefined) entry.pinnedVersion = spec.pinnedVersion;
    if (spec.range !== undefined) entry.range = spec.range;
    if (extras.length > 0) entry.extras = extras;
    if (marker !== undefined) entry.marker = marker;

    entries.push(entry);
  }

  return { entries, warnings };
}
