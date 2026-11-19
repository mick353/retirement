import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { chromium } from "playwright";

const { values: { artifact = "pages", url } } = parseArgs({
  options: { artifact: { type: "string" }, url: { type: "string" } },
});
assert.ok(["pages", "sites"].includes(artifact), "Use --artifact pages or --artifact sites");

const types = {
  ".css": "text/css", ".html": "text/html", ".ico": "image/x-icon",
  ".js": "text/javascript", ".json": "application/json", ".png": "image/png",
  ".svg": "image/svg+xml", ".txt": "text/plain", ".webmanifest": "application/manifest+json",
};

async function serveBuild() {
  const isPages = artifact === "pages";
  const prefix = isPages ? "/retirement/" : "/";
  const root = resolve(isPages ? "dist-pages" : "dist/client");
  const worker = isPages ? null : (await import(pathToFileURL(resolve("dist/server/index.js")).href)).default;

  async function assets(request) {
    const path = decodeURIComponent(new URL(request.url).pathname);
    if (!path.startsWith(prefix)) return new Response("Not found", { status: 404 });
    const relative = path.slice(prefix.length);
    const file = resolve(root, relative || "index.html");
    if (!file.startsWith(root + sep)) return new Response("Not found", { status: 404 });
    for (const candidate of extname(file) ? [file] : [file, file + ".html"]) {
      try {
        return new Response(await readFile(candidate), { headers: { "content-type": types[extname(candidate)] ?? "application/octet-stream" } });
      } catch (error) {
        if (!["ENOENT", "EISDIR"].includes(error.code)) throw error;
      }
    }
    return new Response("Not found", { status: 404 });
  }

  const server = createServer(async (req, res) => {
    try {
      const request = new Request(new URL(req.url, `http://${req.headers.host}`), { headers: req.headers });
      const asset = await assets(request);
      const response = worker && asset.status === 404
        ? await worker.fetch(request, { ASSETS: { fetch: assets } }, { waitUntil() {}, passThroughOnException() {} })
        : asset;
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      console.error(error);
      res.writeHead(500).end("Test preview failed");
    }
  });
  await new Promise((ready, reject) => server.once("error", reject).listen(0, "127.0.0.1", ready));
  return { server, base: new URL(`http://127.0.0.1:${server.address().port}${prefix}`) };
}

async function open(page, destination) {
  const response = await page.goto(destination.href, { waitUntil: "domcontentloaded" });
  assert.equal(response?.status(), 200, destination.href);
}

async function chartValues(page, selector, label) {
  return page.locator(selector).evaluate((canvas, seriesLabel) => {
    const series = Chart.getChart(canvas).data.datasets.find((item) => item.label === seriesLabel);
    return series.data;
  }, label);
}

