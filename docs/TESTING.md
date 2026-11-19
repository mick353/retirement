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

The Sites build always runs the Node tests. Before packaging a release, run `npm test` on the exact source to be pushed, or pass `["npm", "test"]` in the Site workflow helper's ordered packaging commands. When the helper saves and publishes the tested version, check the live origin as well.

```sh
npm run test:browser -- --url https://robinson-retirement.mick353.chatgpt.site/
npm run test:browser -- --url https://mick353.github.io/retirement/
```

Run live checks with the suite's isolated browser contexts. It opens synthetic plan links and discards browser storage. The journeys cover Command Centre hand-off, Surface and the integrated Atlas, plus V23 opening-pool edits, resets, pension elections, flat and age-based spending, chart calculations, and reload persistence at desktop and phone widths. Real-device Safari, operating-system PWA installation, and pixel-by-pixel comparison remain separate checks.
