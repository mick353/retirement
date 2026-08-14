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
- State checked: Rail B, $110,000 flat real spending, 7.5% real return, target age 75; Horizon age 85 and Atlas age 85 / Time Machine active were also tested.

**Findings**

- No actionable P0, P1 or P2 issues remain.
- The implementation deliberately uses the existing Robinson design system rather than copying the dark reference mockups literally. This preserves the established Command Centre / Atlas information architecture and governed-model language.
- Fonts and typography: existing system typography and hierarchy remain consistent; compact chart labels remain readable at both tested widths.
- Spacing and layout rhythm: the Horizon keeps the graph, age control and selected-year interpretation together; the mobile layout has no page-level horizontal overflow.
- Colors and visual tokens: existing rail, capital and reserve colours are retained. Pool A is blue and Pool C is green across the Landscape, with the selected inspection in the existing blue accent.
- Image quality and asset fidelity: the references were design targets, not embedded production imagery. The delivered visuals are live Chart.js / model-data views rather than rasterized mock data; no substitute decorative image assets were introduced.
- Copy and content: the new surfaces clearly distinguish investment capital from income, identify the active planning year, and retain the V23 age-band handoff.

**Interaction checks**

- Horizon milestone controls update selected age, chart marker and planning-year explanation.
- Atlas milestone controls update the capital readout and selected state.
- Time Machine toggles an intentional perspective presentation without changing the underlying ledger or scenario.
- Atlas mobile view has no page-level horizontal overflow; milestone cards remain horizontally reachable and the age slider remains available.
- No browser console errors were present in the tested Command Centre or Atlas states.

**Follow-up polish**

- P3: if a future release adds a separately funded Pool B, add it as a third live dataset to the Landscape rather than displaying a zero-value decorative layer.

final result: passed
