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
