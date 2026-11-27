// SPDX-License-Identifier: AGPL-3.0-only

import type { ScoredPackage } from './scoring/scorer.js';

export interface AuditSummary {
  alive: number;
  adrift: number;
  wreck: number;
  unknown: number;
  contaminated: number;
}

export interface AuditResult {
  summary: AuditSummary;
  packages: ScoredPackage[];
  warnings: string[];
}
