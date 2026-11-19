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
    const datasets = Chart.getChart(canvas).data.datasets;
    const series = datasets.find((item) => item.label === seriesLabel);
    if (!series) throw new Error(`Missing chart series ${seriesLabel}. Available series are ${datasets.map((item) => item.label).join(", ")}`);
    return series.data;
  }, label);
}

function assertMoney(actual, expected, explanation) {
  assert.ok(Math.abs(actual - expected) < 0.01, `${explanation}. Expected ${expected.toFixed(2)}, got ${actual}`);
}

async function verifyAIReviewCashflow(page, expectedPortfolioDraw, expectedSurplus) {
  const endpoint = "**/api/retirement-ai";
  const reply = expectedSurplus > 0 ? "Pension surplus fixture received." : "Portfolio draw fixture received.";
  let payload;
  await page.route(endpoint, async (route) => {
    const headers = {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type",
    };
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers });
      return;
    }
    payload = route.request().postDataJSON();
    await route.fulfill({ status: 200, headers, contentType: "text/event-stream", body: `data: ${JSON.stringify({ text: reply })}\n\n` });
  });
  try {
    await page.locator("#v23-ai-launcher").click();
    await page.locator("#v23-ai-input").fill("Check this synthetic first-year cashflow.");
    await page.locator("#v23-ai-send").click();
    await page.getByText(reply, { exact: true }).waitFor();
    const { activeScenario, deterministicOutputs } = payload.context;
    assert.deepEqual(activeScenario.firstOperatingPeriod, { fromAge: 60, toAge: 61 });
    assertMoney(activeScenario.annualNetSpending, 122000, "Review payload uses funded first-year spending");
    assertMoney(activeScenario.annualPortfolioDraw, expectedPortfolioDraw, "Review payload includes all portfolio withdrawals");
    assertMoney(activeScenario.pssPensionSurplusToPoolC, expectedSurplus, "Review payload uses the actual pension savings");
    assert.equal(deterministicOutputs.likelyStart.launchSnapshot, true);
    await page.locator("#v23-ai-close").click();
  } finally {
    await page.unroute(endpoint);
  }
}

async function verifyCapitalBridge(page, closing) {
  const amounts = (await page.locator("#wf_container .wf-val").allTextContents())
    .map((raw) => Number(raw.replace("−", "-").replace(/[$,]/g, "")));
  assert.equal(amounts.length, 6);
  assertMoney(amounts.at(-1), closing, "The breakdown ends at the chart's target-age balance");
  const [opening, growth, saved, spent, oneOff, end] = amounts;
  assert.ok(Math.abs(opening + growth + saved + spent + oneOff - end) < 0.04, "Visible rounded capital movements reconcile");
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
  // Use the opening balances and cashflows directly so the chart cannot confirm its own results.
  const annualSpend = 122_000;
  const poolAFactor = 1 + 0.065;
  const poolCFactor = poolAFactor - 0.0035;
  const firstYearPoolA = 441_674.40 * poolAFactor - (annualSpend - 95_434.30);
  const firstYearPoolC = 362_913.85 * poolCFactor;
  assertMoney(startingCapital[1], firstYearPoolA + firstYearPoolC, "70/30 capital after the first year's growth and spending");
  await verifyCapitalBridge(page, startingCapital[15]);
  await verifyAIReviewCashflow(page, annualSpend - 95_434.30, 0);
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
  const pensionSurplus = 135_575.70 - annualSpend;
  assertMoney(fullPensionCapital[1], 317_447.66 * poolCFactor + pensionSurplus, "100% pension adds the unspent pension to Pool C");
  await verifyCapitalBridge(page, fullPensionCapital[15]);
  await verifyAIReviewCashflow(page, 0, pensionSurplus);
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
  assert.equal((await chartValues(page, "#in_chart", "PSS pension consumed"))[0], 130000);
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
  assert.equal((await chartValues(page, "#in_chart", "PSS pension consumed"))[0], 90000);
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

  const slots = new URL(handoff);
  slots.searchParams.set("page", "saveslots");
  await open(page, slots);
  const slot = page.locator("#slot_cards .card").filter({ has: page.getByRole("textbox", { name: "Scenario slot A name" }) });
  await slot.getByRole("button", { name: "Save current" }).click();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export settings" }).click();
  const backup = await readFile(await (await downloaded).path());
  const exported = JSON.parse(backup.toString("utf8"));
  assert.equal(exported.state.pssElection, "100");
  assert.deepEqual(exported.state.gapBands.map(({ age, amount, unit }) => [age, amount, unit]), [
    [60, 90000, "totalDollar"], [70, 99000, "totalDollar"],
  ]);

  await restore.click();
  assert.match(await active.innerText(), /70 \/ 30.*\$122,000/);
  await slot.getByRole("button", { name: "Load", exact: true }).click();
  assert.match(await active.innerText(), /100% pension.*age-band spending/);
  await restore.click();
  await page.locator("#inp-import-settings").setInputFiles({ name: "verified-settings.json", mimeType: "application/json", buffer: backup });
  await active.filter({ hasText: /100% pension.*age-band spending/ }).waitFor();
  await open(page, handoff);
  assert.deepEqual(await birthdayBudgets(), [90000, 99000]);
}

