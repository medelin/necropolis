// SPDX-License-Identifier: AGPL-3.0-only

export type Ecosystem = 'pypi' | 'npm';

export interface Entry {
  name: string;            // PEP 503-normalised for PyPI; lowercase for npm
  ecosystem: Ecosystem;
  pinnedVersion?: string;  // exact ==x.y.z or exact semver
  range?: string;          // any other specifier string
  dev?: boolean;           // npm devDependencies
  extras?: string[];       // PyPI extras in []
  marker?: string;         // PyPI environment marker after ;
}

export interface ParseWarning {
  lineNumber: number;
  line: string;
  reason: string;
}

export interface ParseResult {
  entries: Entry[];
  warnings: ParseWarning[];
}
