// SPDX-License-Identifier: AGPL-3.0-only

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { normalizePep503, parseRequirements } from './requirements';
import type { Entry } from './types';

// Feature: core-analysis, Property 1: Parser never throws
// Validates: Requirements 1.9
describe('prop_parser_no_throw', () => {
  it('never throws for arbitrary string input', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const result = parseRequirements(input);
        expect(result).toHaveProperty('entries');
        expect(result).toHaveProperty('warnings');
        expect(Array.isArray(result.entries)).toBe(true);
        expect(Array.isArray(result.warnings)).toBe(true);
      }),
      { numRuns: 1000 },
    );
  });
});

interface GenEntry {
  name: string;
  kind: 'pinned' | 'range' | 'none';
  version: string;
  range: string;
  extras: string[] | null;
  marker: string | null;
}

const genEntry: fc.Arbitrary<GenEntry> = fc.record({
  name: fc.stringMatching(/^[A-Za-z][A-Za-z0-9_.-]{0,12}$/),
  kind: fc.constantFrom('pinned', 'range', 'none') as fc.Arbitrary<GenEntry['kind']>,
  version: fc.stringMatching(/^[0-9]+\.[0-9]+\.[0-9]+$/),
  range: fc.constantFrom('>=1.0', '~=2.28', '!=2.0', '<2.0', '>1.0', '<=1.5'),
  extras: fc.option(fc.array(fc.stringMatching(/^[a-z0-9]{1,8}$/), { maxLength: 3 }), {
    nil: undefined,
  }),
  marker: fc.option(
    fc.constantFrom(
      'python_version >= "3.6"',
      'sys_platform == "win32"',
      'extra == "security"',
      'python_version < "3.12"',
    ),
    { nil: undefined },
  ),
});

function serialise(entries: GenEntry[]): string {
  return entries
    .map((e) => {
      const name = normalizePep503(e.name);
      const extras = e.extras && e.extras.length > 0 ? `[${e.extras.join(',')}]` : '';
      const spec = e.kind === 'pinned' ? `==${e.version}` : e.kind === 'range' ? e.range : '';
      const marker = e.marker ? ` ; ${e.marker}` : '';
      return `${name}${extras}${spec}${marker}`;
    })
    .join('\n');
}

function expected(e: GenEntry): Entry {
  const entry: Entry = { name: normalizePep503(e.name), ecosystem: 'pypi' };
  if (e.kind === 'pinned') entry.pinnedVersion = e.version;
  if (e.kind === 'range') entry.range = e.range;
  if (e.extras && e.extras.length > 0) entry.extras = e.extras;
  if (e.marker) entry.marker = e.marker;
  return entry;
}

function equivalent(a: Entry, b: Entry): boolean {
  return (
    a.name === b.name &&
    a.ecosystem === b.ecosystem &&
    a.pinnedVersion === b.pinnedVersion &&
    a.range === b.range &&
    (a.extras ?? []).join(',') === (b.extras ?? []).join(',') &&
    a.marker === b.marker
  );
}

// Feature: core-analysis, Property 2: requirements.txt round-trip
// Validates: Requirements 1.10
describe('prop_round_trip_requirements', () => {
  it('serialise → parse round-trips entries', () => {
    fc.assert(
      fc.property(fc.array(genEntry, { maxLength: 20 }), (genEntries) => {
        const text = serialise(genEntries);
        const { entries, warnings } = parseRequirements(text);
        expect(warnings).toEqual([]);
        expect(entries).toHaveLength(genEntries.length);
        for (let k = 0; k < genEntries.length; k++) {
          expect(equivalent(entries[k], expected(genEntries[k]))).toBe(true);
        }
      }),
      { numRuns: 300 },
    );
  });
});
