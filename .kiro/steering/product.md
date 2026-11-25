---
inclusion: always
---

# Necropolis — Product

"Every project orbits a graveyard." A practical dependency-audit tool in a haunting costume (Kiroween 2026, Costume Contest).

## Users

- Developers who inherited a project and do not know which dependencies are dead.
- Anyone coding with an AI agent that installs packages it remembers from training data, including long-abandoned ones.

## Three uses

1. Audit a project in 10 seconds in the browser, no account, no install.
2. Markdown report to paste into an issue.
3. A gate for AI agents: a dead package never enters the project at install time (`necropolis-mcp` MCP server + Kiro Pre Tool Use hook `deps-gate`).

## Inputs

`requirements.txt` and `package.json`. Direct dependencies only. No lock files, no transitive deps, no other ecosystems.

## Package states

- `alive` — release within 24 months, no signals. Shown as a ship in formation.
- `adrift` — no release for 24+ months, no explicit signal. Shown as a drifting hull.
- `wreck` — confirmed by an explicit registry signal (`npm` `deprecated`, PyPI `yanked`, classifier `Development Status :: 7 - Inactive`), or presumed after 48+ months of silence (dashed outline, label "presumed lost").
- `unknown` — registry did not answer or package not found. Label "no signal".
- Flag `contaminated` — known vulnerabilities for the pinned version (OSV.dev), overlaid on any state. Contamination rings: 1 ring for 1–2 advisories, 2 for 3–5, 3 for 6+.

The 24-month and 48-month thresholds are configurable in one place.

## Core rule: evidence, not verdicts

Every state comes with a list of evidence items (fact, source URL, observed-at time). Use the word "dead" only with an explicit registry signal (deprecated, yanked, Inactive, archived). Age alone is "silent since \<year\>" or "presumed lost", never "dead".

## Successors

Suggestions with a source, never automatic replacements.

## No AI model in the running app

Epitaphs come from deterministic templates: "Here drifts nose. Last transmission: 2 June 2015. Survived by pytest."

## UI language

Graveyard vocabulary: necropolis, graveyard orbit, wreck, epitaph, ghost fleet. No characters, ships, names or motifs from films or games. No third-party trademarks.

## Accessibility

Full keyboard use, screen-reader descriptions, text contrast at least 4.5:1, `prefers-reduced-motion` honoured, nothing flashes more than 3 times per second, and a table view ("Manifest") that is a full equivalent of the scene.
