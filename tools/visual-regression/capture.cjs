#!/usr/bin/env node
const { createRequire } = require("node:module");
const fs = require("node:fs");
const path = require("node:path");

const modulesRoot = process.env.VISUAL_QA_MODULES;
if (!modulesRoot) throw new Error("VISUAL_QA_MODULES is required");
const requireFromTools = createRequire(path.join(modulesRoot, "package.json"));
const { chromium } = requireFromTools("playwright");

function arg(name, fallback) {
  const index = process.argv.indexOf("--" + name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const baseUrl = arg("base-url", null);
const outputDir = arg("out", null);
const configPath = arg("config", "visual-qa/config.json");
const label = arg("label", "capture");
if (!baseUrl || !outputDir) throw new Error("usage: capture.cjs --base-url <url> --out <dir>");

const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
fs.mkdirSync(outputDir, { recursive: true });

const STYLE_PROPS = [
  "display","position","color","backgroundColor","backgroundImage","fontFamily",
  "fontSize","fontWeight","lineHeight","letterSpacing","borderRadius",
  "borderTopWidth","borderRightWidth","borderBottomWidth","borderLeftWidth",
  "boxShadow","gridTemplateColumns","gap"
];

const freezeSource =
  "(() => {" +
  "const fixed=new Date(" + JSON.stringify(config.freezeTime) + ").valueOf();" +
  "const RealDate=Date;" +
  "class FixedDate extends RealDate{constructor(...args){super(...(args.length?args:[fixed]));}static now(){return fixed;}}" +
  "FixedDate.parse=RealDate.parse;FixedDate.UTC=RealDate.UTC;Object.setPrototypeOf(FixedDate,RealDate);window.Date=FixedDate;" +
  "})();";

(async () => {
  const browser = await chromium.launch({ headless: true });
  const measurements = {
    schemaVersion: 1,
    label,
    baseUrl,
    capturedAt: new Date().toISOString(),
    freezeTime: config.freezeTime,
    cases: {}
  };

  try {
    for (const item of config.cases) {
      const context = await browser.newContext({
        viewport: { width: item.width, height: item.height },
        deviceScaleFactor: 1,
        locale: "en-AU",
        timezoneId: "Australia/Sydney",
        colorScheme: "dark",
        reducedMotion: "reduce"
      });
      await context.addInitScript(freezeSource);
      const page = await context.newPage();
      const pageErrors = [];
      const consoleErrors = [];
      page.on("pageerror", error => pageErrors.push(error.message));
      page.on("console", message => {
        if (message.type() === "error" && !/favicon/i.test(message.text())) consoleErrors.push(message.text());
      });

      const url = new URL(item.path, baseUrl).toString();
      const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
      if (!response || !response.ok()) {
        throw new Error(item.id + ": navigation failed (" + (response ? response.status() : "no response") + ")");
      }
      await page.locator(item.waitFor).first().waitFor({ state: "visible", timeout: 30000 });
      await page.evaluate(async () => { if (document.fonts && document.fonts.ready) await document.fonts.ready; });
      await page.addStyleTag({ content:
        "*,*::before,*::after{" +
        "animation:none!important;transition:none!important;caret-color:transparent!important;scroll-behavior:auto!important;" +
        "}"
      });
      await page.waitForTimeout(250);

      const observed = await page.evaluate(({ selectors, props }) => {
        const styles = {};
        for (const selector of selectors) {
          const element = document.querySelector(selector);
          if (!element) {
            styles[selector] = null;
            continue;
          }
          const computed = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          styles[selector] = {
            properties: Object.fromEntries(props.map(prop => [prop, computed[prop] || ""])),
            rect: {
              x: rect.x, y: rect.y, width: rect.width, height: rect.height,
              top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left
            }
          };
        }
        return {
          title: document.title,
          innerWidth: innerWidth,
          innerHeight: innerHeight,
          documentWidth: document.documentElement.scrollWidth,
          documentHeight: document.documentElement.scrollHeight,
          bodyWidth: document.body ? document.body.scrollWidth : null,
          horizontalOverflow: document.documentElement.scrollWidth - innerWidth,
          styles
        };
      }, { selectors: item.selectors, props: STYLE_PROPS });

      const screenshotName = item.id + ".png";
      await page.screenshot({
        path: path.join(outputDir, screenshotName),
        fullPage: false,
        animations: "disabled"
      });
      measurements.cases[item.id] = Object.assign({}, item, {
        url,
        screenshot: screenshotName,
        pageErrors,
        consoleErrors,
        observed
      });
      await context.close();
    }
  } finally {
    await browser.close();
  }

  fs.writeFileSync(path.join(outputDir, "measurements.json"), JSON.stringify(measurements, null, 2));
  console.log(JSON.stringify({ ok: true, label, cases: Object.keys(measurements.cases), outputDir }, null, 2));
})().catch(error => {
  console.error(error);
  process.exit(1);
});
