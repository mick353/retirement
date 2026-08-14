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
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      ...options,
    },
  }).outputText;
}

function runCommonJs(source, require) {
  const module = { exports: {} };
  vm.runInNewContext(source, {
    module,
    exports: module.exports,
    require,
    console,
    Math,
    Number,
    String,
    Boolean,
    Array,
    Object,
    Set,
    Map,
    Date,
    JSON,
    Intl,
    URLSearchParams,
  });
  return module.exports;
}

const core = runCommonJs(compile(coreSource), () => {
  throw new Error("retirement-core has no external runtime dependencies");
});

const reactStub = {
  useEffect: () => undefined,
  useMemo: (factory) => factory(),
  useRef: () => ({ current: null }),
  useState: (value) => [value, () => undefined],
};
const dashboard = runCommonJs(
  compile(`${dashboardSource}\nmodule.exports = { RAILS, operationalLedger, monteCarloFan };`),
  (name) => {
    if (name === "react") return reactStub;
    if (name === "react/jsx-runtime") return { Fragment: Symbol("Fragment"), jsx: () => null, jsxs: () => null };
    if (name === "./retirement-core") return core;
    if (name === "./retirement-ai") return { default: () => null };
    throw new Error(`Unexpected dashboard dependency: ${name}`);
  },
);

const atlasMatch = atlasSource.match(/const RAILS = (\{[\s\S]*?\n  \});\n\n  const \$/);
assert.ok(atlasMatch, "Could not locate the Atlas rail registry");
const atlasRails = vm.runInNewContext(`(${atlasMatch[1]})`);

const expectedRails = {
  A: {
    fas: 143_700.42,
    grossPension: 78_382.04,
    netPension: 76_041.68,
    lumpSum: 574_801.66,
    capital: 892_249.32,
    poolA: 840_887.36,
    poolC: 51_361.96,
    dbSpecialValue: 1_254_112.64,
    washTaxableShare: 0.709677,
  },
  B: {
    fas: 151_343.31,
    grossPension: 82_550.89,
    netPension: 76_302.72,
    lumpSum: 605_373.22,
    capital: 922_820.88,
    poolA: 774_185.76,
    poolC: 148_635.12,
    dbSpecialValue: 1_320_814.24,
    washTaxableShare: 0.709677,
  },
};

for (const [railKey, expected] of Object.entries(expectedRails)) {
  for (const [field, value] of Object.entries(expected)) {
    assert.equal(dashboard.RAILS[railKey][field], value, `Command Centre Rail ${railKey} ${field}`);
    assert.equal(atlasRails[railKey][field], value, `Atlas Rail ${railKey} ${field}`);
  }
}

assert.equal(atlasRails.A.lumpTaxFree, null, "Rail A components remain intentionally unresolved");
assert.equal(atlasRails.A.lumpTaxableTaxed, null, "Rail A components remain intentionally unresolved");
assert.equal(atlasRails.B.lumpTaxFree, 175_753.71, "Rail B tax-free component");
assert.equal(atlasRails.B.lumpTaxableTaxed, 429_619.52, "Rail B taxable-taxed component");

const v23RailA = v23Source.match(/michael:\s*\{([\s\S]*?)\n  \},\n  custom:/)?.[1] ?? "";
for (const [field, value] of Object.entries({
  grossPension: 78_382,
  netPension: 76_042,
  lumpSum: 574_802,
  poolA_day1: 840_887,
  poolC_day1: 51_362,
  dbSpecialValue: 1_254_112.64,
  washTaxableShare: 0.709677,
})) {
  assert.match(v23RailA, new RegExp(`${field}:${String(value).replace(".", "\\.")}`), `V23 rounded Rail A ${field}`);
}

const v23RailB = v23Source.match(/name:"Rail B shared"([\s\S]*?)\n      \}\);/)?.[1] ?? "";
for (const [field, value] of Object.entries({
  grossPension: 82_550.89,
  lumpSum: 605_373.22,
  poolA_day1: 774_185.76,
  poolC_day1: 148_635.12,
  dbSpecialValue: 1_320_814.24,
  washTaxableShare: 0.709677,
})) {
  assert.match(v23RailB, new RegExp(`${field}:${String(value).replace(".", "\\.")}`), `V23 Rail B ${field}`);
}
assert.match(v23Source, /const netPension=isRailB\?76302\.72:76041\.68/, "V23 shared rail pension source");
assert.match(v23RailB, /netPension:netPension/, "V23 shared Rail B pension binding");

for (const rail of Object.values(dashboard.RAILS)) {
  for (const spend of [90_000, 110_000, 130_000]) {
    for (const taxYear of ["2026-27", "2027-28"]) {
      const deterministic = Array.from(dashboard.operationalLedger(rail, spend, 0.05, taxYear), (row) => row.ending);
      const fan = dashboard.monteCarloFan(rail, spend, 0.05, taxYear, 0, 9, 20260814);
      assert.deepEqual(Array.from(fan.p50), deterministic, `Zero-volatility median must equal deterministic ledger (${rail.key}, ${spend}, ${taxYear})`);
      fan.paths.forEach((yearValues, index) => {
        assert.ok(Array.from(yearValues).every((value) => value === deterministic[index]), `Zero-volatility paths must match the deterministic ledger (${rail.key}, ${spend}, ${taxYear}, age ${60 + index})`);
      });
    }
  }
}

console.log("Retirement registry and zero-volatility Monte Carlo invariants passed.");
