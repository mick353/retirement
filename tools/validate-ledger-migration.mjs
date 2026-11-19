import assert from "node:assert/strict";
import vm from "node:vm";
import { legacyDashboardSource, legacyAtlasSource, legacyMonteCarloSource } from "./fixtures/pass2-legacy-ledgers.mjs";

export function validateLedgerMigration({ core, browserEngine, dashboard, atlasSource, compile, runCommonJs }) {
  // Freeze the old minimum-rate convention too, so sharing the new core cannot
  // make the old and new implementations agree accidentally.
  const frozenMinimum = (age) => age < 65 ? .04 : age < 75 ? .05 : age < 80 ? .06 : age < 85 ? .07 : age < 90 ? .09 : age < 95 ? .11 : .14;
  const oldDashboard = runCommonJs(compile(
    "const POOL_C_DRAG=.0035; const abpMinimumRateAtAgeOn1July=" + frozenMinimum.toString() + ";\n" +
    legacyDashboardSource + "\nconst clamp=(v,min,max)=>Math.max(min,Math.min(max,v));\n" +
    legacyMonteCarloSource + "\nmodule.exports={operationalLedger,monteCarloFan,grossForNet};"
  ), () => { throw new Error("Frozen ledger has no dependencies"); });
  function atlasModel(source) {
    const context = { URLSearchParams, location: { search: "" }, globalThis: { RetirementEngine: browserEngine } };
    vm.createContext(context);
    vm.runInContext(source + "\nthis.ledger=operationalLedger;", context);
    return context;
  }
  const oldAtlas = atlasModel('const POOL_C_DRAG=.0035; const state={taxYear:"2026-27"};\n' + legacyAtlasSource);
  const currentAtlas = atlasModel(atlasSource.slice(atlasSource.indexOf('"use strict";'), atlasSource.indexOf("  function endingAt(")));
  const rails = [core.RAIL_A_SOURCE, ...Object.entries(core.PSS_PROJECTION_BASES).flatMap(([basis, config]) =>
    Object.keys(config.elections).map((key) => core.railBOpeningPosition(key, basis)))];
  // Include non-Robinson inputs to guard the calculation interface, without
  // adding a public template or changing personal source assumptions.
  rails.push({poolA:0,poolC:0,netPension:0}, {poolA:120000,poolC:45000,netPension:20000});
  const json = (value) => JSON.parse(JSON.stringify(value));
  let cases = 0;
  let correctedRows = 0;
  for (const rail of rails) for (const spend of [0,76000,90000,110000,167104,300000]) {
    for (const rate of [0,.02,.05,.065,.075]) for (const taxYear of ["2026-27","2027-28"]) {
      const expected = oldDashboard.operationalLedger(rail,spend,rate,taxYear);
      const actual = dashboard.operationalLedger(rail,spend,rate,taxYear);
      assert.deepEqual(json(actual),json(expected), "Command Centre full-row parity");
      vm.runInContext("state.taxYear="+JSON.stringify(taxYear),oldAtlas);
      vm.runInContext("state.taxYear="+JSON.stringify(taxYear),currentAtlas);
      assert.deepEqual(json(currentAtlas.ledger(rail,spend,rate)),json(oldAtlas.ledger(rail,spend,rate)), "Atlas full-row parity");
      const input={...rail,spend,realReturn:rate};
      const engineRows=core.calculateFlatRetirementLedger(input);
      assert.deepEqual(json(browserEngine.calculateFlatRetirementLedger(input)),json(engineRows),"Browser/source engine parity");
      engineRows.forEach((row,i)=>{
        assert.equal(row.ending,expected[i].ending);
        assert.equal(row.poolA,expected[i].abp);
        assert.equal(row.poolC,expected[i].poolC);
        assert.equal(row.shortfall,expected[i].shortfall);
        if(i) {
          assert.ok(Math.abs(row.fundedSpend+row.shortfall-spend)<1e-7,"Spending reconciles");
          assert.ok(row.poolA>=0 && row.poolC>=0,"Balances remain non-negative");
        }
      });
      cases++;
    }
    for (const sequence of [
      Array.from({length:35},(_,i)=>i===0?-.55:.065),
      Array.from({length:35},(_,i)=>i%2?-.2:.3),
      [.02,0,-.1],
    ]) {
      const taxYear = "2026-27";
      const legacy = oldDashboard.operationalLedger(rail, spend, .05, taxYear, sequence);
      const expected = legacy.map((row, index) => {
        if (index === 0) return row;
        const rate = sequence[index - 1] ?? .05;
        const available = legacy[index - 1].abp * (1 + rate);
        if (row.draw <= available) return row;
        correctedRows++;
        const netIncome = row.pension + available;
        return {
          ...row,
          draw: available,
          netIncome,
          fundedSpend: Math.min(spend, netIncome),
          shortfall: Math.max(0, spend - netIncome),
          grossEquivalent: oldDashboard.grossForNet(netIncome, taxYear),
        };
      });
      assert.deepEqual(json(dashboard.operationalLedger(rail, spend, .05, taxYear, sequence)), json(expected), "Volatile rows match the frozen ledger except for corrected withdrawal cash flow");
      const input = { ...rail, spend, realReturn: .05, annualReturns: sequence };
      const engineRows = core.calculateFlatRetirementLedger(input);
      assert.deepEqual(json(browserEngine.calculateFlatRetirementLedger(input)), json(engineRows), "Browser/source engine parity for sampled returns");
      assert.deepEqual(Array.from(engineRows, row => row.ending), Array.from(legacy, row => row.ending), "Sampled balances match the frozen ledger");
      for (const row of engineRows) {
        assert.ok(Math.abs(row.ending - (row.opening + row.investmentGrowth - row.draw + row.reinvestment)) < 1e-7, "Volatile ledger reconciles");
      }
      cases++;
    }
  }
  for (const rail of rails.slice(0,8)) for (const spend of [90000,167104]) {
    assert.deepEqual(json(dashboard.monteCarloFan(rail,spend,.065,"2026-27",.12,30,20260814)),
      json(oldDashboard.monteCarloFan(rail,spend,.065,"2026-27",.12,30,20260814)),
      "Seeded Monte Carlo: every path and percentile matches the frozen baseline");
  }
  console.log("Seeded risk parity: 16 scenarios, 480 paths and all percentiles unchanged.");
  assert.ok(correctedRows > 0, "Sampled fixtures must exercise the corrected loss-year withdrawal");
  const lossYear = { poolA: 100_000, poolC: 50_000, netPension: 100_000, spend: 200_000, realReturn: .05, annualReturns: [-.30], poolCDrag: 0, endAge: 61 };
  const reserve = core.calculateFlatRetirementLedger(lossYear)[1];
  assert.deepEqual([reserve.draw, reserve.fundedSpend, reserve.shortfall, reserve.ending], [70_000, 170_000, 30_000, 35_000]);
  const gapCover = core.calculateFlatRetirementLedger({ ...lossYear, drawPoolCForShortfall: true })[1];
  assert.deepEqual([gapCover.draw, gapCover.poolCDraw, gapCover.fundedSpend, gapCover.shortfall, gapCover.ending], [70_000, 30_000, 200_000, 0, 5_000]);
  assert.equal(core.calculateFlatRetirementLedger({poolA:100,poolC:0,netPension:0,spend:0,realReturn:0,startAge:57,endAge:60}).length,4);
  console.log(`Pass 2 frozen-ledger parity: ${cases} scenarios. The ${correctedRows} corrected volatile cash-flow rows reconcile and all balances match the frozen baseline.`);
}
