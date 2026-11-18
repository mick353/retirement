import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the Surface component's handlers and its actual canonical ledger.
const app = await readFile(new URL('../app/retirement-dashboard.tsx', import.meta.url), 'utf8');
const core = await readFile(new URL('../app/retirement-core.ts', import.meta.url), 'utf8');
const compile = (source) => ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
} }).outputText;
const coreExports = {};
vm.runInNewContext(compile(core), { exports: coreExports });

const state = [];
let nextState = 0;
const jsx = (type, props) => ({ type, props: props ?? {} });
const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 600, height: 310 }) };
const context = {
  exports: {},
  require: (name) => { assert.equal(name, 'react/jsx-runtime'); return { jsx, jsxs: jsx, Fragment: 'fragment' }; },
  useState: (initial) => {
    const index = nextState++;
    if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial;
    return [state[index], (value) => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
  },
  useMemo: (fn) => fn(),
  useEffect: () => {},
  useRef: () => ({ current: canvas }),
  Badge: 'badge',
  clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
  calculateCanonicalFlatRetirementLedger: coreExports.calculateFlatRetirementLedger,
  POOL_C_DRAG: coreExports.POOL_C_MODELLED_DRAG,
  money: (value) => `$${Math.round(value).toLocaleString('en-AU')}`,
  compactMoney: (value) => `$${Math.round(value).toLocaleString('en-AU')}`,
  pct: (value, digits = 0) => `${(value * 100).toFixed(digits)}%`,
};
vm.createContext(context);
vm.runInContext(compile(app.slice(app.indexOf('type PoolPath ='), app.indexOf('function themeInk('))), context);
vm.runInContext(compile(app.slice(app.indexOf('type SurfaceMetric ='), app.indexOf('function mat4Multiply('))), context);

const rail = coreExports.railBOpeningPosition('70-30', 'source-825');
const adopted = [];
context.props = { rail, spend: 119_000, realReturn: 0.05, targetAge: 75, theme: 'dark', onAdopt: (value) => adopted.push(value) };
const render = () => { nextState = 0; return vm.runInContext('DecisionSurface(props)', context); };
const children = (node) => Array.isArray(node) ? node.flatMap(children) : node == null || typeof node !== 'object' ? [] : [node, ...children(node.props?.children)];
const content = (node) => Array.isArray(node) ? node.map(content).join('') : node == null || node === false ? '' : typeof node !== 'object' ? String(node) : content(node.props?.children);
const button = (tree, label) => {
  const match = children(tree).find((node) => node.type === 'button' && content(node).trim() === label);
  assert.ok(match, `Missing button: ${label}`);
  return match;
};

let tree = render();
const projection = vm.runInContext('surfaceProjection(props.rail, props.spend, props.realReturn, props.targetAge)', context);
assert.ok(Math.abs(projection.total - projection.poolA - projection.poolC) < 0.001);
assert.match(content(tree), /Modelled investments at 75/);
assert.ok(content(tree).includes(context.money(projection.total)), 'The exact current total is visible without pointer movement');
assert.ok(content(tree).includes(context.money(projection.poolA)));
assert.ok(content(tree).includes(context.money(projection.poolC)));
assert.doesNotMatch(content(tree), /hover to read/i);
assert.equal(button(tree, 'Modelled investments at age 75').props['aria-pressed'], true);

const chart = children(tree).find((node) => node.type === 'canvas');
chart.props.onClick({ clientX: 300, clientY: 150 });
tree = render();
assert.match(content(tree), /Selected alternative/);
assert.equal(adopted.length, 0, 'Selecting a point must not change the plan');
button(tree, 'Apply this alternative').props.onClick();
assert.equal(adopted.length, 1, 'Applying a selection changes the plan once');
assert.ok(adopted[0].spend >= 76_000 && adopted[0].spend <= 200_000);

state.length = 0;
Object.assign(context.props, { spend: 160_000, realReturn: 0.0519 });
tree = render();
assert.match(content(tree), /\$435,474/);
assert.match(content(tree), /full spending target is funded through age 75/);
assert.match(content(tree), /Pool C contributed \$398,386/);
assert.doesNotMatch(content(tree), /\$894,790/, 'Do not display the protected reserve as a full-spending result');

const reserveOnly = coreExports.calculateFlatRetirementLedger({ ...rail, spend: 160_000, realReturn: 0.0519, endAge: 75 });
assert.equal(Math.round(reserveOnly.at(-1).ending), 894_790, 'Existing reserve policy remains available to Lab');
const withdrawals = coreExports.calculateFlatRetirementLedger({ ...rail, spend: 160_000, realReturn: 0.0519, endAge: 75, drawPoolCForShortfall: true });
for (const row of withdrawals.slice(1)) {
  assert.ok(Math.abs(row.ending - (row.opening + row.investmentGrowth - row.draw - row.poolCDraw + row.reinvestment)) < 0.001);
  assert.ok(Math.abs(row.fundedSpend - 160_000) < 0.001);
}

context.props.spend = 200_000;
context.props.realReturn = 0.02;
tree = render();
assert.match(content(tree), /Spending target is not fully funded. The first shortfall is at age/);
assert.match(content(tree), /Grey means a spending shortfall by age 75/);
console.log('Surface experience: pictured $160k scenario, reserve-only parity, funding shortfalls and explicit apply passed.');
