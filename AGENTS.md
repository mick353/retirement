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

## Hostplus Command Centre hosting boundary

Owner decision dated 2026-10-07: the private `mick353/hostplus-command-centre` application may use its existing private ChatGPT Site or an owner-controlled local-PC website/runtime. The earlier Vercel experiment is retired. Do not reconnect Vercel, recreate its deployment configuration, propose it as a fallback, or introduce another third-party host for the Hostplus application unless the owner explicitly changes this decision.


## Visual regression

The bounded visual-regression workflow documented in docs/VISUAL_REGRESSION.md is MANUAL ONLY (since 2026-10-03). It no longer runs on pull requests and is not a required check; Validate remains the required gate. Run it from the Actions tab only when the owner asks for a visual comparison. It compares the selected branch against a chosen base in pinned Chromium and publishes baseline/current/diff evidence.

Do not add the PR marker `Visual-Change-Approved: yes` merely to make a failing visual check pass. That marker is reserved for an intentional visual change after the evidence has been inspected and the user has explicitly approved the changed appearance.

A visual-regression failure should be diagnosed from the report artifact before broad local reruns. Fix unintended layout/style regressions; preserve the existing model and provenance gates.
