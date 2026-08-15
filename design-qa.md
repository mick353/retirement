# Design QA — Retirement Visual Studio

## Source visual truth

- `C:\Users\mickg\.codex\generated_images\019f87d7-56d1-7212-82b5-fdcd2b2d8d57\exec-cb86f831-c5ec-4f53-8e4d-e2b3bc1471c2.png` — Scenario Observatory / Retirement Horizon concept.
- `C:\Users\mickg\.codex\generated_images\019f87d7-56d1-7212-82b5-fdcd2b2d8d57\exec-8dd5abf9-fe1d-443d-9119-ad2a69f64d10.png` — Financial River concept.
- `C:\Users\mickg\.codex\generated_images\019f87d7-56d1-7212-82b5-fdcd2b2d8d57\exec-04f2082e-176c-44bc-96a8-b3b05d9fe123.png` — Legacy Orbit concept.

## Rendered evidence

- Final implementation captures:
  - `qa-artifacts/command-horizon-focus.png`
  - `qa-artifacts/atlas-river.png`
  - `qa-artifacts/atlas-orbit.png`
- Side-by-side comparison inputs:
  - `qa-artifacts/compare-horizon.png`
  - `qa-artifacts/compare-river.png`
  - `qa-artifacts/compare-orbit.png`
- Desktop comparison viewport: 1440 × 1024 CSS pixels, device scale factor 1.
- The concept and implementation panels were normalized to equal 720 × 512 regions without distortion. Browser chrome was treated as non-product framing.
- State checked: Rail B, $110,000 flat real spending, 7.0% real return, target age 75, $500,000 real home, 2026–27 tax basis and 12-month reserve policy.
- Mobile regression viewport: 390 × 844 CSS pixels.

## Full-view comparison

- Scenario Observatory: the implementation preserves the concept's prominent assumptions row, illuminated active-return path, multiple deterministic return slices, selected-age gate, annual PSS/draw lane, outcome inspector, 3D/2D control and deep-link to the six-view Atlas. It uses the established Robinson design tokens and live reconciled ledger.
- Financial River: the implementation preserves the concept's horizontal flow language and selected-age gate while separating annual PSS/draw/reinvestment flows from the differently scaled Pool A/Pool C capital stock. This avoids implying that annual income and accumulated capital share one unit scale.
- Legacy Orbit: the implementation preserves the spatial estate model, age orbit, selected-age beam and layered Pool A, Pool C, PSS and home components. PSS is explicitly an annual-income halo, not estate capital.

## Focused regions checked

- Command Centre Horizon header and focused assumptions strip.
- Active real-return label, selected-age marker and deterministic-path disclosure.
- Horizon annual-cashflow lane and spending sensitivity inspector.
- Atlas six-mode toolbar and focus overlay.
- Financial River selected gate, separate unit scales and inspector.
- Legacy Orbit layer labels, age markers and composition readout.
- Mobile mode selector, focus view, canvas width and inspector stacking.

## Comparison history and fixes

- P1 — the first Command Centre focus overlay retained transparent page content behind it. Fixed with an opaque focus surface and clean viewport framing.
- P2 — the first pass did not provide an immersive inspection state. Fixed by adding Focus view to both Command Centre Horizon and Atlas Visual Studio, with Escape-to-close.
- P2 — the focused Command Centre view lacked enough assumption context. Fixed with starting capital, net spending, real return used, target age, home and indexed PSS floor.
- P2 — the River could imply one shared scale for annual flow and capital stock. Fixed with separate lanes, explicit scale labels, a selected-age cross-section and method disclosure.
- P2 — Atlas grid children could expand the page at a 390-pixel viewport. Fixed with zero-minimum panel sizing and constrained table scrolling. Recheck: viewport 390, document width 390, focused canvas 365 pixels.

## Required surface review

- Typography: existing Robinson hierarchy retained; labels stay legible in desktop focus mode and collapse cleanly on mobile.
- Spacing and rhythm: dense controls are grouped above the visual, while the inspector remains adjacent on desktop and stacks below on mobile.
- Colors: Pool A remains blue, Pool C violet, PSS green and home/estate amber. The active return and age marker use the brighter governed accent.
- Assets: all financial geometry is rendered from the live annual ledger; there are no decorative invented pools, placeholder images or fake financial values.
- Copy: every mode identifies the active real return and distinguishes deterministic scenarios from probabilities. V23 remains the age-banded spending authority.
- Accessibility: mode tabs expose selection state; canvases expose slider semantics and keyboard age control; buttons expose pressed state; reduced-motion preferences stop animation.

## Functional QA

- All six synchronized modes switch successfully: Horizon, Financial River, Legacy Orbit, Waterfall, Sunburst and Table.
- Every mode retained the same age-75 investment capital ($1,676,639) at the 7.0% Rail B scenario; Table alone swaps the canvas for the exact annual ledger.
- Perspective, alternate-rail comparison, play/pause and focus controls update and restore correctly.
- Playback advanced the selected age from 75 to 78 and paused without changing scenario assumptions.
- Command Centre 2D/3D switching works; keyboard ArrowRight moved age 75 to 76 and the milestone restored age 75.
- Changing the URL return from 7.0% to 7.5% updated both public surfaces. Command Centre and Atlas both reported age-75 investments of $1,825,830; Atlas displayed 7.5% in the metric, active visual basis and ledger inspector.
- At 390 × 844, Atlas has no page-level horizontal overflow. The six mode buttons scroll inside their own toolbar, while the focused canvas remains within the viewport.
- TypeScript, governed-model invariants, visual DOM bindings and the production build all pass.

## Residual note

- P3 — the production Horizon deliberately uses a restrained number of deterministic return slices rather than reproducing every decorative ribbon in the concept. This keeps the graph readable and avoids suggesting a probability distribution.

No actionable P0, P1 or P2 design issues remain.

final result: passed
