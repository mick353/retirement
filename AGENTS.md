# Repository agent instructions

## CI-first validation

For Codex, ChatGPT and other coding agents working on this retirement system:

1. Use a branch and pull request for substantive changes.
2. Run only targeted local checks while editing unless an interactive/manual test is specifically required.
3. Let the pull-request `Validate` GitHub Actions workflow perform the authoritative deterministic TypeScript and production Pages-build checks for the proposed commit.
4. Do not automatically repeat the same full validation locally immediately before pushing when GitHub will run it for the same commit.
5. If GitHub validation fails, inspect the failing step first and reproduce only what is needed to diagnose it.
6. Never weaken retirement calculations, source/provenance controls, scenario assumptions or deployment checks merely to make CI pass.

The Pages deployment workflow on `main` remains the canonical build/deploy path. A future repository visibility change must preserve the public Pages deployment while keeping repository source private.


## Visual regression

Pull requests that can affect the rendered site also run the bounded visual-regression workflow documented in docs/VISUAL_REGRESSION.md. It compares the PR against the exact base commit in pinned Chromium and publishes baseline/current/diff evidence.

Do not add the PR marker `Visual-Change-Approved: yes` merely to make a failing visual check pass. That marker is reserved for an intentional visual change after the evidence has been inspected and the user has explicitly approved the changed appearance.

A visual-regression failure should be diagnosed from the report artifact before broad local reruns. Fix unintended layout/style regressions; preserve the existing model and provenance gates.


## Explicit fast path

Default mode is the normal PR path with both `Validate` and `Visual regression`.

If the user explicitly says `RETIREMENT.FAST`, asks to use the old/pre-visual workflow, or explicitly asks to bypass the visual-regression overhead for that change, the agent may add this exact line to the pull-request body:

`Retirement-Fast-Path: yes`

That marker causes the required `Visual regression` check to complete successfully without installing Chromium, building the base copy, taking screenshots, or producing visual-diff artifacts. The separate `Validate` workflow still runs exactly as before the visual-regression system was introduced.

Do not use the marker by default, infer it from urgency, or add it merely because visual regression fails. It is an explicit user-selected execution mode.

The fast path does not authorize bypassing model/source/provenance checks, TypeScript/build validation, branch protection, or the normal Pages deployment from `main`.
