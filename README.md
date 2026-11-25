# Necropolis

Every project orbits a graveyard. See which of your dependencies are dead, and keep your AI agent from salvaging them.

## What it is

Necropolis is a static web page that draws a project's dependencies (from `requirements.txt` or `package.json`) as the orbit of a dead planet. Maintained packages fly in formation; silent ones drift; packages with an explicit registry signal (deprecated, yanked, or Inactive) are wrecks; packages with known vulnerabilities carry radiation rings. Every object shows its evidence from PyPI, npm, and OSV.dev with direct source links.

The same TypeScript engine runs as an MCP server (`necropolis-mcp`) and as a Kiro Pre Tool Use hook (`deps-gate`) that blocks installs of dead packages.

Principle: evidence, not verdicts.

## Status

Work in progress. Built during Kiroween 2026 (from 25 November 2026).

## Quick start

Coming soon.

## Data sources

- [PyPI JSON API](https://warehouse.pypa.io/api-reference/json.html)
- [npm registry](https://github.com/npm/registry/blob/main/docs/REGISTRY-API.md)
- [OSV.dev](https://osv.dev/)

Public read-only APIs. No account and no backend required.

## Built with Kiro

Specs, steering, and hooks live in `/.kiro`. Documentation will expand here as the project develops.

## Pre-existing work

None beyond the open-source libraries listed in `package.json`.

## Provenance

Who and what wrote each part of this repository (the owner, the Kiro agent, and a general-purpose AI assistant that started kiro-cli sessions) is recorded in [docs/provenance.md](docs/provenance.md).

## Assets and licences

Code is licensed under AGPL-3.0-only (see `LICENSE`). Non-code assets in `assets/` and `web/assets/` are licensed under CC BY-SA 4.0 (see `LICENSE-ASSETS.md`). Third-party fonts keep their own licences (SIL OFL 1.1), with licence texts in `LICENSES/`.

## Trademarks

The name "Necropolis" and the project logo are not covered by the source code or asset licences. You may say that your work is based on Necropolis, but you may not use the name or the logo for a modified version, product or service. See [`TRADEMARKS.md`](TRADEMARKS.md).

## Licence

Copyright (C) 2026 Piotr Kaczmarski. Licensed under the GNU Affero General Public License v3.0 only (SPDX: AGPL-3.0-only). See LICENSE.
