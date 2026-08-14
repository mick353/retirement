# Design QA — Horizon, Capital Landscape and Time Machine

**Source visual truth**

- `C:\Users\mickg\.codex\generated_images\019f87d7-56d1-7212-82b5-fdcd2b2d8d57\exec-7a65f68d-7071-4b90-bd40-ab26706735d0.png` — Retirement Horizon concept.
- `C:\Users\mickg\.codex\generated_images\019f87d7-56d1-7212-82b5-fdcd2b2d8d57\exec-23c8d0c0-61e7-499a-a544-7262535d05c7.png` — Capital Landscape concept.
- `C:\Users\mickg\.codex\generated_images\019f87d7-56d1-7212-82b5-fdcd2b2d8d57\exec-568e6757-6009-4dc9-abea-3dd3389e6cef.png` — Time Machine concept.

**Rendered evidence**

- Command Centre screenshot: `C:\Users\mickg\AppData\Local\Temp\retirement-command-horizon-qa.png`.
- Atlas screenshot: `C:\Users\mickg\AppData\Local\Temp\retirement-atlas-landscape-qa.png`.
- Side-by-side comparison inputs: `C:\Users\mickg\AppData\Local\Temp\retirement-command-horizon-comparison.png`, `C:\Users\mickg\AppData\Local\Temp\retirement-atlas-landscape-comparison.png`, and `C:\Users\mickg\AppData\Local\Temp\retirement-time-machine-comparison.png`.
- Browser-rendered local preview: `http://127.0.0.1:4173/retirement/`; desktop viewport 1365 × 900, mobile viewport 390 × 844, CSS pixels at device scale factor 1.
- State checked: Rail B, $110,000 flat real spending, target age 75 and a $500,000 real home. Atlas was checked at 7.5%, 7.0% and 6.5% real return; Time Machine selected age 86 from its plotted path. Horizon was checked at 6.5% and 7.0% real return.

**Findings**

- No actionable P0, P1 or P2 issues remain.
- The implementation deliberately uses the existing Robinson design system rather than copying the dark reference mockups literally. This preserves the established Command Centre / Atlas information architecture and governed-model language.
- Fonts and typography: existing system typography and hierarchy remain consistent; compact chart labels remain readable at both tested widths.
- Spacing and layout rhythm: the Horizon keeps the graph, age control and selected-year interpretation together; the mobile layout has no page-level horizontal overflow.
- Colors and visual tokens: existing rail, capital and reserve colours are retained. Pool A is blue and Pool C is green across the Landscape, with the selected inspection in the existing blue accent.
- Image quality and asset fidelity: the references were design targets, not embedded production imagery. Horizon is a live SVG built from the annual ledger. The landscape is a live stacked Chart.js view; Time Machine now deliberately replaces it with a separately rendered canvas depth view, built from the same Pool A and Pool C ledger values. No decorative or invented Pool B layer was added.
- Copy and content: the new surfaces clearly distinguish investment capital from income, identify the active planning year, and retain the V23 age-band handoff.

**Interaction checks**

- Horizon milestone controls update selected age, chart marker and planning-year explanation. Its live plus control changed 6.5% to 7.0% and the age-75 capital from $1,537,551 to $1,676,639.
- Atlas milestone controls update the capital readout and selected state. Its live return control changed 7.5% to 6.5% and the selected-age capital from $3,435,446 to $2,509,826.
- Time Machine replaces the two-dimensional landscape chart with a depth-layer canvas, selected-age plane and visible points. Clicking its plotted path selected age 86 and updated the standard readout.
- Atlas mobile view at 390 × 844 has no page-level horizontal overflow; the depth canvas remains 288 × 290 CSS pixels, and the active return remains visible in the inspector.

**Follow-up polish**

- P3: if a future release adds a separately funded Pool B, add it as a third live dataset to the Landscape rather than displaying a zero-value decorative layer.

final result: passed
