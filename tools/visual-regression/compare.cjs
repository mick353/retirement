#!/usr/bin/env node
const { createRequire } = require("node:module");
const fs = require("node:fs");
const path = require("node:path");

const modulesRoot = process.env.VISUAL_QA_MODULES;
if (!modulesRoot) throw new Error("VISUAL_QA_MODULES is required");
const requireFromTools = createRequire(path.join(modulesRoot, "package.json"));
const pixelmatch = requireFromTools("pixelmatch");
const { PNG } = requireFromTools("pngjs");

function arg(name, fallback) {
  const index = process.argv.indexOf("--" + name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}
function norm(value) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
}
function pct(value) {
  return (value * 100).toFixed(3) + "%";
}

const baselineDir = arg("baseline", null);
const currentDir = arg("current", null);
const reportDir = arg("report", null);
const configPath = arg("config", "visual-qa/config.json");
if (!baselineDir || !currentDir || !reportDir) {
  throw new Error("usage: compare.cjs --baseline <dir> --current <dir> --report <dir>");
}

const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const baseline = JSON.parse(fs.readFileSync(path.join(baselineDir, "measurements.json"), "utf8"));
const current = JSON.parse(fs.readFileSync(path.join(currentDir, "measurements.json"), "utf8"));
const approved = String(process.env.VISUAL_CHANGE_APPROVED || "").toLowerCase() === "true";
fs.mkdirSync(reportDir, { recursive: true });

function copyAsset(source, name) {
  fs.copyFileSync(source, path.join(reportDir, name));
  return name;
}

const results = [];
for (const item of config.cases) {
  const baseCase = baseline.cases[item.id];
  const currentCase = current.cases[item.id];
  if (!baseCase || !currentCase) throw new Error("Missing capture case " + item.id);

  const basePng = PNG.sync.read(fs.readFileSync(path.join(baselineDir, baseCase.screenshot)));
  const currentPng = PNG.sync.read(fs.readFileSync(path.join(currentDir, currentCase.screenshot)));
  const dimensionMismatch = basePng.width !== currentPng.width || basePng.height !== currentPng.height;
  let diffPixels = basePng.width * basePng.height;
  let pixelRatio = 1;
  let diffName = null;

  if (!dimensionMismatch) {
    const diff = new PNG({ width: basePng.width, height: basePng.height });
    diffPixels = pixelmatch(
      basePng.data,
      currentPng.data,
      diff.data,
      basePng.width,
      basePng.height,
      { threshold: 0.1, includeAA: false }
    );
    pixelRatio = diffPixels / (basePng.width * basePng.height);
    diffName = item.id + ".diff.png";
    fs.writeFileSync(path.join(reportDir, diffName), PNG.sync.write(diff));
  }

  const styleDiffs = [];
  for (const selector of item.selectors) {
    const left = baseCase.observed.styles[selector];
    const right = currentCase.observed.styles[selector];
    if (!left || !right) {
      if (Boolean(left) !== Boolean(right)) {
        styleDiffs.push({ selector, kind: "presence", baseline: Boolean(left), current: Boolean(right) });
      }
      continue;
    }
    for (const prop of Object.keys(left.properties)) {
      const expected = left.properties[prop];
      const actual = right.properties[prop];
      if (norm(expected) !== norm(actual)) {
        styleDiffs.push({ selector, kind: "style", property: prop, baseline: expected, current: actual });
      }
    }
    for (const dimension of ["width", "height"]) {
      const expected = left.rect[dimension];
      const actual = right.rect[dimension];
      if (Math.abs(expected - actual) > config.geometryTolerancePx) {
        styleDiffs.push({ selector, kind: "geometry", property: dimension, baseline: expected, current: actual });
      }
    }
  }

  const baseOverflow = baseCase.observed.horizontalOverflow;
  const currentOverflow = currentCase.observed.horizontalOverflow;
  const overflowRegression = currentOverflow > 2 && currentOverflow > baseOverflow + 2;
  const browserErrors = [].concat(currentCase.pageErrors || [], currentCase.consoleErrors || []);
  const pixelFailure = dimensionMismatch || pixelRatio > config.pixelDiffThreshold;
  const failed = pixelFailure || styleDiffs.length > 0 || overflowRegression || browserErrors.length > 0;

  const baselineName = copyAsset(path.join(baselineDir, baseCase.screenshot), item.id + ".baseline.png");
  const currentName = copyAsset(path.join(currentDir, currentCase.screenshot), item.id + ".current.png");

  results.push({
    id: item.id,
    path: item.path,
    viewport: item.width + "x" + item.height,
    failed,
    status: failed ? (approved ? "APPROVED_CHANGE" : "FAIL") : "PASS",
    pixelRatio,
    diffPixels,
    threshold: config.pixelDiffThreshold,
    dimensionMismatch,
    styleDiffs,
    baselineOverflow: baseOverflow,
    currentOverflow,
    overflowRegression,
    browserErrors,
    images: { baseline: baselineName, current: currentName, diff: diffName }
  });
}

