// SPDX-License-Identifier: AGPL-3.0-only

import type { Entry } from '../parsers/types.js';

export type State = 'alive' | 'adrift' | 'wreck' | 'unknown';

export interface EvidenceItem {
  fact: string;
  source_url: string;
  observed_at: string; // ISO 8601
}

export interface Successor {
  name: string;
  source_url: string;
}

export interface ScoredPackage {
  entry: Entry;
  state: State;
  contaminated: boolean;
  ringCount: 0 | 1 | 2 | 3;
  evidence: EvidenceItem[];
  epitaph: string;
  successor?: Successor;
}
