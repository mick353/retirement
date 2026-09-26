# Retirement visual regression

This is a deliberately small rendered-UI guard layered on top of the existing retirement model, source, TypeScript, mobile-contract and build validation.

It does not call or depend on the Pat Pro fork at runtime. The fork supplied a useful method: measure the rendered result and prove important visual properties rather than relying on "looks right". This repository owns its own implementation so retirement CI remains independent.

## Pull-request flow

The visual workflow checks out both the pull-request head and the exact current base commit (normally main). Both versions are built in the same GitHub runner and served locally. A pinned Chromium captures the same six high-value cases:

- Command Centre desktop and phone
- Atlas desktop and phone
- V23 Deep Model desktop and phone

The comparison checks the top viewport screenshot, selected high-signal computed styles, selected element geometry, horizontal overflow and browser errors. Baseline/current/diff images and a one-page HTML/JSON report are uploaded as the retirement-visual-report artifact.

The base commit is generated fresh inside the same CI job, so no PNG baseline library needs to be maintained in the repository. After an intentional visual change is merged, the new main automatically becomes the next baseline.

## Determinism

Both captures use the same Chromium, viewport, locale, Canberra/Sydney timezone, reduced-motion mode and frozen clock. CSS animations/transitions and carets are disabled before capture.

The visual check is aimed at code/layout regressions rather than differences caused merely by when CI happened to run.

## Threshold

The current pixel threshold is 0.25% of the viewport. Selected computed-style changes, selected geometry drift over 2px, new horizontal overflow and browser errors are independent failure signals.

The threshold is deliberately tight because base and PR are captured on the same runner. It is not a claim that all browsers render every pixel identically.

## Intentional visual changes

If the check fails and the appearance change is intentional:

1. inspect the uploaded baseline/current/diff evidence;
2. obtain explicit user approval;
3. add this exact line to the pull-request body: Visual-Change-Approved: yes
4. rerun CI.

That converts the result to PASS_WITH_EXPLICIT_VISUAL_APPROVAL. Agents must not add the approval marker themselves merely to make CI green.

## Scope

This first implementation is intentionally bounded. It is not a clone engine, does not screenshot every scroll position, and does not replace the existing calculation/model/mobile/accessibility controls. It adds one missing release question:

Did this change unexpectedly alter the important rendered retirement surfaces?


## Fast path

The repository also supports an explicit low-overhead mode for times when the user wants the pre-visual workflow.

Add this exact line to the pull-request body:

`Retirement-Fast-Path: yes`

When present, the `Visual regression` job still reports a successful required check, but it skips the expensive rendered comparison work: no second site build, no Chromium installation, no screenshots and no diff artifact.

The separate `Validate` workflow still runs. Therefore this mode is equivalent to the retirement PR validation posture that existed before visual regression was added; it is not a no-check deployment path.

Agents may use the marker only after an explicit user instruction such as `RETIREMENT.FAST` or an equivalent request to bypass visual-regression overhead for that change.

This is intentionally distinct from administrator branch-protection bypass. Emergency direct-to-main administration remains a repository-settings concern, not a CI feature.