const failures = results.filter(row => row.failed);
const status = failures.length === 0 ? "PASS" : (approved ? "PASS_WITH_EXPLICIT_VISUAL_APPROVAL" : "FAIL");
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  approved,
  marker: "Visual-Change-Approved: yes",
  status,
  pixelDiffThreshold: config.pixelDiffThreshold,
  geometryTolerancePx: config.geometryTolerancePx,
  checked: config.checked,
  notChecked: config.notChecked,
  summary: { total: results.length, passed: results.length - failures.length, changed: failures.length },
  results
};
fs.writeFileSync(path.join(reportDir, "report.json"), JSON.stringify(report, null, 2));

let rows = "";
for (const row of results) {
  const css = row.status === "PASS" ? "pass" : (row.status === "FAIL" ? "fail" : "approved");
  let links = '<a href="' + row.images.baseline + '">baseline</a> · <a href="' + row.images.current + '">current</a>';
  if (row.images.diff) links += ' · <a href="' + row.images.diff + '">diff</a>';
  rows += "<tr><td><strong>" + row.id + "</strong><br><small>" + row.viewport + "</small></td>";
  rows += '<td class="' + css + '">' + row.status + "</td>";
  rows += "<td>" + pct(row.pixelRatio) + "</td><td>" + row.styleDiffs.length + "</td><td>" + row.currentOverflow + "px</td><td>" + links + "</td></tr>";
}

const checked = config.checked.map(x => "<li>" + x + "</li>").join("");
const notChecked = config.notChecked.map(x => "<li>" + x + "</li>").join("");
const html = '<!doctype html><meta charset="utf-8"><title>Retirement visual regression</title>' +
  '<style>body{font:14px/1.45 system-ui,sans-serif;max-width:1100px;margin:32px auto;padding:0 18px;color:#162033}h1{margin-bottom:4px}.pass{color:#087a45}.fail{color:#b42318}.approved{color:#9a6700}table{width:100%;border-collapse:collapse;margin:22px 0}th,td{padding:10px;border-bottom:1px solid #d8dee9;text-align:left}code{background:#f1f4f8;padding:2px 5px;border-radius:4px}.note{padding:12px 14px;background:#f5f7fa;border-radius:8px}</style>' +
  "<h1>Retirement visual regression</h1><p>Status: <strong>" + status + "</strong> · " + failures.length + " of " + results.length + " cases changed.</p>" +
  '<p class="note">This compares the PR against its exact current base commit in the same pinned Chromium environment. Intentional visual change requires explicit approval in the PR body.</p>' +
  "<table><thead><tr><th>Case</th><th>Status</th><th>Pixel diff</th><th>Style/geometry diffs</th><th>Overflow</th><th>Evidence</th></tr></thead><tbody>" + rows + "</tbody></table>" +
  "<h2>Checked</h2><ul>" + checked + "</ul><h2>Not checked</h2><ul>" + notChecked + "</ul>";
fs.writeFileSync(path.join(reportDir, "report.html"), html);

const lines = [
  "## Retirement visual regression",
  "",
  "**" + status + "** — " + failures.length + " of " + results.length + " cases changed.",
  "",
  "| Case | Status | Pixel diff | Style/geometry diffs | Overflow |",
  "|---|---:|---:|---:|---:|"
];
for (const row of results) {
  lines.push("| " + row.id + " | " + row.status + " | " + pct(row.pixelRatio) + " | " + row.styleDiffs.length + " | " + row.currentOverflow + "px |");
}
lines.push("");
lines.push("The uploaded retirement-visual-report artifact contains baseline/current/diff PNGs plus report.html and report.json.");
if (failures.length && !approved) {
  lines.push("For an intentional visual change, inspect the artifact first. Only after explicit user approval add Visual-Change-Approved: yes to the PR body and rerun.");
}
const markdown = lines.join("\n") + "\n";
fs.writeFileSync(path.join(reportDir, "summary.md"), markdown);
console.log(markdown);

if (failures.length && !approved) process.exit(1);
