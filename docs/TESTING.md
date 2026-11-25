# Retirement testing

GitHub **Validate** runs TypeScript, the calculation and website checks, and the browser journeys on pull requests. **Deploy GitHub Pages** runs the checks against the artifact it will publish. The screenshot comparison remains a separate, manually dispatched workflow.

## Local checks

Run `npm ci` in the relevant checkout. Install the pinned Chromium once for each browser-tool version:

```sh
npm exec -- playwright install --only-shell chromium
```

| Checkout | Command | Result |
| --- | --- | --- |
| GitHub Pages | `npm run typecheck && npm test && npm run test:browser` | TypeScript, model and website checks, 24 Node tests, and browser journeys against the Pages build |
| ChatGPT Sites | `npm test` | Sites build, model and website checks, 25 Node tests, and browser journeys against the built Worker and assets |

The V23 matrix tests 384 combinations of PSS basis, election, annual return, spending rule, and Pool C policy. The separate core validator checks prior calculation behaviour against the recorded deterministic and seeded-risk fixtures.

## Sites releases

The Sites build always runs the Node tests. Before packaging a release, run `npm test` on the exact source to be pushed. To have the Site workflow helper run it during packaging, use `["cmd.exe", "/d", "/c", "npm", "test"]` on Windows or `["npm", "test"]` on macOS and Linux. When the helper saves and publishes the tested version, check the live origin as well.

```sh
npm run test:browser -- --url https://robinson-retirement.mick353.chatgpt.site/
npm run test:browser -- --url https://mick353.github.io/retirement/
```

Run live checks with the suite's isolated browser contexts. It opens synthetic plan links and discards browser storage. Tests cover the Command Centre hand-off, Surface preview and explicit apply, and the integrated Atlas ledger. V23 checks cover opening-pool edits, resets, pension elections, flat and age-based spending, reload, save slots, and settings export and import. The first-year capital check uses independently calculated amounts so the browser test can detect a surplus omitted from Pool C even if the surplus label still renders correctly.

The V23 edge cases verify that an imported flat budget leaves Scenario B, Sensitivity, Tornado and Recalibrate free to use their own spending assumptions. They also exercise one-off funding under both Pool C policies, and check that a full V23 reset clears the active hand-off and keeps saved slots.

Capital Trajectory must reconcile to its chart balance. The browser suite also captures the synthetic AI Review request locally and checks the first-year cashflow fields under both pension elections.

A zero-investment scenario verifies that Tornado leaves percentages undefined when the base is zero and renders all 33 V23 pages to check for invalid dollar and percentage displays.

Specialist-page regressions compare Health and zero-shock CPI with the active ledger, including a funded retirement one-off. They also verify unfunded health bills, pension and spending during a multi-year shock, paired return sequences, an unreachable break-even target, zero-balance probability and review results, and a partial quarter in the Pre-60 tracker. The browser covers both valid and invalid recalibration ages and checks that opening actuals are preserved.

The audited-control checks read the actual Average annual spending funded field in Income and Overview. Fixtures cover a fully funded 35-year plan, a pension surplus, a budget with a shortfall, and a 30-year custom-age plan. The separate ledger test verifies the numerator and denominator when capital runs out after a one-off. Other regressions cover spending-band timing and conversions, growth in the policy comparator, calendar-age spending windows, dated retirement inputs, the Wash component cap, same-age save-slot deltas, settings export, and a floor missed before any one-off.

The Decision Brief journey checks the default 70/30 election, its source amounts, the flat budget, all three age-75 capital cards and the likely chart figure. It then changes the election and budget, checks the shortfall alongside preserved capital, and reloads to verify the saved plan.

The spending-band journey checks that the year, amount and budget basis fit at widths from 320px to 2280px. It edits the Ramp preset with the keyboard, switches from dollars to return to mandatory draw, checks the 100% cap, and compares changes in both phase-table views against the spending chart. It also verifies that distinct draw percentages fund the same pension-only amount when the mandatory draw is zero.

Real-device Safari, operating-system PWA installation, and pixel-by-pixel comparison remain separate checks.
