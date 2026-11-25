---
inclusion: fileMatch
fileMatchPattern: "web/**"
---

# Necropolis — Design System

Scene: "orbital necropolis". SVG generated from data, CSS animations only. One dark theme.

## Colour palette (CSS tokens)

| Token | Value | Use |
|---|---|---|
| `--void` | `#05070d` | Scene background |
| `--panel` | `#0e1424` | Panels, table, header |
| `--nebula` | `#1b1440` | Background gradient (decoration only) |
| `--line` | `#2a3350` | Orbit lines and borders (never carry content) |
| `--text` | `#e8ecf5` | Body text |
| `--muted` | `#9aa3b8` | Secondary text |
| `--hull` | `#aab3c5` | Live ships |
| `--running` | `#7fe3d0` | Fleet lights and keyboard focus |
| `--engine` | `#ffb454` | The only warm accent: engines, primary button |
| `--drift` | `#7d88a3` | Drifting hulls |
| `--rust` | `#c98a5e` | Wrecks and debris |
| `--hazard` | `#c6f24e` | Contamination rings and badge |
| `--spectre` | `#b79cff` | Epitaphs and glow over wrecks |

State never depends on colour alone: each state has its own shape and a text label.

## Typography

- **Cinzel** — logo, headings, epitaphs.
- **IBM Plex Mono** — package names, versions, dates, counters, table.
- **`system-ui`** — body text and buttons.

Font files are bundled (SIL OFL 1.1). Never load fonts from third-party servers. Smallest label: 13 px. Names longer than 16 characters are truncated with an ellipsis in the scene; full name appears in the accessible description, tooltip and table.

## Layout

ViewBox 1600×900, scales to width. Background gradient with three deterministic star layers (fixed seed). A dark dead-planet arc rises from the bottom edge with a thin `--spectre` glow. Three bands read top to bottom:

- **In formation** — alive, even rows, bows to the right.
- **Adrift** — irregular line, each hull rotated differently.
- **Graveyard orbit** — arc just above the planet, centre of the screen, most space.

A separate **No signal** row for `unknown`. Band labels with counters on the left double as the legend.

Header: logo, file input, "Scan the orbit" button, Scene/Table toggle, Motion toggle, Sound toggle.

"Ship's log" evidence panel slides in from the right (from the bottom on phones) and never covers the selected object.

## Placement

Slots from object count, ordered by weight (contaminated first, then alphabetical), small offset from a checksum of the name. Objects 56 px with a hit area of at least 44 px. Above 60 objects in a band they shrink to 32 px and names show on focus. At 390 px width the bands stack as three labelled grids. No overlap, nothing off-screen at 1280 px or 390 px.

## Object shapes

All shapes are simple SVG drawn by our code.

- **alive** — whole ship, two `--running` lights, `--engine` glow.
- **adrift** — same hull in `--drift`, rotated 20–35°, no lights, no engine, label "silent since 2021".
- **wreck** — hull broken in two, three debris pieces, a buoy plate with `--spectre` glow, label "last release 2015". Presumed: dashed outline, label "presumed lost".
- **contaminated** — `--hazard` rings + badge with count, label "3 advisories". Overlaid on any state.
- **unknown** — probe outline with "?", label "no signal".

## Motion

CSS only, all slow. `prefers-reduced-motion: reduce` and the Motion toggle stop everything and show the final state immediately. Nothing blinks faster than once per second.

| Animation | Duration |
|---|---|
| Scan line | 2.5 s, once |
| Fleet lights | 2.4 s |
| Engines | 3 s |
| Drifting hull ±6° | 40 s |
| Debris | 30 s |
| Contamination rings | 3.6 s |
| Stars | 120 s |

## Accessibility

- Objects are buttons in tab order, band by band.
- Accessible description example: "nose, wreck, last release 2 June 2015, no advisories".
- Arrow keys move focus within and between bands.
- 3 px `--running` focus ring.
- Evidence panel is a dialog with focus trap; Esc closes and returns focus.
- Table "Manifest" columns: Package, Ecosystem, Pinned version, State, Last release, Signals, Advisories, Successor. Sortable. Same panel. Chosen view remembered.
- "Skip to table view" link first on the page.
- Text summary above the scene ("15 packages: 9 in formation, 3 adrift, 3 wrecks, 2 contaminated") announced after the scan.

## Sound

Off by default. Loads only after the Sound toggle is pressed (`aria-pressed`, state in `localStorage`, start volume 40 %).

## Copy (EN)

- Button: "Scan the orbit"
- Sample link: "Try the ghost fleet sample"
- Band labels: "In formation", "Adrift", "Wreck", "Contaminated", "No signal"
