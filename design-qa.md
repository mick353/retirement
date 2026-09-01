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
- State checked: Rail B 60/40 election, $110,000 flat real spending, 7.0% real return, target age 75, $500,000 real home, 2026–27 tax basis and 12-month reserve policy.
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
- P1 — Frontier marginal-cost bars used an age-75 fixed scale, so a late selected age such as 91 could make the bars exceed 100% and widen the page. Fixed with an active-result relative scale; recheck at age 91: viewport and document widths match on desktop and mobile.
- P1 — a valid late Frontier target such as age 91 was easy to miss on a phone. Fixed with a prominent sticky target-age context card, explicit “comparison age, not projection end” copy, and a direct return to the Adjust control. The projection still runs through age 95.

## Required surface review

- Typography: existing Robinson hierarchy retained; labels stay legible in desktop focus mode and collapse cleanly on mobile.
- Spacing and rhythm: dense controls are grouped above the visual, while the inspector remains adjacent on desktop and stacks below on mobile.
- Colors: Pool A remains blue, Pool C violet, PSS green and home/estate amber. The active return and age marker use the brighter governed accent.
- Assets: all financial geometry is rendered from the live annual ledger; there are no decorative invented pools, placeholder images or fake financial values.
- Copy: every mode identifies the active real return and distinguishes deterministic scenarios from probabilities. V23 remains the age-banded spending authority.
- Accessibility: mode tabs expose selection state; canvases expose slider semantics and keyboard age control; buttons expose pressed state; reduced-motion preferences stop animation.

## Functional QA

- All six synchronized modes switch successfully: Horizon, Financial River, Legacy Orbit, Waterfall, Sunburst and Table.
- Every mode uses one governed annual ledger. Under the 1 September Rail B 60/40 release, the 7.0% / $110,000 scenario produces $2,083,135 investment capital at age 75; Table alone swaps the canvas for the exact ledger.
- Perspective, alternate-rail comparison, play/pause and focus controls update and restore correctly.
- Playback advanced the selected age from 75 to 78 and paused without changing scenario assumptions.
- Command Centre 2D/3D switching works; keyboard ArrowRight moved age 75 to 76 and the milestone restored age 75.
- Changing the URL return from 7.0% to 7.5% updates both public surfaces. Under the September 60/40 source, the reconciled age-75 result is $2,253,745; Atlas displays 7.5% in the metric, active visual basis and ledger inspector.
- Election regression covers all seven valid basis/election combinations across Command Centre, Atlas and V23. The current-basis 100% case was checked at $90k, $100k, $110k and $130k spending: voluntary portfolio draw remains $0 and the exact PSS surplus routes to Pool C.
- Projection-basis regression covers the shared URL, local-state schema and all three interfaces. The 8.2% / 5% / 2.5% set exposes 5.56% real fund and 2.44% real salary equivalents with four elections. The 6% / 5% / 3% set exposes 2.91% and 1.94% equivalents with direct 60/40, 65/35 and 70/30 estimates and its separate $162,380.20 FAS.
- The source gate is build-blocking at election level: a prudent-basis 100% request normalises to its verified 60/40 default, the 100% control is disabled, and no current-basis value is borrowed. The 65/35 and 70/30 provider one-cent component residuals are accepted but not rewritten.
- Wash regression verifies direct PSS components and source-limited maxima of 6, 5, 4 and 0 cycles for the current basis; 5, 5 and 4 for the prudent basis; plus 5 for Rail A.
- Mobile Frontier regression at age 91 confirms the selected age stays visible, the Adjust handoff retains 91, the projection horizon remains 95, and the page has no horizontal overflow.
- VR regression confirms the top status and page banner identify the March/V5 research basis, disclose that September basis controls do not recalculate VR, and require formal CSC estimates at ages 57–59 before reliance.
- Progressive-disclosure regression confirms secondary PSS allocation, three-pool, VR chart/logic and evidence-source details open and close by pointer, Enter and Space without hiding the primary provider-basis or election controls.
- Mobile PSS and VR regression at 390 × 844 confirms the active prudent basis is selectable, disclosure summaries remain within the viewport and there is no page-level horizontal overflow.
- V23 mobile toolbar regression confirms page-level width remains fixed while the 862-pixel action strip scrolls within its 351-pixel container.
- At 390 × 844, Atlas has no page-level horizontal overflow. The six mode buttons scroll inside their own toolbar, while the focused canvas remains within the viewport.
- TypeScript, governed-model invariants, visual DOM bindings and the production build all pass.

## V23.5 control-integrity regression

- Shared scenario query tested at 6.0% real return and target age 80: the active labels, range controls, exact-number fields and sticky assumptions ledger all display 6.0% / 80 immediately.
- Manual age bands survive a provider-basis change from the current CSC basis to the prudent sensitivity basis without being flattened or relabelled.
- A subsequently opened shared flat scenario retains the saved V23 age bands by default, explains the protection, and offers an explicit button to replace them with the shared flat total.
- The explicit flat-spend action was exercised: it produces one derived gap band, updates the authoritative-plan strip and rewrites the reciprocal Command Centre scenario link to the selected flat spend.
- Everyday navigation exposes the plan, decision, trajectory, guardrail, estate, Monte Carlo and annual-review surfaces. All 23 specialist views remain unique and reachable inside Advanced analysis; opening a specialist page automatically expands that disclosure.
- Mobile regression at a 390-pixel viewport records a 375-pixel document/body width and a 357-pixel plan-authority strip; the 862-pixel action toolbar remains intentionally contained inside its 351-pixel horizontal scroller.
- The build now blocks regressions in PSS-election age-band preservation, exact-control synchronisation, sticky-ledger synchronisation, flat-spend opt-in and all 33 unique V23 destinations.

## Residual note

- P3 — the production Horizon deliberately uses a restrained number of deterministic return slices rather than reproducing every decorative ribbon in the concept. This keeps the graph readable and avoids suggesting a probability distribution.

No actionable P0, P1 or P2 design issues remain.

final result: passed
