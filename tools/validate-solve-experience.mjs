import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the component's actual event handlers and model calculations without
// requiring a browser. A separate browser check covers layout and interaction.
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
const context = {
  exports: {},
  require: (name) => {
    assert.equal(name, 'react/jsx-runtime');
    return { jsx, jsxs: jsx, Fragment: 'fragment' };
  },
  useState: (initial) => {
    const index = nextState++;
    if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial;
    return [state[index], (value) => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
  },
  useMemo: (fn) => fn(),
  useEffect: () => {},
  useRef: () => ({ current: null }),
  Badge: 'badge',
  clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
  drawRate: coreExports.abpMinimumRateAtAgeOn1July,
  calculateCanonicalFlatRetirementLedger: coreExports.calculateFlatRetirementLedger,
  POOL_C_DRAG: coreExports.POOL_C_MODELLED_DRAG,
  TRANSFER_BALANCE_CAP: coreExports.TRANSFER_BALANCE_CAP,
  TRANSFER_BALANCE_BUFFER: coreExports.TRANSFER_BALANCE_BUFFER,
  MAX_FLAT_SPEND: 300_000,
  money: (value) => `$${Math.round(value).toLocaleString('en-AU')}`,
  compactMoney: (value) => `$${Math.round(value).toLocaleString('en-AU')}`,
  pct: (value, digits = 0) => `${(value * 100).toFixed(digits)}%`,
};
vm.createContext(context);
vm.runInContext(compile(app.slice(app.indexOf('type PoolPath ='), app.indexOf('function themeInk('))), context);
vm.runInContext(compile(app.slice(app.indexOf('type SolveMode ='), app.indexOf('type SurfaceMetric ='))), context);

const rail = coreExports.railBOpeningPosition('70-30', 'source-825');
const adopted = [];
context.props = {
  rail, spend: 119_000, realReturn: 0.0614, targetAge: 75,
  electionOptions: [
    { key: 'limited', label: 'Limited capital', grossPension: 30_000, poolA: 100_000 },
    { key: 'enough', label: 'Enough capital', grossPension: 99_000, poolA: 600_000 },
  ],
  onAdopt: (value) => adopted.push(value),
};
const render = () => { nextState = 0; return vm.runInContext('InverseSolveLab(props)', context); };
const children = (node) => Array.isArray(node) ? node.flatMap(children) : node == null || typeof node !== 'object' ? [] : [node, ...children(node.props?.children)];
const content = (node) => Array.isArray(node) ? node.map(content).join('') : node == null || node === false ? '' : typeof node !== 'object' ? String(node) : content(node.props?.children);
const button = (tree, label) => {
  const match = children(tree).find((node) => node.type === 'button' && content(node).trim() === label);
  assert.ok(match, `Missing button: ${label}`);
  return match;
};
const input = (tree, label) => {
  const match = children(tree).find((node) => node.type === 'label' && content(node).startsWith(label));
  const field = children(match).find((node) => node.type === 'input');
  assert.ok(field, `Missing input: ${label}`);
  return field;
};
const typeValue = (tree, label, value) => input(tree, label).props.onChange({ target: { value: String(value) } });
const calculate = (tree) => children(tree).find((node) => node.type === 'form').props.onSubmit({ preventDefault() {} });
const click = (tree, label) => button(tree, label).props.onClick();
const atAge = (age) => vm.runInContext(`poolAAtAge(props.rail, props.spend, props.realReturn, ${age})`, context);

let tree = render();
assert.equal(input(tree, 'Age for this goal').props.value, '75');
click(tree, 'Use current plan balance');
tree = render();
assert.equal(Number(input(tree, 'Desired Pool A balance').props.value), Math.round(atAge(75)));
assert.match(content(tree), /Estimated net spending per year/);
typeValue(tree, 'Desired Pool A balance', 0);
tree = render();
assert.doesNotMatch(content(tree), /Estimated net spending per year/, 'Editing a goal clears its previous result');
click(tree, 'Meet two balance goals');
tree = render();
typeValue(tree, 'Age for this goal', 70);
tree = render();
typeValue(tree, 'Desired Pool A balance', Math.round(atAge(70)));
tree = render();
calculate(tree);
tree = render();
assert.match(content(tree), /First goal kept/);
click(tree, 'Meet two balance goals');
tree = render();
assert.match(content(tree), /First goal kept/, 'Selecting the active question must not discard the first goal');
typeValue(tree, 'Desired Pool A balance', Math.round(atAge(70)));
tree = render();
calculate(tree);
tree = render();
assert.match(content(tree), /Choose a different age/);
typeValue(tree, 'Age for this goal', 75);
tree = render();
typeValue(tree, 'Desired Pool A balance', Math.round(atAge(75)));
tree = render();
const lowReturnCeiling = vm.runInContext('poolAAtAge(props.rail, props.rail.netPension, 0.02, 75)', context);
assert.ok(Number(input(tree, 'Desired Pool A balance').props.value) > lowReturnCeiling + 1);
context.props.realReturn = 0.02;
tree = render();
calculate(tree);
tree = render();
assert.equal(adopted.length, 0, 'Calculating must not alter the shared plan');
click(tree, 'Apply both to my plan');
assert.ok(Math.abs(adopted[0].spend - 119_000) < 100);
assert.ok(Math.abs(adopted[0].realReturn - 0.0614) < 0.0002);

click(tree, 'How much can I spend?');
tree = render();
typeValue(tree, 'Desired Pool A balance', Math.round(lowReturnCeiling + 10_000));
tree = render();
calculate(tree);
tree = render();
assert.match(content(tree), /Unreachable by spending/);

click(tree, 'Opening Pool A and pension');
tree = render();
typeValue(tree, 'Desired Pool A balance', 500_000);
tree = render();
calculate(tree);
tree = render();
assert.match(content(tree), /Limited capitalOpening Pool A \$100,000 · gross pension \$30,000 \/ year · below goal/);
assert.match(content(tree), /Enough capitalOpening Pool A \$600,000 · gross pension \$99,000 \/ year · meets goal/);

click(tree, 'How much can I spend?');
tree = render();
typeValue(tree, 'Desired Pool A balance', 0);
tree = render();
calculate(tree);
tree = render();
assert.match(content(tree), /zero balance does not identify one answer/);
state.length = 0;
context.props.targetAge = 85;
tree = render();
assert.equal(input(tree, 'Age for this goal').props.value, '85', 'The input starts at the Command Centre target');
console.log('Solve experience: current-plan goal, two goals, same-age feedback, explicit apply, election capital and zero-balance checks passed.');