async function exerciseExplorer(page, base) {
  const destination = new URL(base);
  destination.search = new URLSearchParams({
    section: "scenario", tool: "surface", shared: "1", rail: "B", pss: "70-30", basis: "source-825",
    spend: "160000", return: "0.0519", age: "75", theme: "light",
  });
  await open(page, destination);
  await page.getByRole("heading", { name: "Compare spending and returns", exact: true }).waitFor();
  const current = page.locator(".surface-current");
  await current.getByText(/\$160,000 net spending a year/).waitFor();
  const draw = current.locator(".surface-policy").filter({ hasText: "Use Pool C to cover gaps" });
  const reserve = current.locator(".surface-policy").filter({ hasText: "Keep Pool C in reserve" });
  assert.match(await draw.innerText(), /Full spending funded through age 75/);
  assert.match(await draw.innerText(), /Withdrawn from Pool C\s+\$398,386/);
  assert.match(await reserve.innerText(), /Spending shortfall starts at age 69/);
  assert.match(await reserve.innerText(), /Spending left unfunded\s+\$398,386/);
  const surface = page.locator(".surface-canvas");
  const alternative = page.locator(".surface-alternative");
  await surface.press("ArrowRight");
  assert.match(await alternative.innerText(), /Selected alternative.*\$161,000/);
  assert.match(await current.innerText(), /\$160,000 net spending a year/);
  await page.getByRole("button", { name: "Clear selection" }).click();
  assert.equal(await alternative.count(), 0);
  await surface.press("ArrowRight");
  await page.getByRole("button", { name: "Apply spending and return" }).click();
  assert.match(await current.innerText(), /\$161,000 net spending a year/);

  const atlas = new URL("atlas.html?view=river", base);
  await open(page, atlas);
  await page.waitForURL((current) => current.searchParams.get("tool") === "explore");
  const frame = page.frameLocator('iframe[src*="atlas.html"]');
  await frame.locator("#visualCanvas").waitFor();
  await frame.getByRole("tab", { name: /Table/ }).click();
  await frame.getByRole("table", { name: "Exact annual capital ledger" }).waitFor();
  assert.equal(await frame.locator("#visualTableBody tr").count(), 36);
}

