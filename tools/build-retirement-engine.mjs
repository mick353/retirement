import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("..", import.meta.url));
const sourcePath = path.join(root, "app", "retirement-core.ts");
const outputPath = path.join(root, "public", "retirement-engine.js");
const source = await readFile(sourcePath, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    strict: true,
  },
  reportDiagnostics: true,
});

const diagnostics = (compiled.diagnostics ?? []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
if (diagnostics.length > 0) {
  throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => root,
    getNewLine: () => "\n",
  }));
}

const browserBundle = `/* Generated from app/retirement-core.ts. Do not edit directly. */
;(function registerRetirementEngine(global) {
  const module = { exports: {} };
  const exports = module.exports;
${compiled.outputText}
  global.RetirementEngine = Object.freeze(module.exports);
})(globalThis);
`;

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, browserBundle, "utf8");
console.log(`Retirement engine browser bundle written: ${path.relative(root, outputPath)}`);
