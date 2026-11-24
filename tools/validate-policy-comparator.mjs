import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

const coreSource=await readFile(new URL("../app/retirement-core.ts",import.meta.url),"utf8");
const compiled=ts.transpileModule(coreSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const engine={Math,Number,String,Boolean,Array,Object,Set,Map,Date,JSON};
vm.createContext(engine);
vm.runInContext(`{const module={exports:{}};const exports=module.exports;${compiled};globalThis.RetirementEngine=module.exports;}`,engine);
function Chart(){}
Chart.register=()=>{};
Chart.defaults={plugins:{legend:{labels:{}},tooltip:{}}};
const ctx={console,Math,Date,JSON,Number,String,Boolean,Array,Object,Map,Set,Intl,URLSearchParams,
  setTimeout:()=>0,clearTimeout:()=>{},alert:()=>{},requestAnimationFrame:()=>{},
  localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}},
  document:{addEventListener:()=>{},getElementById:()=>null,querySelector:()=>null,querySelectorAll:()=>[],documentElement:{setAttribute:()=>{}}},
  window:{location:{search:""},RetirementEngine:engine.RetirementEngine},Chart};
vm.createContext(ctx);
const html=await readFile(new URL("../public/deep-model.html",import.meta.url),"utf8");
const script=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).find(Boolean);
vm.runInContext(script,ctx);
const run=source=>vm.runInContext(source,ctx,{timeout:30000});

