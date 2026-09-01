import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

const normalise = (source) => source.replace(/\r\n/g, "\n");
const dashboardSource = normalise(await readFile(new URL("../app/retirement-dashboard.tsx", import.meta.url), "utf8"));
const coreSource = normalise(await readFile(new URL("../app/retirement-core.ts", import.meta.url), "utf8"));
const atlasSource = normalise(await readFile(new URL("../public/atlas.js", import.meta.url), "utf8"));
const v23Source = normalise(await readFile(new URL("../public/deep-model.html", import.meta.url), "utf8"));

function compile(source, options = {}) {
  return ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, ...options },
  }).outputText;
}

function runCommonJs(source, require) {
  const commonJsModule = { exports: {} };
  vm.runInNewContext(source, { module: commonJsModule, exports: commonJsModule.exports, require, console, Math, Number, String, Boolean, Array, Object, Set, Map, Date, JSON, Intl, URLSearchParams });
  return commonJsModule.exports;
}

const core = runCommonJs(compile(coreSource), () => { throw new Error("retirement-core has no external runtime dependencies"); });
const reactStub = { useEffect: () => undefined, useMemo: (factory) => factory(), useRef: () => ({ current: null }), useState: (value) => [value, () => undefined] };
const dashboard = runCommonJs(
  compile(`${dashboardSource}\nmodule.exports = { RAILS, PSS_ELECTIONS, PSS_ELECTION_ORDER, railBForElection, washOutcome, operationalLedger, monteCarloFan };`),
  (name) => {
    if (name === "react") return reactStub;
    if (name === "react/jsx-runtime") return { Fragment: Symbol("Fragment"), jsx: () => null, jsxs: () => null };
    if (name === "./retirement-core") return core;
    if (name === "./retirement-ai") return { default: () => null };
    throw new Error(`Unexpected dashboard dependency: ${name}`);
  },
);

const atlasPrefix = atlasSource.match(/\n  (const TBC = [\s\S]*?function washOutcome\([\s\S]*?\n  \})\n\n  const \$/)?.[1];
assert.ok(atlasPrefix, "Could not locate the Atlas model registry");
const atlasContext = { Math, Number, String, Array, Object };
vm.createContext(atlasContext);
vm.runInContext(`${atlasPrefix}\nthis.MODEL={RAILS,PSS_ELECTIONS,railBForElection,washOutcome};`, atlasContext);
const atlas = atlasContext.MODEL;

function makeChartStub() {}
makeChartStub.register = () => undefined;
makeChartStub.defaults = { plugins: { legend: { labels: {} }, tooltip: {} }, color: "", borderColor: "", backgroundColor: "" };
const v23Scripts = [...v23Source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map((match) => match[1]).filter((source) => source.trim());
const v23Context = {
  console, Math, Date, JSON, Number, String, Boolean, Array, Object, Map, Set, Intl, URLSearchParams,
  setTimeout: () => 0, clearTimeout: () => undefined, alert: () => undefined, requestAnimationFrame: () => undefined,
  localStorage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
  document: { addEventListener: () => undefined, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], documentElement: { setAttribute: () => undefined } },
  window: { location: { search: "" } }, Chart: makeChartStub,
};
vm.createContext(v23Context);
vm.runInContext(v23Scripts[0], v23Context);
const v23 = (expression) => vm.runInContext(expression, v23Context);

const expectedElections = {
  "60-40": { grossPension: 91_776.03, netPension: 86_240.18, lumpSum: 673_024.21, lumpTaxFree: 160_278.23, lumpTaxableTaxed: 512_745.98, poolA: 626_583.52, poolC: 363_888.35, dbSpecialValue: 1_468_416.48, maxCycles: 6 },
  "65-35": { grossPension: 99_424.03, netPension: 93_888.34, lumpSum: 588_896.19, lumpTaxFree: 140_243.46, lumpTaxableTaxed: 448_652.73, poolA: 504_215.52, poolC: 402_128.33, dbSpecialValue: 1_590_784.48, maxCycles: 5 },
  "70-30": { grossPension: 107_072.03, netPension: 101_536.24, lumpSum: 504_768.16, lumpTaxFree: 120_208.67, lumpTaxableTaxed: 384_559.49, poolA: 381_847.52, poolC: 440_368.30, dbSpecialValue: 1_713_152.48, maxCycles: 4 },
  "100": { grossPension: 152_960.05, netPension: 143_104.26, lumpSum: 0, lumpTaxFree: 0, lumpTaxableTaxed: 0, poolA: 0, poolC: 317_447.66, dbSpecialValue: 2_447_360.80, maxCycles: 0 },
};
assert.deepEqual(Array.from(dashboard.PSS_ELECTION_ORDER), ["60-40", "65-35", "70-30", "100"], "Command Centre election order");

