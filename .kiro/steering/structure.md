---
inclusion: always
---

# Necropolis — Repository Structure

```
.kiro/            specs/ (core-analysis, orbit-scene, mcp-gate), steering/, hooks/, agents/, settings/mcp.json
packages/core/    parsers/, sources/, scoring/, report/, successors/   (pure engine)
packages/mcp/     necropolis-mcp (stdio server)
packages/gate/    CLI called by the deps-gate hook
web/              index.html, src/, styles/, assets/ (fonts/, audio/, img/, ASSETS.md)
fixtures/         recorded API responses + sample manifests (with capture date)
data/             successors.json (each entry has a source URL)
scripts/          capture-fixtures.ts
docs/             kiro-journal.md, architecture.md, demo-script.md, provenance.md, third-party.md
LICENSES/         licence texts for assets and fonts (only one LICENSE file in the root)
```

## Import rules

`web`, `mcp` and `gate` depend on `core`. `core` never imports from them. Tests sit next to the code as `*.test.ts`.

## Asset rules

Asset files are CC BY-SA 4.0. Each asset is listed in `web/assets/ASSETS.md` (tool or source, date, prompt, licence).

## Files not to edit

Do not edit `LICENSE` or `docs/provenance.md` unless explicitly asked.
