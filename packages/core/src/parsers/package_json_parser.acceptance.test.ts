// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from 'vitest';
import { parsePackageJson } from './package-json';

// Requirements: 2.9

describe('parsePackageJson — acceptance tests', () => {
  // 1. Plain dependency in `dependencies`
  it('case 1: plain dependencies entry', () => {
    const { entries, warnings } = parsePackageJson(
      JSON.stringify({ dependencies: { express: '4.18.2' } }),
    );
    expect(warnings).toEqual([]);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      name: 'express',
      ecosystem: 'npm',
      dev: false,
      pinnedVersion: '4.18.2',
    });
    expect(entries[0].range).toBeUndefined();
  });

  // 2. Plain dependency in `devDependencies`
  it('case 2: plain devDependencies entry', () => {
    const { entries, warnings } = parsePackageJson(
      JSON.stringify({ devDependencies: { vitest: '1.6.0' } }),
    );
    expect(warnings).toEqual([]);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      name: 'vitest',
      ecosystem: 'npm',
      dev: true,
      pinnedVersion: '1.6.0',
    });
    expect(entries[0].range).toBeUndefined();
  });

  // 3. Both dependencies and devDependencies present
  it('case 3: dependencies and devDependencies together', () => {
    const { entries, warnings } = parsePackageJson(
      JSON.stringify({
        dependencies: { lodash: '4.17.21' },
        devDependencies: { typescript: '5.4.5' },
      }),
    );
    expect(warnings).toEqual([]);
    expect(entries).toHaveLength(2);
    const prod = entries.find((e) => e.name === 'lodash');
    const dev = entries.find((e) => e.name === 'typescript');
    expect(prod).toMatchObject({ dev: false, pinnedVersion: '4.17.21' });
    expect(dev).toMatchObject({ dev: true, pinnedVersion: '5.4.5' });
  });

  // 4. Exact semver pin — marked as pinned, no range
  it('case 4: exact semver pin', () => {
    const { entries, warnings } = parsePackageJson(
      JSON.stringify({ dependencies: { react: '18.3.1' } }),
    );
    expect(warnings).toEqual([]);
    expect(entries).toHaveLength(1);
    expect(entries[0].pinnedVersion).toBe('18.3.1');
    expect(entries[0].range).toBeUndefined();
  });

  // 5. Exact semver with pre-release tag — still a pin
  it('case 5: exact semver with pre-release tag', () => {
    const { entries, warnings } = parsePackageJson(
      JSON.stringify({ dependencies: { alpha: '2.0.0-beta.1' } }),
    );
    expect(warnings).toEqual([]);
    expect(entries).toHaveLength(1);
    expect(entries[0].pinnedVersion).toBe('2.0.0-beta.1');
    expect(entries[0].range).toBeUndefined();
  });

  // 6. Caret range (`^1.0.0`) — stored as range, not pinned
  it('case 6: caret range', () => {
    const { entries, warnings } = parsePackageJson(
      JSON.stringify({ dependencies: { axios: '^1.6.8' } }),
    );
    expect(warnings).toEqual([]);
    expect(entries).toHaveLength(1);
    expect(entries[0].range).toBe('^1.6.8');
    expect(entries[0].pinnedVersion).toBeUndefined();
  });

  // 7. Tilde range (`~1.0.0`) — stored as range, not pinned
  it('case 7: tilde range', () => {
    const { entries, warnings } = parsePackageJson(
      JSON.stringify({ dependencies: { chalk: '~5.3.0' } }),
    );
    expect(warnings).toEqual([]);
    expect(entries).toHaveLength(1);
    expect(entries[0].range).toBe('~5.3.0');
    expect(entries[0].pinnedVersion).toBeUndefined();
  });

  // 8. Combined range (`>=1.0.0 <2.0.0`) — stored as range
  it('case 8: combined range (>= … <)', () => {
    const { entries, warnings } = parsePackageJson(
      JSON.stringify({ dependencies: { semver: '>=7.0.0 <8.0.0' } }),
    );
    expect(warnings).toEqual([]);
    expect(entries).toHaveLength(1);
    expect(entries[0].range).toBe('>=7.0.0 <8.0.0');
    expect(entries[0].pinnedVersion).toBeUndefined();
  });

  // 9. Skip-with-warning: `npm:` prefix
  it('case 9: npm: alias reference is skipped with warning', () => {
    const { entries, warnings } = parsePackageJson(
      JSON.stringify({ dependencies: { myalias: 'npm:lodash@^4.17.21' } }),
    );
    expect(entries).toHaveLength(0);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].line).toContain('myalias');
    expect(warnings[0].reason).toContain('npm alias reference');
  });

  // 10. Skip-with-warning: `git` prefix
  it('case 10: git reference is skipped with warning', () => {
    const { entries, warnings } = parsePackageJson(
      JSON.stringify({
        dependencies: { mypkg: 'git+https://github.com/owner/repo.git' },
      }),
    );
    expect(entries).toHaveLength(0);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].line).toContain('mypkg');
    expect(warnings[0].reason).toContain('git reference');
  });

  // 11. Skip-with-warning: `github:` prefix
  it('case 11: github: reference is skipped with warning', () => {
    const { entries, warnings } = parsePackageJson(
      JSON.stringify({ dependencies: { mypkg: 'github:owner/repo#main' } }),
    );
    expect(entries).toHaveLength(0);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].line).toContain('mypkg');
    expect(warnings[0].reason).toContain('GitHub reference');
  });

  // 12. Skip-with-warning: `http://` prefix
  it('case 12: http:// URL reference is skipped with warning', () => {
    const { entries, warnings } = parsePackageJson(
      JSON.stringify({
        dependencies: { mypkg: 'http://example.com/pkg.tgz' },
      }),
    );
    expect(entries).toHaveLength(0);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].line).toContain('mypkg');
    expect(warnings[0].reason).toContain('HTTP URL reference');
  });

  // 13. Skip-with-warning: `https://` prefix
  it('case 13: https:// URL reference is skipped with warning', () => {
    const { entries, warnings } = parsePackageJson(
      JSON.stringify({
        dependencies: { mypkg: 'https://example.com/pkg.tgz' },
      }),
    );
    expect(entries).toHaveLength(0);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].line).toContain('mypkg');
    expect(warnings[0].reason).toContain('HTTPS URL reference');
  });

  // 14. Skip-with-warning: `file:` prefix
  it('case 14: file: reference is skipped with warning', () => {
    const { entries, warnings } = parsePackageJson(
      JSON.stringify({ dependencies: { mypkg: 'file:../local-pkg' } }),
    );
    expect(entries).toHaveLength(0);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].line).toContain('mypkg');
    expect(warnings[0].reason).toContain('local file reference');
  });

  // 15. Skip-with-warning: `link:` prefix
  it('case 15: link: reference is skipped with warning', () => {
    const { entries, warnings } = parsePackageJson(
      JSON.stringify({ dependencies: { mypkg: 'link:../local-pkg' } }),
    );
    expect(entries).toHaveLength(0);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].line).toContain('mypkg');
    expect(warnings[0].reason).toContain('local link reference');
  });

  // 16. Skip-with-warning: `workspace:` prefix
  it('case 16: workspace: reference is skipped with warning', () => {
    const { entries, warnings } = parsePackageJson(
      JSON.stringify({ dependencies: { mypkg: 'workspace:^' } }),
    );
    expect(entries).toHaveLength(0);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].line).toContain('mypkg');
    expect(warnings[0].reason).toContain('workspace protocol reference');
  });

  // 17. Invalid JSON input — no entries, exactly one warning, no throw
  it('case 17: invalid JSON returns no entries and one warning', () => {
    const { entries, warnings } = parsePackageJson('this is not json {{{');
    expect(entries).toHaveLength(0);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].reason).toMatch(/invalid json/i);
  });

  // 18. Empty JSON object `{}` — no entries, no warnings
  it('case 18: empty object produces no entries and no warnings', () => {
    const { entries, warnings } = parsePackageJson('{}');
    expect(warnings).toEqual([]);
    expect(entries).toHaveLength(0);
  });

  // 19. Empty `dependencies: {}` — no entries, no warnings
  it('case 19: empty dependencies object produces no entries', () => {
    const { entries, warnings } = parsePackageJson(
      JSON.stringify({ dependencies: {} }),
    );
    expect(warnings).toEqual([]);
    expect(entries).toHaveLength(0);
  });

  // 20. Mixed: one valid dep, one skipped dep, one valid devDep
  it('case 20: mixed valid and skipped entries', () => {
    const { entries, warnings } = parsePackageJson(
      JSON.stringify({
        dependencies: {
          lodash: '4.17.21',
          local: 'file:../local',
        },
        devDependencies: {
          prettier: '^3.2.5',
        },
      }),
    );
    expect(entries).toHaveLength(2);
    expect(warnings).toHaveLength(1);

    const lodash = entries.find((e) => e.name === 'lodash');
    expect(lodash).toMatchObject({ dev: false, pinnedVersion: '4.17.21' });

    const prettier = entries.find((e) => e.name === 'prettier');
    expect(prettier).toMatchObject({ dev: true, range: '^3.2.5' });

    expect(warnings[0].line).toContain('local');
    expect(warnings[0].reason).toContain('local file reference');
  });
});