const close = (actual, expected, message) => assert.ok(Math.abs(Number(actual) - expected) < 0.011, `${message}: expected ${expected}, got ${actual}`);
for (const [key, expected] of Object.entries(expectedElections)) {
  const commandElection = dashboard.PSS_ELECTIONS[key];
  const atlasElection = atlas.PSS_ELECTIONS[key];
  const commandRail = dashboard.railBForElection(key);
  const atlasRail = atlas.railBForElection(key);
  const v23Election = v23(`PSS_ELECTIONS[${JSON.stringify(key)}]`);
  const v23Rail = v23(`railBProfileForElection(${JSON.stringify(key)})`);
  for (const field of ["grossPension", "netPension", "lumpSum", "lumpTaxFree", "lumpTaxableTaxed"]) {
    close(commandElection[field], expected[field], `Command Centre ${key} ${field}`);
    close(atlasElection[field], expected[field], `Atlas ${key} ${field}`);
    close(v23Election[field], expected[field], `V23 ${key} ${field}`);
  }
  for (const [field, expectedField] of [["poolA", "poolA"], ["poolC", "poolC"], ["dbSpecialValue", "dbSpecialValue"]]) {
    close(commandRail[field], expected[expectedField], `Command Centre ${key} ${field}`);
    close(atlasRail[field], expected[expectedField], `Atlas ${key} ${field}`);
  }
  close(v23Rail.poolA_day1, expected.poolA, `V23 ${key} poolA`);
  close(v23Rail.poolC_day1, expected.poolC, `V23 ${key} poolC`);
  close(v23Rail.dbSpecialValue, expected.dbSpecialValue, `V23 ${key} special value`);
  assert.equal(dashboard.washOutcome(commandRail, 99).maxCycles, expected.maxCycles, `Command Centre ${key} wash limit`);
  assert.equal(atlas.washOutcome(atlasRail, 99).maxCycles, expected.maxCycles, `Atlas ${key} wash limit`);
  assert.equal(v23Rail.washMax, expected.maxCycles, `V23 ${key} wash limit`);
}

const expectedRailA = { lumpTaxFree: 141_581.47, lumpTaxableTaxed: 433_220.20, lumpTaxableUntaxed: 0 };
for (const [field, value] of Object.entries(expectedRailA)) {
  close(dashboard.RAILS.A[field], value, `Command Centre Rail A ${field}`);
  close(atlas.RAILS.A[field], value, `Atlas Rail A ${field}`);
}
close(v23("PROFILES.michael.lumpTaxFree"), expectedRailA.lumpTaxFree, "V23 Rail A tax-free component");
close(v23("PROFILES.michael.lumpTaxableTaxed"), expectedRailA.lumpTaxableTaxed, "V23 Rail A taxable-taxed component");

for (const key of Object.keys(expectedElections)) {
  const rail = dashboard.railBForElection(key);
  for (const spend of [90_000, 100_000, 110_000, 130_000]) {
    for (const taxYear of ["2026-27", "2027-28"]) {
      const deterministic = Array.from(dashboard.operationalLedger(rail, spend, 0.05, taxYear), (row) => row.ending);
      const fan = dashboard.monteCarloFan(rail, spend, 0.05, taxYear, 0, 9, 20260814);
      assert.deepEqual(Array.from(fan.p50), deterministic, `Zero-volatility median (${key}, ${spend}, ${taxYear})`);
      fan.paths.forEach((yearValues, index) => assert.ok(Array.from(yearValues).every((value) => value === deterministic[index]), `Zero-volatility paths (${key}, ${spend}, ${taxYear}, age ${60 + index})`));
    }
  }
}

const hundred = dashboard.railBForElection("100");
for (const spend of [90_000, 100_000, 110_000, 130_000]) {
  const row = dashboard.operationalLedger(hundred, spend, 0.05, "2026-27")[1];
  close(row.draw, 0, `Command Centre 100% ${spend} portfolio draw`);
  close(row.fundedSpend, spend, `Command Centre 100% ${spend} funded spend`);
  close(row.reinvestment, hundred.netPension - spend, `Command Centre 100% ${spend} PSS surplus`);
  const v23Row = v23(`(()=>{const p=railBProfileForElection("100");STATE.totalSpendTarget=${spend};STATE.gapBands=[{age:60,amount:0,unit:"dollar"}];return runModel({profile:p,abpReturn:.05,accumReturn:.0425}).rows[1]})()`);
  close(v23Row.realExit + v23Row.extraDraw, 0, `V23 100% ${spend} portfolio draw`);
  close(v23Row.fundedTotalSpend, spend, `V23 100% ${spend} funded spend`);
  close(v23Row.pensionSurplus, hundred.netPension - spend, `V23 100% ${spend} PSS surplus`);
  close(v23Row.pensionToPoolC, hundred.netPension - spend, `V23 100% ${spend} Pool C routing`);
}

assert.match(atlasSource, /pss:\s*state\.pssElection/, "Atlas shared links carry the PSS election");
assert.match(v23Source, /pss:scenario\.pssElection/, "V23 shared links carry the PSS election");
assert.match(v23Source, /version:5/, "V23 stores the current shared-scenario schema");
console.log("Retirement election registry, source-limited wash, surplus routing and zero-volatility invariants passed across Command Centre, Atlas and V23.");
