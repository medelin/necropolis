// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from 'vitest';
import { parseRequirements } from './requirements';

// Requirements: 1.11

describe('parseRequirements — acceptance tests', () => {
  // 1. Plain name only
  it('case 1: plain name', () => {
    const { entries, warnings } = parseRequirements('requests');
    expect(warnings).toEqual([]);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ name: 'requests', ecosystem: 'pypi' });
    expect(entries[0].pinnedVersion).toBeUndefined();
    expect(entries[0].range).toBeUndefined();
  });

  // 2. == pin
  it('case 2: == pin', () => {
    const { entries, warnings } = parseRequirements('requests==2.28.0');
    expect(warnings).toEqual([]);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ name: 'requests', pinnedVersion: '2.28.0' });
    expect(entries[0].range).toBeUndefined();
  });

  // 3. >= range
  it('case 3: >= range', () => {
    const { entries, warnings } = parseRequirements('requests>=2.0');
    expect(warnings).toEqual([]);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ name: 'requests', range: '>=2.0' });
    expect(entries[0].pinnedVersion).toBeUndefined();
  });

  // 4. ~= range
  it('case 4: ~= range', () => {
    const { entries, warnings } = parseRequirements('requests~=2.28');
    expect(warnings).toEqual([]);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ name: 'requests', range: '~=2.28' });
  });

  // 5. != exclusion range
  it('case 5: != exclusion range', () => {
    const { entries, warnings } = parseRequirements('requests!=2.0');
    expect(warnings).toEqual([]);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ name: 'requests', range: '!=2.0' });
  });

  // 6. Single extra + == pin
  it('case 6: extras with == pin', () => {
    const { entries, warnings } = parseRequirements('requests[security]==2.28.0');
    expect(warnings).toEqual([]);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      name: 'requests',
      extras: ['security'],
      pinnedVersion: '2.28.0',
    });
  });

  // 7. Multiple extras without version
  it('case 7: multiple extras', () => {
    const { entries, warnings } = parseRequirements('requests[security,socks]');
    expect(warnings).toEqual([]);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ name: 'requests', extras: ['security', 'socks'] });
  });

  // 8. Environment marker
  it('case 8: environment marker', () => {
    const { entries, warnings } = parseRequirements(
      'requests==2.28.0 ; python_version >= "3.6"',
    );
    expect(warnings).toEqual([]);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      name: 'requests',
      pinnedVersion: '2.28.0',
      marker: 'python_version >= "3.6"',
    });
  });

  // 9. Inline comment stripped
  it('case 9: inline comment stripped', () => {
    const { entries, warnings } = parseRequirements('requests==2.28.0  # comment');
    expect(warnings).toEqual([]);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ name: 'requests', pinnedVersion: '2.28.0' });
  });

  // 10. Blank line skipped silently
  it('case 10: blank line skipped silently', () => {
    const { entries, warnings } = parseRequirements('\n\n');
    expect(warnings).toEqual([]);
    expect(entries).toHaveLength(0);
  });

  // 11. Comment-only line skipped silently
  it('case 11: comment-only line skipped silently', () => {
    const { entries, warnings } = parseRequirements('# just a comment');
    expect(warnings).toEqual([]);
    expect(entries).toHaveLength(0);
  });

  // 12. Backslash continuation
  it('case 12: backslash continuation', () => {
    const { entries, warnings } = parseRequirements('requests\\\n==2.28.0');
    expect(warnings).toEqual([]);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ name: 'requests', pinnedVersion: '2.28.0' });
  });

  // 13. -r skip with warning
  it('case 13: -r skip with warning', () => {
    const { entries, warnings } = parseRequirements('-r other-requirements.txt');
    expect(entries).toHaveLength(0);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].lineNumber).toBe(1);
    expect(warnings[0].line).toBe('-r other-requirements.txt');
  });

  // 14. -c skip with warning
  it('case 14: -c skip with warning', () => {
    const { entries, warnings } = parseRequirements('-c constraints.txt');
    expect(entries).toHaveLength(0);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].line).toBe('-c constraints.txt');
  });

  // 15. -e skip with warning
  it('case 15: -e skip with warning', () => {
    const { entries, warnings } = parseRequirements('-e .');
    expect(entries).toHaveLength(0);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].line).toBe('-e .');
  });

  // 16. --index-url skip with warning
  it('case 16: --index-url skip with warning', () => {
    const { entries, warnings } = parseRequirements(
      '--index-url https://pypi.org/simple',
    );
    expect(entries).toHaveLength(0);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].line).toBe('--index-url https://pypi.org/simple');
  });

  // 17. Direct URL skip with warning
  it('case 17: direct URL skip with warning', () => {
    const { entries, warnings } = parseRequirements(
      'https://example.com/pkg.whl',
    );
    expect(entries).toHaveLength(0);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].line).toBe('https://example.com/pkg.whl');
  });

  // 18. VCS reference skip with warning
  it('case 18: VCS reference skip with warning', () => {
    const { entries, warnings } = parseRequirements(
      'git+https://github.com/example/pkg.git',
    );
    expect(entries).toHaveLength(0);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].line).toBe('git+https://github.com/example/pkg.git');
  });

  // 19. PEP 503 normalisation
  it('case 19: PEP 503 normalisation', () => {
    const { entries, warnings } = parseRequirements('My_Package.Name==1.0');
    expect(warnings).toEqual([]);
    expect(entries).toHaveLength(1);
    expect(entries[0].name).toBe('my-package-name');
    expect(entries[0].pinnedVersion).toBe('1.0');
  });

  // 20. Version + marker together (combined)
  it('case 20: version and marker combined', () => {
    const { entries, warnings } = parseRequirements(
      'urllib3>=1.26.0,!=2.0.0 ; python_version < "3.12"',
    );
    expect(warnings).toEqual([]);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      name: 'urllib3',
      range: '>=1.26.0,!=2.0.0',
      marker: 'python_version < "3.12"',
    });
    expect(entries[0].pinnedVersion).toBeUndefined();
  });
});
