// SPDX-License-Identifier: AGPL-3.0-only

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parsePackageJson } from './package-json';
import type { Entry } from './types';

// Feature: core-analysis, Property 3: package.json round-trip
// Validates: Requirements 2.8
describe('prop_round_trip_package_json', () => {
  it('serialise → parse round-trips entries', () => {
    /**
     * A generated npm entry with enough detail to serialise into package.json
     * and check after parsing.
     */
    interface GenEntry {
      name: string;
      dev: boolean;
      versionKind: 'pinned' | 'range';
      pinned: string;
      range: string;
    }

    const genEntry: fc.Arbitrary<GenEntry> = fc.record({
      name: fc.stringMatching(/^[a-z][a-z0-9-]{0,12}$/),
      dev: fc.boolean(),
      versionKind: fc.constantFrom('pinned', 'range') as fc.Arbitrary<
        GenEntry['versionKind']
      >,
      pinned: fc.stringMatching(/^[0-9]{1,2}\.[0-9]{1,2}\.[0-9]{1,2}$/),
      range: fc.constantFrom(
        '^1.0.0',
        '^2.3.4',
        '~1.2.0',
        '~0.5.1',
        '>=1.0.0',
        '>=2.0.0',
        '<=3.0.0',
        '<=1.5.0',
        '>1.0.0',
        '<2.0.0',
      ),
    });

    function serialise(entries: GenEntry[]): string {
      const deps: Record<string, string> = {};
      const devDeps: Record<string, string> = {};

      for (const e of entries) {
        const specifier = e.versionKind === 'pinned' ? e.pinned : e.range;
        if (e.dev) {
          devDeps[e.name] = specifier;
        } else {
          deps[e.name] = specifier;
        }
      }

      const doc: Record<string, unknown> = {};
      if (Object.keys(deps).length > 0) doc['dependencies'] = deps;
      if (Object.keys(devDeps).length > 0) doc['devDependencies'] = devDeps;
      return JSON.stringify(doc);
    }

    function expected(e: GenEntry): Entry {
      const entry: Entry = {
        name: e.name,
        ecosystem: 'npm',
        dev: e.dev,
      };
      if (e.versionKind === 'pinned') {
        entry.pinnedVersion = e.pinned;
      } else {
        entry.range = e.range;
      }
      return entry;
    }

    fc.assert(
      fc.property(
        // Use uniqueArray to avoid duplicate names that would cause the last
        // entry to silently win in the serialised JSON object.
        fc.uniqueArray(genEntry, {
          maxLength: 20,
          selector: (e) => e.name,
        }),
        (genEntries) => {
          const text = serialise(genEntries);
          const { entries, warnings } = parsePackageJson(text);

          expect(warnings).toEqual([]);
          expect(entries).toHaveLength(genEntries.length);

          // Build a lookup by name for order-independent comparison.
          const byName = new Map<string, Entry>(entries.map((e) => [e.name, e]));

          for (const gen of genEntries) {
            const exp = expected(gen);
            const got = byName.get(exp.name);
            expect(got).toBeDefined();
            expect(got!.name).toBe(exp.name);
            expect(got!.dev).toBe(exp.dev);
            expect(got!.pinnedVersion).toBe(exp.pinnedVersion);
            expect(got!.range).toBe(exp.range);
          }
        },
      ),
      { numRuns: 300 },
    );
  });
});

// Feature: core-analysis, Property 1: Parser never throws
// Validates: Requirements 2.7
describe('prop_parser_no_throw', () => {
  it('never throws for arbitrary string input', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const result = parsePackageJson(input);
        expect(result).toHaveProperty('entries');
        expect(result).toHaveProperty('warnings');
        expect(Array.isArray(result.entries)).toBe(true);
        expect(Array.isArray(result.warnings)).toBe(true);
      }),
      { numRuns: 1000 },
    );
  });

  it('never throws for arbitrary JSON-like strings', () => {
    fc.assert(
      fc.property(fc.json(), (input) => {
        const result = parsePackageJson(input);
        expect(result).toHaveProperty('entries');
        expect(result).toHaveProperty('warnings');
        expect(Array.isArray(result.entries)).toBe(true);
        expect(Array.isArray(result.warnings)).toBe(true);
      }),
      { numRuns: 1000 },
    );
  });
});
