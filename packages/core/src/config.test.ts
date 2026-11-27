// SPDX-License-Identifier: AGPL-3.0-only
import { describe, it, expect } from 'vitest';
import { config } from './config.js';

describe('config', () => {
  it('exports ADRIFT_MONTHS as 24', () => {
    expect(config.ADRIFT_MONTHS).toBe(24);
  });

  it('exports WRECK_MONTHS as 48', () => {
    expect(config.WRECK_MONTHS).toBe(48);
  });
});
