# Retirement testing

GitHub **Validate** runs TypeScript, the calculation and website checks, and the browser journeys on pull requests. **Deploy GitHub Pages** runs the checks against the artifact it will publish. The screenshot comparison remains a separate, manually dispatched workflow.

## Local checks

Run `npm ci` in the relevant checkout. Install the pinned Chromium once for each browser-tool version:

```sh
npm exec -- playwright install --only-shell chromium
```

| Checkout | Command | Result |
| --- | --- | --- |
| GitHub Pages | `npm run typecheck && npm test && npm run test:browser` | TypeScript, model and website checks, 28 Node tests, and browser journeys against the Pages build |
| ChatGPT Sites | `npm test` | Sites build, model and website checks, 29 Node tests, and browser journeys against the built Worker and assets |

The V23 matrix tests 384 combinations of PSS basis, election, annual return, spending rule, and Pool C policy. The separate core validator checks prior calculation behaviour against the recorded deterministic and seeded-risk fixtures.

The reserve case covers $320,000 available with $300,000 protected, a market loss below the reserve, a blank reserve, a zero reserve and explicit one-off access. Paired checkpoint tests reproduce the $160,000 example at ages 75 and 85 on the same 200 paths, and confirm that raising the goal to $700,000 changes the check while leaving cash flows intact.

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

The goals and exports journey exercises a $700,000 goal carried into V23, distinct goals shown in the return preview, a capped reserve below its target, and plan-only and full downloads. It confirms that importing the plan-only file restores the calculation ID and preserves local review notes in both workspaces. The Decision Brief journey opens the later first shortfall on the alternative's own ledger.

The guide tests check that every V23 page has help, the Guide uses the selected ages and investment goal, and the Quick start and All pages links open the intended view. They check the guide at phone and desktop widths, then follow Command Centre's Risk help to the on-site model reference.

The Command Centre menu test measures the Explore chart before and after hiding the menu at desktop width. It checks that the preference survives reload, the tablet drawer opens over the chart, Escape returns focus, and a narrow phone can still reach the menu.

The spending-band journey checks that the year, amount and budget basis fit at widths from 320px to 2280px. It edits the Ramp preset with the keyboard, switches from dollars to return to mandatory draw, checks the 100% cap, and compares changes in both phase-table views against the spending chart. It also verifies that distinct draw percentages fund the same pension-only amount when the mandatory draw is zero.

Decision-integrity checks use the review's $160,000 example. Of 600 seeded Command Centre paths, 427 pass the age-75 investment floor and 11 also fund every spending year. Existing balance paths and percentiles retain frozen-ledger parity. The browser checks the upfront verdict, trigger count, one-off limit, policy result invalidation, keyboard Guide, explicit Surface draft, and saved/revised annual forecast. Pension-calendar checks cover first-year pro-rating, leap years, 1 June and nearest-$10 rounding.

The Decision Brief browser check verifies at least 4.5:1 contrast for the four result notes in both themes. The offline check replaces obsolete retirement caches, preserves an unrelated cache on the same origin, and opens the example Decision Brief offline. The Sites test server reproduces production redirects so both the .html link and the canonical Site URL are tested. Real-device Safari, operating-system PWA installation, and pixel-by-pixel comparison remain separate checks.

The decision workbench test checks fixed paths against the earlier independent replay, confirms and cancels a draft, compares the annual trace to the CSV and chart, and verifies the plan receipt. A near-floor model fixture explains why the flat and detailed conclusions can differ. The payment calendar fixture covers July, December, June, leap years, delayed commencement, and the next 1 July balance. Synthetic AI tests compare the preview to the request and verify the optional notes boundary.

The offline test opens Command Centre from a new tab without internet, then loads and edits an older V23 age-band plan and reopens it after deferring an update. Additional engine checks use `npm run test:browser -- --mobile-engine ios` with Playwright WebKit and `npm run test:browser -- --mobile-engine android` with Chromium. Install the WebKit browser with `npm exec -- playwright install webkit` for the iOS-sized run. These profiles reproduce the mobile viewport and input capabilities in a desktop browser.