const checks=run(`(()=>{
  const profile=railBProfileForElection('60-40','source-825');
  const opts={profile,endAge:95,oneOff:0,gapBands:[{age:60,amount:24000,unit:'dollar'}],spendMode:'fixed',totalSpendTarget:null};
  const old=runModel(opts),advisory=runModel({...opts,policy:{mode:'advisory'}});
  const one=runModel({...opts,policy:{mode:'adaptive',essentialTotal:profile.netPension,multipliers:[1,1,1,1,1]}});
  const adaptive=runModel({...opts,policy:{mode:'adaptive',essentialTotal:profile.netPension}});
  const paths=policyReturnPaths({runs:3,years:35,mean:.05,sd:.12,seed:0});
  const zero=policyReturnPaths({runs:2,years:35,mean:.05,sd:0,seed:0});
  const total=comparatorCandidates(profile,'total','70-30');
  const gap=comparatorCandidates(profile,'gap','70-30');
  const totalRuns=total.map(c=>runModel({...c.options,endAge:61,policy:{mode:'advisory'}}).rows[1]);
  const gapRuns=gap.map(c=>runModel({...c.options,endAge:61,policy:{mode:'advisory'}}).rows[1]);
  const decisions=[{A:-.3,B:-.255},{A:.3,B:.255}].map(r=>runModel({...opts,endAge:61,annualReturns:[r],policy:{mode:'adaptive',essentialTotal:profile.netPension}}).rows[1].policyMultiplier);
  return{off:JSON.stringify(old)===JSON.stringify(advisory),one:one.rows.every((r,i)=>Math.abs(r.total-old.rows[i].total)<.001&&Math.abs(r.fundedTotalSpend-old.rows[i].fundedTotalSpend)<.001),
    changed:adaptive.rows.some((r,i)=>Math.abs(r.total-old.rows[i].total)>1),
    sameOpeningDecision:decisions[0]===decisions[1],
    pathsDifferent:JSON.stringify(paths[0])!==JSON.stringify(paths[1]),
    pathsRepeat:JSON.stringify(paths)===JSON.stringify(policyReturnPaths({runs:3,years:35,mean:.05,sd:.12,seed:0})),
    zeroVol:zero.every(path=>path.every(y=>y.A===.05&&y.B===.05*.85)),
    totalEqual:Math.abs(totalRuns[0].targetSpend-totalRuns[1].targetSpend)<.001,
    gapEqual:Math.abs(gapRuns[0].gap-gapRuns[1].gap)<.001,
    totalProfilesDifferent:total[0].profile.netPension!==total[1].profile.netPension,
    summary:policySummary(adaptive,profile,[{age:75,kind:'hard',amount:1e12},{age:85,kind:'informational',amount:null}])
  };
})()`);
for(const key of ["off","one","changed","sameOpeningDecision","pathsDifferent","pathsRepeat","zeroVol","totalEqual","gapEqual","totalProfilesDifferent"])assert.equal(checks[key],true,key);
assert.equal(checks.summary.hardBreach,true);
assert.equal(checks.summary.binding.age,75);
assert.equal(checks.summary.constraints[1].breach,false);
const ageWindows=run(`(()=>{const p=railBProfileForElection('60-40','source-825');const sim=runModel({profile:p,endAge:75,abpReturn:0,accumReturn:0,poolCDrag:0,totalSpendTarget:110000,gapGrowth:0,oneOff:0,spendMode:'fixed',policy:{mode:'advisory'}});const s=policySummary(sim,p,[],70000);return{operating:sim.rows.filter(r=>!r.launchSnapshot).length,ten:s.funded60to69,fifteen:s.funded60to74,discretionary:s.discretionary60to74};})()`);
assert.equal(ageWindows.operating,15,"Age 60 is an opening snapshot followed by fifteen spending years through age 75");
assert.equal(ageWindows.ten,10*110000,"Age 60–69 must include ten funded spending years");
assert.equal(ageWindows.fifteen,15*110000,"Age 60–74 must include fifteen funded spending years");
assert.equal(ageWindows.discretionary,15*(110000-70000),"Discretionary age 60–74 must use the same fifteen years");
const earlyWindows=run(`(()=>{const profile=railBProfileForElection("70-30","prudent-630");return policySummary(runModel({profile,startAge:55,endAge:75,oneOff:0,totalSpendTarget:90000,gapGrowth:0}),profile,[],70000);})()`);
assert.equal(earlyWindows.funded60to69,900000,"Spending before 60 does not count in the ten-year window");
assert.equal(earlyWindows.funded60to74,1350000,"Spending before 60 does not count in the fifteen-year window");
assert.equal(earlyWindows.discretionary60to74,300000,"Discretionary spending uses the same lower bound");
assert.equal(run(`(()=>{
  const old={...STATE};
  STATE.pssProjectionBasis="prudent-630";
  const p=railBProfileForElection("70-30","prudent-630");
  STATE.gapGrowth=.02;
  const correct=[122000,90000].every(total=>{
    STATE.totalSpendTarget=total;
    const base=runModel({profile:p}).rows;
    const [current,other]=comparatorCandidates(p,"gap","100").map(candidate=>runModel(candidate.options).rows);
    return base.every((row,i)=>row.total===current[i].total&&row.targetSpend===current[i].targetSpend&&Math.abs(row.gap-other[i].gap)<.005);
  });
  Object.assign(STATE,old);
  return correct;
})()`),true,"Same gap replays the current plan and matches each future year's additional spend");
assert.equal(run("pairedPolicyOutcome({age85:200,funded60to74:100,hardBreach:false,shortfallYears:0,coreShortfallYears:0},{age85:150,funded60to74:90,hardBreach:false,anyCutOver10:false,shortfallYears:0,coreShortfallYears:0}).better85"),false);
assert.equal(run(`(()=>{const p=railBProfileForElection('60-40','source-825');const paths=policyReturnPaths({runs:2,years:35,mean:.05,sd:0,seed:0});const opts={profile:p,endAge:95,abpReturn:.05,accumReturn:.05*.85,gapBands:[{age:60,amount:24000,unit:'dollar'}],totalSpendTarget:null,oneOff:0};return paths.every(path=>['advisory','adaptive'].every(mode=>{const policy={mode,essentialTotal:70000};return JSON.stringify(runModel({...opts,policy}).rows)===JSON.stringify(runModel({...opts,annualReturns:path,policy}).rows)}));})()`),true,"Zero volatility must equal deterministic for each policy");
assert.equal(run(`(()=>{const prior=STATE.gapGrowth;STATE.gapGrowth=.03;const p=railBProfileForElection('60-40','source-825');const c=comparatorCandidates(p,'total','70-30');const rows=c.map(x=>runModel({...x.options,endAge:85}).rows);STATE.gapGrowth=prior;return rows[0].every((r,i)=>Math.abs(r.targetSpend-rows[1][i].targetSpend)<.001);})()`),true,"Same total must hold through band growth");
assert.throws(()=>run("policyReturnPaths({runs:1,years:1,mean:0,sd:-1,seed:1})"),/Invalid Monte Carlo/);
assert.throws(()=>run("runModel({profile:railBProfileForElection('60-40','source-825'),endAge:61,gapBands:[{age:60,amount:50,unit:'returnPct'}],totalSpendTarget:null,policy:{mode:'adaptive',essentialTotal:50000}})"),/percentage-of-return/);
const values={pc_basis:"total",pc_essential:"70000",pc_election:"70-30",pc_runs:"4",pc_75_kind:"hard",pc_75_amount:"100000",pc_85_kind:"informational",pc_85_amount:""};
const elements=Object.fromEntries(Object.entries(values).map(([id,value])=>[id,{value}]));
for(const id of ["pc_status","pc_context","pc_results","pc_checks","pc_paired"])elements[id]={textContent:"",innerHTML:""};
ctx.document.getElementById=id=>elements[id]||null;
run("STATE.profile='custom'; STATE.pssElection='60-40'; PROFILES.custom=railBProfileForElection('60-40','source-825'); STATE.gapBands=[{age:60,amount:24000,unit:'dollar'}]; STATE.totalSpendTarget=null; renderPolicyComparator()");
assert.match(elements.pc_status.textContent,/Comparison complete/);
assert.match(elements.pc_context.textContent,/Hold total lifestyle constant/);
assert.match(elements.pc_results.innerHTML,/70-30 election/);
assert.match(elements.pc_checks.innerHTML,/Hard constraint|hard/);
assert.match(elements.pc_paired.innerHTML,/identical|paired Monte Carlo/);
assert.equal(run("STATE.pssElection"),"60-40","Comparator must not change the active election");
console.log("Policy comparator: advisory parity, all-ones parity, causal decisions, paired paths, election semantics and checks passed.");