async function exerciseV23(page, base) {
  const source = new URL(base);
  source.search = new URLSearchParams({
    section: "scenario", tool: "lab", shared: "1", rail: "B", pss: "70-30", basis: "prudent-630",
    spend: "122000", return: "0.065", age: "75", home: "800000", theme: "light",
  });
  await open(page, source);
  const launch = page.locator('a[href*="deep-model"][href*="pss=70-30"][href*="spend=122000"]').first();
  const handoff = new URL(await launch.getAttribute("href"), source);
  assert.equal(handoff.searchParams.get("basis"), "prudent-630");
  assert.equal(handoff.searchParams.get("page"), "income");

  const trajectory = new URL(handoff);
  trajectory.searchParams.set("page", "trajectory");
  await open(page, trajectory);
  const title = page.locator("#v23-shared-title");
  const active = page.locator("#v23-shared-active");
  const profile = page.locator("#profile-summary");
  const restore = page.getByRole("button", { name: "Restore imported plan" });
  const election = (value) => page.locator(`[data-pss-election="${value}"]`);
  const openProfile = async () => {
    if (!(await election("100").isVisible())) await page.locator("#profile-controls-toggle").click();
  };

  assert.match(await title.innerText(), /Imported Command Centre plan active/);
  assert.match(await profile.innerText(), /Net PSS \$95,434\.30.*Gross PSS \$103,332\.85/);
  const startingCapital = await chartValues(page, "#tj_chart", "Likely");
  await openProfile();

  const hostplus = page.locator("#cf_hostplus");
  await hostplus.fill("800000");
  await hostplus.press("Tab");
  assert.match(await profile.innerText(), /Pool C \$845,466\.19/);
  const profileBadge = page.locator("#profile-input-status");
  await page.locator("#profile-controls-toggle").click();
  assert.equal(await profileBadge.isVisible(), true);
  assert.equal(await profileBadge.innerText(), "Custom figures active");
  await page.reload({ waitUntil: "domcontentloaded" });
  await openProfile();
  assert.equal(await hostplus.inputValue(), "800000");
  await page.getByRole("button", { name: "Reset custom figures" }).click();
  assert.equal(await profileBadge.innerText(), "Source figures active");
  assert.equal(await hostplus.inputValue(), "317447.66");
  assert.deepEqual(await chartValues(page, "#tj_chart", "Likely"), startingCapital);

  await election("100").click();
  assert.match(await title.innerText(), /V23 profile and plan controls take precedence/);
  assert.match(await active.innerText(), /100% pension.*\$122,000/);
  const fullPensionCapital = await chartValues(page, "#tj_chart", "Likely");
  assert.notEqual(fullPensionCapital[15], startingCapital[15]);
  await page.reload({ waitUntil: "domcontentloaded" });
  assert.deepEqual(await chartValues(page, "#tj_chart", "Likely"), fullPensionCapital);

  await open(page, handoff);
  const edit = page.getByRole("button", { name: "Edit spending in V23" });
  const rule = page.locator("#sel_spendmode");
  const annualBudget = page.locator("#v23-flat-spend");
  const cards = page.locator("#in_cards");
  await edit.click();
  assert.equal(await rule.inputValue(), "flatTotal");
  assert.equal(await annualBudget.inputValue(), "122000");
  await annualBudget.fill("130000");
  await page.getByRole("button", { name: "Apply spending", exact: true }).click();
  assert.match(await active.innerText(), /100% pension.*\$130,000/);
  assert.match(await cards.innerText(), /\$130,000\/yr.*\$135,575\.70\/yr.*\$5,576\/yr average surplus/s);
  assert.equal((await chartValues(page, "#in_chart", "Planned total spending"))[0], 130000);
  await page.reload({ waitUntil: "domcontentloaded" });
  assert.match(await active.innerText(), /100% pension.*\$130,000/);
  await restore.click();
  assert.match(await active.innerText(), /70 \/ 30.*\$122,000/);

  await edit.click();
  await rule.selectOption("fixed");
  const amount = (index) => page.locator(`[data-band-amount="${index}"]`);
  const setBand = async (index, value) => {
    await amount(index).fill(String(value));
    await amount(index).press("Tab");
  };
  await setBand(0, 24000);
  assert.match(await cards.innerText(), /\$119,434\/yr.*\$95,434 from net PSS \+ \$24,000 from investments/s);
  await page.locator("#v23-age-band-editor select").first().selectOption("totalDollar");
  assert.equal(await amount(0).inputValue(), "119434.3");
  await setBand(0, 90000);
  assert.match(await cards.innerText(), /\$90,000\/yr.*\$5,434\/yr average surplus/s);
  await page.getByRole("button", { name: "Add band" }).click();
  const nextAge = page.locator('[data-band-age="1"]');
  await nextAge.fill("70");
  await nextAge.press("Tab");
  await setBand(1, 99000);
  const birthdayBudgets = async () => (await chartValues(page, "#in_chart", "Planned total spending")).slice(9, 11);
  assert.deepEqual(await birthdayBudgets(), [90000, 99000]);

  await page.reload({ waitUntil: "domcontentloaded" });
  await openProfile();
  await election("100").click();
  assert.deepEqual(await birthdayBudgets(), [90000, 99000]);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
}

async function exerciseExplorer(page, base) {
  const destination = new URL("?section=scenario&tool=surface", base);
  await open(page, destination);
  await page.getByRole("heading", { name: "Compare spending and returns", exact: true }).waitFor();
  const atlas = new URL("atlas.html?view=river", base);
  await open(page, atlas);
  await page.waitForURL((current) => current.searchParams.get("tool") === "explore");
  const frame = page.frameLocator('iframe[src*="atlas.html"]');
  await frame.locator("#visualCanvas").waitFor();
}

const preview = url ? { base: new URL(url.endsWith("/") ? url : url + "/") } : await serveBuild();
let browser;
try {
  browser = await chromium.launch();
  for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 950 }, locale: "en-AU", reducedMotion: "reduce" });
    try {
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await exerciseV23(page, preview.base);
      await exerciseExplorer(page, preview.base);
      assert.deepEqual(errors, [], `Browser errors at ${width}px`);
      console.log(`Retirement browser journeys passed at ${width}px on ${preview.base.href}`);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser?.close();
  preview.server?.close();
}
