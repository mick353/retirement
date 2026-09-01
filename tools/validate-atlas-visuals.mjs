import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const html = fs.readFileSync(path.join(root, "public", "atlas.html"), "utf8");
const script = fs.readFileSync(path.join(root, "public", "atlas.js"), "utf8");
const css = fs.readFileSync(path.join(root, "public", "atlas.css"), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const modes = ["horizon", "river", "orbit", "waterfall", "sunburst", "table"];
const htmlModes = [...html.matchAll(/data-visual-mode="([^"]+)"/g)].map((match) => match[1]);
assert(JSON.stringify(htmlModes) === JSON.stringify(modes), `Atlas mode order drifted: ${htmlModes.join(", ")}`);

for (const mode of modes) {
  assert(new RegExp(`\\b${mode}:\\s*\\{`).test(script), `Missing visual copy/configuration for ${mode}`);
}

const htmlIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
const scriptIds = new Set([...script.matchAll(/\$\("([^"]+)"\)/g)].map((match) => match[1]));
const missingIds = [...scriptIds].filter((id) => !htmlIds.has(id));
assert(missingIds.length === 0, `Atlas JavaScript references missing HTML ids: ${missingIds.join(", ")}`);

for (const required of ["visualCanvas", "visualAgeRange", "visualModeTabs", "visualInspectorCapital", "visualReturn", "visualTableBody", "visualFocusToggle"]) {
  assert(htmlIds.has(required), `Missing visual-studio control: ${required}`);
}

const electionKeys = [...html.matchAll(/data-pss-election="([^"]+)"/g)].map((match) => match[1]);
assert(JSON.stringify(electionKeys) === JSON.stringify(["60-40", "65-35", "70-30", "100"]), `Atlas election controls drifted: ${electionKeys.join(", ")}`);
assert(htmlIds.has("electionControl") && htmlIds.has("electionContext"), "Atlas election context is missing");
assert(htmlIds.has("basisCurrent") && htmlIds.has("basisPrudent") && htmlIds.has("basisBoundary"), "Atlas projection-basis controls are missing");
assert(/id="basisPrudent"[^>]*disabled/.test(html), "Unsourced prudent Atlas basis must remain disabled");
assert(script.includes("state.pssElection"), "Atlas visuals are not wired to the active PSS election");
assert(script.includes("state.pssProjectionBasis"), "Atlas is not wired to the active PSS projection basis");
assert(script.includes("lumpTaxableTaxed"), "Atlas tax visual lacks source-backed election components");

assert(script.includes("These are scenario slices, not probabilities"), "Horizon probability boundary is missing");
assert(script.includes("annual cash flows and capital stocks on separate visual scales"), "Financial River unit boundary is missing");
assert(script.includes("PSS floor remains an annual-income halo"), "Legacy Orbit income/capital boundary is missing");
assert(script.includes("state.realReturn"), "Visual studio is not wired to the active real-return state");
assert(css.includes("body.visual-focus-open .visual-studio"), "Immersive visual focus state is missing");

console.log(`Atlas visual studio validated: ${modes.length} synchronized modes and ${scriptIds.size} DOM bindings.`);
