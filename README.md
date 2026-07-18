# Robinson Retirement Command Centre

A responsive, interactive retirement planning command centre built from the Robinson retirement model, PSS defined-benefit analysis and the corrected V23 simulation workbench.

## Live versions

- GitHub Pages: <https://mick353.github.io/retirement/>
- ChatGPT Sites: <https://robinson-retirement.mick353.chatgpt.site>
- Deep V23 workbench: <https://mick353.github.io/retirement/deep-model.html>

The main command centre and V23 workbench share scenario parameters, so a rail, spending target, return assumption, target age and home value can be carried into the deeper model.

## What is included

- Integrated command centre with dual-rail decisions and key retirement metrics
- Adjustable scenario lab and side-by-side saved-scenario comparison
- Spending and estate frontier analysis
- Monte Carlo fan chart, probability gauge and stress controls
- PSS defined-benefit, three-pool, TBC and tax/estate views
- Present-to-age-60 action plan and voluntary-redundancy analysis
- Annual review checklist and review snapshot
- Corrected V23 model with advanced controls, export, print packs and mobile workbench
- Responsive navigation, installable PWA manifest and offline app shell

## Run locally

Requirements: Node.js 22.13 or newer.

```bash
npm ci
npm run dev:pages
```

Open <http://localhost:5173/retirement/>.

To produce the same static site GitHub Pages deploys:

```bash
npm run build:pages
npm run preview:pages
```

The output is written to `dist-pages/`.

## Publishing

The workflow in `.github/workflows/pages.yml` builds and deploys the site after every push to `main`. In GitHub, select **Settings → Pages → Source: GitHub Actions** if Pages is not enabled automatically on the first run.

## Data and privacy

This repository is public and the website contains personal retirement assumptions and modelled financial figures. The source PDFs, spreadsheets and research files are intentionally not committed. Only the integrated website and its calculation logic are included.

The site stores saved scenarios and annual-review preferences only in the current browser using local storage. It has no account system or server-side database.

## Important notice

This is a personal planning model, not financial, taxation or legal advice. Outputs depend on assumptions and should be checked against current legislation, fund rules, official PSS estimates and qualified professional advice before decisions are made.
