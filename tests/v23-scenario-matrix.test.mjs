import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const v23 = await readFile(new URL("../public/deep-model.html", import.meta.url), "utf8");
const browserEngine = await readFile(new URL("../public/retirement-engine.js", import.meta.url), "utf8");
const core = [...v23.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map((match) => match[1])
  .find((script) => script.includes("const PROFILES ="));

assert.ok(core, "V23 model script is present");

const noop = () => {};
function Chart() {}
Chart.register = noop;
Chart.defaults = { plugins: { legend: { labels: {} } } };

function modelContext() {
  const context = vm.createContext({
    console,
    document: { addEventListener: noop, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
    window: {},
    localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    getComputedStyle: () => ({ getPropertyValue: () => "" }),
    matchMedia: () => ({ matches: true }),
    Chart,
    Blob: function Blob() {},
    URL: { createObjectURL: () => "", revokeObjectURL: noop },
    confirm: () => false,
    alert: noop,
    setTimeout: noop,
    clearTimeout: noop,
    Math,
    Intl,
    Float64Array,
    Array,
    Object,
    Number,
    String,
    JSON,
    Date,
  });
  vm.runInContext(browserEngine, context);
  context.window.RetirementEngine = context.RetirementEngine;
  vm.runInContext(core, context);
  return context;
}

test("V23 scenario matrix remains finite, reconciled and horizon-complete", () => {
  const context = modelContext();
  const result = JSON.parse(vm.runInContext(`(() => {
    const bases=["source-825","prudent-630"];
    const returns=[.02,.05,.065,.075];
    const policies=["preserve","after-abp"];
    const targetAges=[70,75,80,91,95];
    const schedules=[
      {name:"dollar",mode:"fixed",pct:.5,bands:[{age:60,amount:52000,unit:"dollar"},{age:68,amount:36000,unit:"dollar"},{age:75,amount:24000,unit:"dollar"},{age:82,amount:18000,unit:"dollar"}]},
      {name:"total by age",mode:"fixed",pct:.5,bands:[{age:60,amount:85000,unit:"totalDollar"},{age:70,amount:118000,unit:"totalDollar"}]},
      {name:"flat total",mode:"fixed",pct:.5,total:70000,bands:[{age:60,amount:0,unit:"dollar"}]},
      {name:"mixed",mode:"fixed",pct:.5,bands:[{age:60,amount:60,unit:"returnPct"},{age:70,amount:100,unit:"drawPct"},{age:80,amount:18000,unit:"dollar"}]},
      {name:"earnings",mode:"returnPct",pct:.65,bands:[{age:60,amount:20000,unit:"dollar"}]},
      {name:"draw",mode:"drawPct",pct:1,bands:[{age:60,amount:20000,unit:"dollar"}]}
    ];
    const cases=[];
    for(const basisKey of bases){
      const elections=Object.keys(PSS_PROJECTION_BASES[basisKey].elections);
      for(const election of elections){
        const profile=railBProfileForElection(election,basisKey);
        const capital=profile.lumpSum+profile.hostplus;
        const opening=profile.poolA_day1+profile.poolB_day1+profile.poolC_day1;
        if(Math.abs(opening-capital)>.02)throw new Error("Opening pools do not reconcile");
        if([profile.poolA_day1,profile.poolB_day1,profile.poolC_day1].some(value=>!Number.isFinite(value)||value<0))throw new Error("Invalid opening pool");
        if(profile.dbSpecialValue<=profile.tbc&&profile.dbSpecialValue+profile.poolA_day1+(profile.tsbBuffer||0)>profile.tbc+.02)throw new Error("TBC allocation exceeds planning cap");
        for(const annualReturn of returns){
          for(const schedule of schedules){
            for(const policy of policies){
            STATE.spendMode=schedule.mode;STATE.spendReturnPct=schedule.pct;STATE.gapBands=schedule.bands.map(b=>({...b}));STATE.poolCPolicy=policy;STATE.totalSpendTarget=schedule.total??null;
            const sim=runModel({profile,abpReturn:annualReturn,accumReturn:annualReturn*.85});
            if(sim.rows.length!==36||sim.rows[0].age!==60||sim.rows.at(-1).age!==95||!sim.rows[0].launchSnapshot)throw new Error("Projection horizon mismatch");
            for(const [index,row] of sim.rows.entries()){
              const numbers=[row.poolA,row.poolB,row.poolC,row.total,row.fundedGap,row.fundedTotalSpend,row.spendingShortfall,row.investmentReturn,row.poolCDraw,row.oneOffPoolCDrawn];
              if(numbers.some(value=>!Number.isFinite(value)))throw new Error("Non-finite model output");
              if([row.poolA,row.poolB,row.poolC].some(value=>value<-.02))throw new Error("Negative pool balance");
              if(Math.abs(row.total-(row.poolA+row.poolB+row.poolC))>.02)throw new Error("Pool total does not reconcile");
              if(Math.abs(cashTrace(sim.rows,index).balanceResidual)>=.005)throw new Error("Cash-flow trace does not reconcile to the cent");
              if(!row.launchSnapshot){
                if(row.fundedTotalSpend-row.targetSpend>.02)throw new Error("Funded spending exceeds target");
                if(Math.abs(row.spendingShortfall-Math.max(0,row.targetSpend-row.fundedTotalSpend))>.02)throw new Error("Shortfall does not reconcile");
                if(schedule.mode==="drawPct"&&row.gap-row.mandDraw>.02)throw new Error("Draw-percent mode exceeds compulsory payment");
                const total=schedule.total??(schedule.name==="total by age"?(row.age<=70?85000:118000):null);
                if(total!==null&&Math.abs(row.targetSpend-total)>.02)throw new Error("Total budget or birthday transition changed");
                if(total!==null&&Math.abs(row.pensionToPoolC-Math.max(0,profile.netPension-total))>.02)throw new Error("Pension surplus does not reconcile");
              }
            }
            for(const targetAge of targetAges)if(!sim.rows.some(row=>row.age===targetAge))throw new Error("Missing selected target age");
            cases.push({basisKey,election,annualReturn,schedule:schedule.name,policy,end:sim.rows.at(-1).total});
            }
          }
        }
      }
    }
    return JSON.stringify({cases,sourceElections:Object.keys(PSS_PROJECTION_BASES["source-825"].elections),prudentElections:Object.keys(PSS_PROJECTION_BASES["prudent-630"].elections)});
  })()`, context));

  assert.equal(result.cases.length, 384);
  assert.deepEqual([...result.sourceElections].sort(), ["100", "60-40", "65-35", "70-30"]);
  assert.deepEqual([...result.prudentElections].sort(), ["100", "60-40", "65-35", "70-30"]);
  assert.ok(result.cases.every((entry) => Number.isFinite(entry.end) && entry.end >= 0));
});

test("drafts explain the cashflow trade-off and use the independently replayed market paths", () => {
  const context = modelContext();
  const result = JSON.parse(vm.runInContext(`(() => {
    STATE.pssProjectionBasis="prudent-630";
    selectPssElection("70-30",{spendTarget:160000});
    Object.assign(STATE,{essentialSpending:122000,likely:.05,vol:.12,targetAge:75,simulationSeed:20260814,poolCPolicy:"preserve",oneOff:0});
    const original=captureScenarioState();
    const plans=compareDecisionDrafts(original,{budget:122000,election:"100",semantics:"total"});
    const summary=plans.map(({id,firstYearBudget,check,funding,age75})=>({id,firstYearBudget,miss:check.firstBudgetMiss?.age??null,essentialMiss:check.firstEssentialMiss?.age??null,
      unfunded:Math.round(check.planned-check.funded),capital:Math.round(age75),both:funding.lifestyleAndCapital}));
    const changed=JSON.stringify(original)!==JSON.stringify(captureScenarioState());
    const bands={...original,totalSpendTarget:null,spendMode:"fixed",gapGrowth:0,gapBands:[{age:60,amount:24000,unit:"dollar",startOnBirthday:false},{age:70,amount:18000,unit:"dollar",startOnBirthday:true}]};
    const sameTotal=decisionDraftPlans(bands,{election:"100",semantics:"total"}).find(plan=>plan.id==="election");
    const sameGap=decisionDraftPlans(bands,{election:"100",semantics:"gap"}).find(plan=>plan.id==="election");
    const baseline=JSON.stringify(scenarioStateResult(bands).sim.rows.map(row=>row.targetSpend));
    const flatSameTotal=JSON.stringify(scenarioStateResult(sameTotal.state).sim.rows.map(row=>row.targetSpend));
    const altGap=scenarioStateResult(sameGap.state).sim.rows[1].gap;
    const noPct=decisionDraftPlans({...bands,gapBands:[{age:60,amount:70,unit:"drawPct"}]},{election:"100",semantics:"total"}).find(plan=>plan.id==="election");
    return JSON.stringify({summary,changed,baseline,flatSameTotal,altGap,unsupported:Boolean(noPct.state)});
  })()`, context));
  assert.equal(result.changed, false, "A comparison does not change the active plan");
  assert.deepEqual(result.summary.filter(plan => plan.id !== "election"), [
    { id: "current", firstYearBudget: 160000, miss: 69, essentialMiss: 70, unfunded: 414150, capital: 717616, both: 1 },
    { id: "budget", firstYearBudget: 122000, miss: null, essentialMiss: null, unfunded: 0, capital: 1062576, both: result.summary[1].both },
    { id: "reserve", firstYearBudget: 160000, miss: null, essentialMiss: null, unfunded: 0, capital: 247151, both: 50 },
  ]);
  assert.ok(Math.abs(result.altGap - 24000) < .005);
  assert.equal(result.baseline, result.flatSameTotal, "Fixed-band budget dollars and timing both carry to the alternate election");
  assert.equal(result.unsupported, false);
});

test("a near-floor handoff labels a different verdict across the two ledgers", () => {
  const context = modelContext();
  const result = JSON.parse(vm.runInContext(`(() => {
    STATE.pssProjectionBasis="prudent-630";
    selectPssElection("60-40",{spendTarget:80000});
    restoreCustomInputs({floor:8184});
    Object.assign(STATE,{targetAge:95,likely:.065,poolCPolicy:"preserve",oneOff:0});
    const result=flatHandoffComparison({rail:"B",pssElection:"60-40",pssProjectionBasis:"prudent-630",spend:80000,targetAge:95,realReturn:.065});
    const state=captureScenarioState();
    const receipt=detailedPlanReceipt(state);
    return JSON.stringify({flatPass:result.flatPass,detailedPass:result.detailedPass,flat:Math.round(result.flat.capital),detailed:Math.round(result.detailed.capital),receipt});
  })()`, context));
  assert.equal(result.flatPass, true);
  assert.equal(result.detailedPass, false);
  assert.equal(result.flat, 8_208_761);
  assert.equal(result.detailed, 8_158_257);
  assert.equal(result.receipt.sourceDate, "1 September 2026");
});

test("Pool C spending policy is explicit, reconciled and reduces rather than hides a shortfall", () => {
  const context = modelContext();
  const result = JSON.parse(vm.runInContext(`(() => {
    const profile=railBProfileForElection("100","source-825");
    const gapBands=[{age:60,amount:52000,unit:"dollar"}];
    const preserve=runModel({profile,abpReturn:0,accumReturn:0,gapBands,poolCPolicy:"preserve"});
    const after=runModel({profile,abpReturn:0,accumReturn:0,gapBands,poolCPolicy:"after-abp"});
    const summarise=sim=>({
      draw:sim.rows.reduce((sum,row)=>sum+(row.poolCDraw||0),0),
      shortfall:sim.rows.reduce((sum,row)=>sum+(row.spendingShortfall||0),0),
      endPoolC:sim.rows.at(-1).poolC,
      reconciled:sim.rows.every(row=>Math.abs(row.total-row.poolA-row.poolB-row.poolC)<.02)
    });
    return JSON.stringify({preserve:summarise(preserve),after:summarise(after)});
  })()`, context));

  assert.equal(result.preserve.draw, 0);
  assert.ok(result.preserve.shortfall > 0);
  assert.ok(result.after.draw > 0);
  assert.ok(result.after.shortfall < result.preserve.shortfall);
  assert.ok(result.after.endPoolC < result.preserve.endPoolC);
  assert.equal(result.preserve.reconciled, true);
  assert.equal(result.after.reconciled, true);
});

test("V23 exposes every navigation page and every page has a renderer", () => {
  const context = modelContext();
  const result = JSON.parse(vm.runInContext(`JSON.stringify({
    nav:[...${JSON.stringify([...v23.matchAll(/data-page="([a-z]+)"/g)].map((match) => match[1]))}],
    renderers:Object.keys(PAGE_RENDERERS).map(key=>key.replace(/^page-/,""))
  })`, context));
  const navPages = [...new Set(result.nav)];
  assert.ok(navPages.length >= 30);
  for (const page of navPages) assert.ok(result.renderers.includes(page), `Missing renderer for ${page}`);
});
