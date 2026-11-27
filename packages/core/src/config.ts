// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Age thresholds for the scoring engine (months since last release).
 * Referenced everywhere via `config.ADRIFT_MONTHS` / `config.WRECK_MONTHS`;
 * changing these two numbers reconfigures the entire scoring engine.
 */
export const config = {
  ADRIFT_MONTHS: 24, // alive -> adrift boundary
  WRECK_MONTHS: 48, // adrift -> wreck (presumed) boundary
} as const;
