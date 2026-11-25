---
inclusion: always
---

# Necropolis — Tech

## Language and modules

TypeScript, ES modules, strict mode. One engine (`packages/core`) runs unchanged in the browser and in Node. No Node-only or DOM-only APIs inside `core`; inject `fetch`, clock and cache.

## Web

Vite. No UI framework: plain DOM and SVG, CSS animations only. No WebGL, no canvas scene.

## Tests

Vitest. Property-based tests with fast-check for parsers, scoring and layout. Tests never hit the network; use recorded fixtures in `fixtures/`.

## MCP

Official `@modelcontextprotocol/sdk`, stdio transport.

## Runtime and package management

Node 26. npm workspaces. Install dependencies locally only.

## Data sources and limits

- PyPI JSON API: `GET https://pypi.org/pypi/<name>/json` and `/<name>/<version>/json`.
- npm registry: `GET https://registry.npmjs.org/<name>` and `/<name>/latest`.
- OSV.dev: `POST https://api.osv.dev/v1/querybatch`; details `GET /v1/vulns/<id>`.
- All allow CORS.
- Browser: at most 6 concurrent requests, results cached in memory and `sessionStorage` for 24 h, max 150 packages per manifest.
- Node (MCP, gate): file cache in `~/.cache/necropolis/` for 24 h.
- `NECROPOLIS_FIXTURES=1` switches MCP and gate to fixtures.
- GitHub API is out of scope for the browser.

## Deployment

No backend, no accounts, no secrets anywhere in the repo (including `.kiro/settings/mcp.json`). The demo is a static site on GitHub Pages and must work offline with the bundled sample.

## Licensing

Dependencies must be MIT, ISC, BSD or Apache-2.0 licensed (compatible with AGPL-3.0-only). List them in `docs/third-party.md`. New source files carry the header `// SPDX-License-Identifier: AGPL-3.0-only`.

## Repository rules

Never add `.kiro` or any of its subfolders to `.gitignore`.