async function exerciseV23EdgeCases(page, base) {
  const destination = new URL("deep-model.html", base);
  destination.search = new URLSearchParams({
    shared: "1", rail: "B", pss: "70-30", basis: "prudent-630", spend: "124000",
    return: "0.065", age: "75", theme: "light",
  });
  const visit = (id) => {
    destination.searchParams.set("page", id);
    return open(page, destination);
  };
  const setRange = (selector, value) => page.locator(selector).evaluate((input, amount) => {
    input.value = String(amount);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);

  await visit("scencomp");
  const restore = page.getByRole("button", { name: "Restore imported plan" });
  if (await restore.isVisible()) await restore.click();
  const alternativeCapital = async () => (await chartValues(page, "#sc_right_chart", "Alternative"))[15];
  const activeCapital = await chartValues(page, "#sc_left_chart", "Current likely");
  await setRange("#sc_sl_gap", 20000);
  const lowerGapCapital = await alternativeCapital();
  const lowerGapRisk = await page.locator("#sc_right_cards .card").filter({ hasText: "MC P(>= floor)" }).innerText();
  await setRange("#sc_sl_gap", 60000);
  assert.ok(await alternativeCapital() < lowerGapCapital, "A higher Scenario B gap reduces B capital");
  assert.notEqual(await page.locator("#sc_right_cards .card").filter({ hasText: "MC P(>= floor)" }).innerText(), lowerGapRisk);
  await page.locator("#sc_sl_gap").press("Home");
  assert.match(await page.locator("#sc_right_title").innerText(), /\$0 flat/);
  assert.ok(await alternativeCapital() > lowerGapCapital, "Scenario B accepts zero extra spending");
  assert.deepEqual(await chartValues(page, "#sc_left_chart", "Current likely"), activeCapital);

  await visit("sensitivity");
  const sensitivity = page.locator("#ss_tbl tbody tr");
  assert.equal(await sensitivity.filter({ hasText: "Default gap ($24k), likely" }).locator("td").nth(1).innerText(), "$24k");
  assert.equal(await sensitivity.filter({ hasText: "Higher lifestyle ($36k), likely" }).locator("td").nth(1).innerText(), "$36k");
  await visit("tornado");
  const spendingFactor = page.locator("#tor_tbl tbody tr").filter({ hasText: "Annual spending budget" });
  assert.notEqual(await spendingFactor.locator("td").nth(1).innerText(), await spendingFactor.locator("td").nth(3).innerText());

  await visit("recalibrate");
  const gap = page.locator("#rc_gap");
  await gap.fill("0");
  const noGap = await chartValues(page, "#rc_chart", "Recalibrated total");
  await gap.fill("60000");
  const highGap = await chartValues(page, "#rc_chart", "Recalibrated total");
  assert.ok(highGap[15] < noGap[15], "Recalibration uses the entered gap instead of the shared budget");
  await page.locator("#rc_age").fill("59");
  assert.equal(await page.locator("#rc_result_panel").isVisible(), false);
  assert.match(await page.locator("#rc_error").innerText(), /age within the retirement forecast/);
  await page.locator("#rc_age").fill("84");
  assert.match(await page.locator("#rc_cards").innerText(), /target age comes before your starting age of 84/);
  await page.locator("#rc_age").fill("60");
  await setRange("#sl_oo", 80000);
  const recalibratedLaunch = await chartValues(page, "#rc_chart", "Recalibrated total");
  assert.equal(recalibratedLaunch[0], highGap[0], "Entered balances already account for historical retirement expenses");

  await page.evaluate(() => showPage("trajectory"));
  const mainCapital = await chartValues(page, "#tj_chart", "Likely");
  await page.evaluate(() => showPage("health"));
  assert.deepEqual((await chartValues(page, "#hl_chart", "Base (healthy)")).slice(0, mainCapital.length), mainCapital);
  const majorCare = "Major surgery + recovery ($150k @70)";
  assert.deepEqual((await chartValues(page, "#hl_chart", majorCare)).slice(0,10),mainCapital.slice(0,10),"Both health paths include the opening expense before any health event");
  await page.evaluate(() => showPage("cpishock"));
  await page.locator("#sl_cpi").press("Home");
  await page.locator("#sl_cpidrag").press("Home");
  assert.deepEqual(await chartValues(page, "#cp_chart", "CPI shock"), mainCapital, "Setting both shock controls to zero gives the active plan including its one-off");

  await page.evaluate(() => showPage("pre60"));
  await page.locator("#pre60_cpage").fill("59.9");
  await page.locator("#pre60_current").fill("0");
  await page.locator("#pre60_ret").fill("0");
  const pre60 = await chartValues(page, "#pre60_chart", "Hostplus balance");
  assertMoney(pre60.at(-1), 3120, "The tracker honours zeroes and stops contributions at age 60");
  assert.equal(await page.locator("#pre60_cards .value").first().innerText(), await page.locator("#pre60_recal_result .value").first().innerText());

  destination.searchParams.set("pss", "100");
  await visit("health");
  await page.getByRole("button", { name: majorCare, exact: true }).press("Enter");
  const healthCosts = page.locator("#health_summary");
  assert.match(await healthCosts.innerText(), /\$0 funded.*\$150,000 unfunded/s);
  await visit("oneoff");
  await page.locator("#plan-controls-toggle").click();
  await setRange("#sl_oo", 190000);
  const capacity = page.locator("#oo_cards .card");
  assert.equal(await capacity.filter({ hasText: "Max @ Likely" }).locator(".value").innerText(), "$0");
  const funding = capacity.filter({ hasText: "One-off funding at retirement" });
  assert.match(await funding.innerText(), /\$0 funded.*\$190,000 unfunded/s);
  const csvDownload = page.waitForEvent("download");
  await page.locator("#btn-csv").click();
  const csv = await readFile(await (await csvDownload).path(), "utf8");
  const [header, launch] = csv.split("\n").map((row) => row.split(","));
  assert.deepEqual(header.slice(-3), ["One-off Requested", "One-off Funded", "One-off Unfunded"]);
  assert.deepEqual(launch.slice(-3), ["190000", "0", "190000"]);
  const likely = await chartValues(page, "#oo_chart", "Likely (6.5%)");
  assert.ok(likely[0] > 0);
  assert.ok(likely.slice(1).every((value) => value === null), "The chart omits unfunded one-off points");
  await page.locator("#sel_poolcpolicy").selectOption("after-abp");
  assert.match(await funding.innerText(), /\$190,000 funded.*\$0 unfunded/s);

  page.once("dialog", (dialog) => dialog.accept());
  await Promise.all([
    page.waitForURL((current) => !current.searchParams.has("shared")),
    page.getByRole("button", { name: /Reset V23/ }).click(),
  ]);
  assert.equal(new URL(page.url()).searchParams.get("page"), "oneoff");
  assert.equal(await page.locator("#v23-shared-banner").isVisible(), false);
  assert.match(await page.locator("#v23-plan-authority-copy").innerText(), /\$110,000/);
  const slots = new URL(page.url());
  slots.searchParams.set("page", "saveslots");
  await open(page, slots);
  assert.match(await page.locator("#slot_tbl tbody tr").first().innerText(), /\$90k total.*\$99k total/);

  destination.searchParams.set("spend", "180000");
  destination.searchParams.set("return", "0.02");
  await visit("tornado");
  await page.locator("#profile-controls-toggle").click();
  await page.locator("#cf_hostplus").fill("0");
  await page.locator("#cf_hostplus").press("Tab");
  const baseBalance = page.locator("#tor_tbl tbody tr").first().locator("td");
  assert.equal(await baseBalance.nth(2).innerText(), "$0");
  assert.equal(await baseBalance.nth(4).innerText(), "—");
  assert.equal(await baseBalance.nth(5).innerText(), "—");
  await page.evaluate(() => showPage("breakeven"));
  assert.match(await page.locator("#be_cards").innerText(), /Unreached at 18%/);
  await page.evaluate(() => showPage("probability"));
  const anyCapital = page.locator("#pr_tbl tbody tr").filter({ hasText: "Any capital" });
  assert.equal(await anyCapital.locator("td").nth(1).innerText(), "0%");
  await page.evaluate(() => showPage("reviewdelta"));
  const balanceDifference = page.locator("#rv_cards .card").filter({ hasText: "Balance difference" });
  assert.match(await balanceDifference.innerText(), /needs a non-zero model balance/);
  await page.locator("#rv_age").fill("65.5");
  assert.equal(await page.locator("#rv_results").isVisible(), false);
  assert.match(await page.locator("#rv_error").innerText(), /whole age/);
  const invalidAmounts = await page.evaluate(() => {
    const routes = [...document.querySelectorAll("nav.side [data-page]")].map((link) => link.dataset.page);
    const invalid = [];
    for (const route of routes) {
      showPage(route);
      if (/(?:NaN%|Infinity%|\$NaN|\$Infinity)/.test(document.getElementById("page-" + route).innerText)) invalid.push(route);
    }
    return { checked: routes.length, invalid };
  });
  assert.equal(invalidAmounts.checked, 33);
  assert.deepEqual(invalidAmounts.invalid, [], "Every V23 page renders at zero investment capital without invalid amounts");
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
      await exerciseV23EdgeCases(page, preview.base);
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
