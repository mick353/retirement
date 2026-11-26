import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { chromium, devices, webkit } from "playwright";

const { values: { artifact = "pages", url, "mobile-engine": mobileEngine } } = parseArgs({
  options: { artifact: { type: "string" }, url: { type: "string" }, "mobile-engine": { type: "string" } },
});
assert.ok(["pages", "sites"].includes(artifact), "Use --artifact pages or --artifact sites");
assert.ok(mobileEngine === undefined || ["ios", "android"].includes(mobileEngine), "Use --mobile-engine ios or android");
const mobileProfile = mobileEngine === "ios" ? devices["iPhone 13"] : mobileEngine === "android" ? devices["Pixel 7"] : {};
const { defaultBrowserType, ...mobileOptions } = mobileProfile;

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
    const url = new URL(request.url);
    const path = decodeURIComponent(url.pathname);
    if (!path.startsWith(prefix)) return new Response("Not found", { status: 404 });
    const relative = path.slice(prefix.length);
    if (relative === "sw.js" && url.searchParams.get("test-install") === "missing-asset") {
      const original = await readFile(resolve(root, "sw.js"), "utf8");
      const interrupted = original.replace(/v\d+`;/, "v-interrupted`;")
        .replace("const APP_SHELL = [", 'const APP_SHELL = [scopedUrl("unavailable-test-shell.js"),');
      return new Response(interrupted, { headers: { "content-type": "text/javascript" } });
    }
    if (!isPages && ["deep-model.html", "atlas.html", "atlas-prototype.html", "model-reference.html"].includes(relative)) {
      url.pathname = url.pathname.slice(0, -5);
      return Response.redirect(url.href, 307);
    }
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

async function downloadSettings(page, kind = "full backup") {
  await page.getByRole("button", { name: "Export settings", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: /^Export your (V23|Command Centre) plan$/ });
  const button = dialog.getByRole("button", { name: `Download ${kind}`, exact: true });
  let preview;
  if (kind === "plan only") {
    await dialog.getByText("Preview the plan-only file", { exact: true }).click();
    preview = JSON.parse(await dialog.locator("pre").textContent());
  }
  const download = page.waitForEvent("download");
  await button.click();
  const bytes = await readFile(await (await download).path());
  if (preview) assert.deepEqual(JSON.parse(bytes), preview, "Plan-only file matches the preview");
  return bytes;
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
  const backup = await downloadSettings(page);
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
  await page.locator("#v23-import-dialog").getByRole("button", { name: "Apply import", exact: true }).click();
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
  await page.locator('iframe[src*="atlas.html"][aria-busy="false"]').waitFor();
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
  assertMoney(pre60.at(-1), 2866.50, "The tracker honours zeroes, credits net contributions and stops at age 60");
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
  assert.deepEqual(header.slice(20, 23), ["One-off Requested", "One-off Funded", "One-off Unfunded"]);
  assert.deepEqual(launch.slice(20, 23), ["190000", "0", "190000"]);
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

async function exerciseAuditedControls(page, base) {
  await page.evaluate(() => localStorage.clear());
  const destination = new URL("deep-model.html?shared=1&rail=B&pss=70-30&basis=prudent-630&spend=122000&return=0.05&age=75&page=income", base);
  await open(page, destination);
  const openControls = async (id) => {
    const toggle = page.locator(id);
    if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
  };
  const show = (id) => page.evaluate((selected) => showPage(selected), id);
  const setNumber = async (id, value) => {
    const input = page.locator(id);
    await input.fill(String(value));
    await input.press("Tab");
  };
  const income = page.locator("#in_cards");
  const incomeAverage = income.locator(".card").filter({ hasText: "Average annual spending funded" });
  const overviewAverage = page.locator("#ovCards .card").filter({ hasText: "Average annual spending funded" });
  const averageText = (card) => card.locator(".value").innerText();
  assert.equal(await averageText(incomeAverage), "$122,000/yr");
  assert.match(await incomeAverage.innerText(), /35 spending years to age 95/);
  assert.equal(await income.locator(".card").filter({ hasText: "Total spending funded" }).locator(".value").innerText(), "$4,270,000");
  await show("overview");
  assert.equal(await averageText(overviewAverage), "$122,000/yr");
  await show("income");
  await openControls("#profile-controls-toggle");
  await page.locator('[data-pss-election="100"]').click();
  assert.equal(await averageText(incomeAverage), "$122,000/yr");
  assert.match(await income.innerText(), /\$13,576\/yr average surplus to Pool C/);
  await openControls("#plan-controls-toggle");
  await page.locator("#v23-flat-spend").fill("160000");
  await page.getByRole("button", { name: "Apply spending", exact: true }).click();
  assert.equal(await averageText(incomeAverage), "$135,576/yr");
  assert.match(await incomeAverage.innerText(), /\$24,424\/yr average unfunded/);
  await show("overview");
  assert.equal(await averageText(overviewAverage), "$135,576/yr");
  await show("income");
  await setNumber("#cf_retire", 55);
  assert.match(await page.locator("#custom-profile-status").innerText(), /Age 55 is pending.*still starts at age 60/);
  assert.match(await incomeAverage.innerText(), /35 spending years/);
  await setNumber("#cf_retire", 65);
  await setNumber("#cf_grossPension", 100000);
  await setNumber("#cf_netPension", 90000);
  await setNumber("#cf_lump", 10000);
  await setNumber("#cf_hostplus", 0);
  assert.match(await incomeAverage.innerText(), /30 spending years to age 95/);
  await page.locator("#v23-flat-spend").fill("80000");
  await page.getByRole("button", { name: "Apply spending", exact: true }).click();
  assert.equal(await averageText(incomeAverage), "$80,000/yr");
  assert.equal(await income.locator(".card").filter({ hasText: "Total spending funded" }).locator(".value").innerText(), "$2,400,000");
  await page.getByRole("button", { name: "Reset custom figures" }).click();
  await page.locator('[data-pss-election="70-30"]').click();
  await page.locator("#sel_spendmode").selectOption("fixed");
  await setNumber('[data-band-amount="0"]', 10000);
  const firstUnit = page.locator("#band-rows select").first();
  await firstUnit.selectOption("drawPct");
  assertMoney(Number(await page.locator('[data-band-amount="0"]').inputValue()), 1000000 / 17666.976, "First-band conversion uses the first operating year's draw");
  assertMoney((await chartValues(page,"#in_chart","Planned total spending"))[0],105434.30,"The unit conversion keeps the first-year budget");

  await page.locator("#sel_spendmode").selectOption("flatTotal");
  await page.locator("#v23-flat-spend").fill("160000");
  await page.getByRole("button", { name: "Apply spending", exact: true }).click();
  await page.locator("#sel_poolcpolicy").selectOption("after-abp");
  await show("oneoff");
  assert.match(await page.locator("#oo_cards .card").filter({ hasText: "Max @ Likely" }).innerText(), /Floor already missed/i);
  const targetAge = page.locator("#sl_targetage");
  const setAge = (age) => targetAge.evaluate((input, value) => {
    input.value = String(value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, age);
  await setAge(85);
  await show("saveslots");
  await page.locator("#slot_cards .card").first().getByRole("button", { name: "Save current" }).click();
  await setAge(75);
  assert.match(await page.locator("#slot_tbl thead").innerText(), /CAPITAL @75/i);
  const slot = await page.locator("#slot_tbl tbody tr").first().locator("td").allInnerTexts();
  assert.equal(slot[3], "$160,000/yr total");
  assert.equal(slot[4], "$247k");
  assert.equal(slot[5], "$0");
  await show("wash");
  await page.locator("#sel_washon").selectOption("0");
  const exported = JSON.parse(await downloadSettings(page));
  assert.equal(exported.state.wash.enabled,false);
  assert.ok(Number.isInteger(exported.state.simulationSeed));
}

async function exerciseBandEditor(page, base) {
  await page.evaluate(() => localStorage.clear());
  await open(page, new URL("deep-model.html?shared=1&rail=B&pss=70-30&basis=source-825&spend=110000&return=.06&age=75&page=income", base));
  const toggle = page.locator("#plan-controls-toggle");
  if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
  await page.locator("#sel_spendmode").selectOption("fixed");
  await page.locator("#btn-band-preset-ramp").click();
  const amount = (index) => page.locator(`[data-band-amount="${index}"]`);
  const basis = (index) => page.locator(`[data-band-unit="${index}"]`);
  const band = page.locator(".band-row").first();
  const viewport = page.viewportSize();
  for (const width of viewport.width < 500 ? [320, 390] : [1440, 2280]) {
    await page.setViewportSize({ ...viewport, width });
    const bounds = await band.evaluate((row) => {
      const boundsFor = (selector) => row.querySelector(selector).getBoundingClientRect().toJSON();
      const input = row.querySelector("[data-band-amount]");
      const style = getComputedStyle(input);
      const ctx = document.createElement("canvas").getContext("2d");
      ctx.font = style.font;
      const contentWidth = input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      return {
        row: row.getBoundingClientRect().toJSON(),
        year: boundsFor("[data-band-year]"),
        amount: boundsFor("[data-band-amount]"),
        basis: boundsFor("[data-band-unit]"),
        inputFits: contentWidth >= ctx.measureText("30000").width + 20,
      };
    });
    assert.ok(bounds.inputFits, `All amount digits fit at ${width}px`);
    assert.ok(bounds.year.bottom <= bounds.amount.top && bounds.amount.bottom <= bounds.basis.top,
      `Year, amount and basis have separate space at ${width}px`);
    assert.ok(bounds.basis.right <= bounds.row.right, `Budget basis stays inside the row at ${width}px`);
  }
  await page.setViewportSize(viewport);
  assert.equal(await amount(0).inputValue(), "30000");
  await amount(0).fill("31000");
  await amount(0).press("Tab");
  assert.equal(await basis(0).evaluate((select) => document.activeElement === select), true,
    "Tab commits the dollar field and focuses the adjacent basis without replacing it");
  await basis(0).selectOption("returnPct");
  assert.equal(await basis(0).inputValue(), "returnPct");
  assert.equal(Math.round((await chartValues(page, "#in_chart", "Planned total spending"))[0]), 132536,
    "Return-basis conversion preserves the displayed year-one amount after percentage rounding");
  await basis(0).selectOption("drawPct");
  assert.equal(await basis(0).inputValue(), "drawPct");
  assert.equal(await amount(0).inputValue(), "100");
  assert.match(await page.locator("#band-conversion-0").innerText(), /Set to 100% of the mandatory draw/);
  await basis(1).selectOption("drawPct");
  await amount(0).fill("25");
  await amount(0).press("Enter");
  await amount(1).fill("75");
  await amount(1).press("Tab");
  const planned = () => chartValues(page, "#in_chart", "Planned total spending");
  const rows = page.locator("#in_tbl tbody tr");
  const phase = (rule) => rows.filter({ hasText: rule }).first();
  const checkFirstYear = async (share) => assertMoney((await planned())[0], 101536.24 + share * .04 * 381847.52, "First-year funding uses the chosen share of Pool A’s draw");
  await checkFirstYear(.25);
  assert.match(await phase("From age 60: 25% draw").innerText(), /Average mandatory draw \$[\d,]+\/yr/);
  assert.match(await phase("From age 69: 75% draw").innerText(), /Average mandatory draw \$[\d,]+\/yr/);
  const funded = (row) => row.locator("td").nth(9).innerText();
  assert.notEqual(await funded(phase("From age 60: 25% draw")), await funded(phase("From age 69: 75% draw")));
  const original = await funded(phase("From age 60: 25% draw"));
  await amount(0).fill("50");
  await amount(0).press("Tab");
  await checkFirstYear(.5);
  assert.notEqual(await funded(phase("From age 60: 50% draw")), original);
  const annual = await planned();
  assert.deepEqual(await chartValues(page, "#band-mini-chart", "Planned annual spending"), annual,
    "The controls preview and Income chart reflect the same annual dollar budgets");
  const total = annual.reduce((sum, value) => sum + value, 0);
  const money = (value) => "$" + Math.round(value).toLocaleString("en-AU");
  assert.equal(await funded(rows.last()), money(total / annual.length));
  await page.locator('[data-income-table-mode="full"]').click();
  assert.equal(await rows.last().locator("td").nth(17).innerText(), money(total / annual.length));
  assert.equal(await rows.last().locator("td").last().innerText(), money(total));
  await page.reload({ waitUntil: "domcontentloaded" });
  assert.equal(await amount(0).inputValue(), "50");
  assert.equal(await basis(1).inputValue(), "drawPct");
  await checkFirstYear(.5);

  const profile = page.locator("#profile-controls-toggle");
  if (await profile.getAttribute("aria-expanded") !== "true") await profile.click();
  await page.locator('[data-pss-election="100"]').click();
  if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
  await basis(2).selectOption("drawPct");
  assert.equal(await amount(2).inputValue(), "0");
  assert.match(await page.locator("#band-conversion-2").innerText(), /no mandatory draw/);
  await page.locator('[data-income-table-mode="essential"]').click();
  for (const rule of ["From age 60: 50% draw", "From age 69: 75% draw"]) {
    const row = phase(rule);
    assert.match(await row.innerText(), /Pension only.*Average mandatory draw \$0\/yr/s);
    assert.equal(await funded(row), "$143,104");
  }
}

async function exerciseDecisionBrief(page, base) {
  await page.evaluate(() => localStorage.clear());
  await open(page, new URL("deep-model.html?page=decisionbrief", base));
  const welcome = page.locator("#v23-welcome[open] #v23-w-skip");
  if (await welcome.isVisible()) await welcome.click();
  const brief = page.locator("#page-decisionbrief");
  const cardValue = (label) => brief.locator("#brief_cards .card").filter({ hasText: label }).locator(".value").innerText();
  const assumption = (label) => brief.locator("#brief_assumptions tr").filter({ hasText: label }).first().innerText();
  assert.equal(await cardValue("Active PSS election"), "70 / 30");
  assert.match(await assumption("PSS pension"), /\$101,536\.24\/yr net.*\$107,072\.03\/yr gross/s);
  assert.match(await assumption("PSS lump sum"), /\$504,768\.16/);
  assert.match(await assumption("Opening investments"), /\$822,215\.82/);
  assert.match(await assumption("Spending rule"), /\$110,000\/yr total/);
  assert.match(await brief.locator("#brief_reco").innerText(), /full \$1,650,000 planned over 15 spending years/);
  assert.equal(await cardValue("Likely @75"), "$1,844,929");
  assert.equal(await cardValue("Base reference @75"), "$1,476,020");
  assert.equal(await cardValue("Conservative reference @75"), "$1,268,044");
  const capital = await chartValues(page, "#brief_chart", "Capital @75");
  assertMoney(capital[2], 1844928.6957, "Decision Brief chart for the default 70/30 plan at 6.5% real");
  assert.doesNotMatch(await brief.innerText(), /Operate 60\/40|Keep the 60\/40/);

  await page.locator("#profile-controls-toggle").click();
  await page.locator('[data-pss-election="100"]').click();
  assert.equal(await cardValue("Active PSS election"), "100% pension");
  assert.match(await assumption("PSS pension"), /\$143,104\.26\/yr net/);
  assert.match(await assumption("PSS lump sum"), /\$0\.00/);
  await page.locator("#plan-controls-toggle").click();
  await page.locator("#v23-flat-spend").fill("160000");
  await page.getByRole("button", { name: "Apply spending", exact: true }).click();
  await page.locator("#sel_poolcpolicy").selectOption("preserve");
  assert.match(await brief.locator("#brief_reco").innerText(), /\$2,146,564 funded and \$253,436 unfunded.*ending at age 61/s);
  assertMoney((await chartValues(page, "#brief_chart", "Capital @75"))[2],
    317447.66 * (1.065 - .0035) ** 15, "Preserved capital remains invested despite the spending shortfall");
  await page.reload({ waitUntil: "domcontentloaded" });
  assert.equal(await cardValue("Active PSS election"), "100% pension");
  assert.match(await assumption("Spending rule"), /\$160,000\/yr total/);
}

async function exerciseDecisionIntegrity(page, base) {
  await page.evaluate(() => localStorage.clear());
  const fixture = "shared=1&rail=B&pss=70-30&basis=prudent-630&spend=160000&return=.05&age=75&taxYear=2027-28&seed=20260814";
  const deep = new URL(`deep-model.html?page=decisionbrief&${fixture}`, base);
  await open(page, deep);
  const summary = page.locator("#v23-decision-summary");
  assert.equal(await summary.isVisible(), true);
  assert.match(await summary.innerText(), /\$414,150 unfunded.*age 69/s);
  assert.match(await summary.innerText(), /\$717,616/);
  assert.doesNotMatch(await summary.innerText(), /\$1,130,536/);
  for (const theme of ["dark", "light"]) {
    if ((await page.locator("html").getAttribute("data-theme")) !== theme) await page.locator("#btn-theme").click();
    const ratios = await summary.locator(".card .sub").evaluateAll((notes) => {
      const luminance = (color) => {
        const components = color.match(/\d+(?:\.\d+)?/g).slice(0, 3).map(value => Number(value) / 255);
        const [red, green, blue] = components.map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
        return .2126 * red + .7152 * green + .0722 * blue;
      };
      return notes.map(note => {
        const text = luminance(getComputedStyle(note).color);
        const background = luminance(getComputedStyle(note.closest(".card")).backgroundColor);
        return (Math.max(text, background) + .05) / (Math.min(text, background) + .05);
      });
    });
    assert.equal(ratios.length, 3);
    assert.ok(ratios.every(ratio => ratio >= 4.5), `${theme} result notes must meet 4.5:1 contrast (found ${ratios.join(", ")})`);
  }
  const beforeControls = await summary.evaluate(element =>
    element.getBoundingClientRect().top < document.getElementById("profile-controls").getBoundingClientRect().top);
  assert.equal(beforeControls, true, "The decision lands above the controls");
  await page.locator("#v23-set-essentials").click();
  const essentials = page.locator("#v23_essentials");
  assert.equal(await essentials.evaluate(el => el === document.activeElement), true);
  await essentials.fill("122000");
  await essentials.press("Enter");
  assert.match(await summary.innerText(), /first missed in year ending at 70/);

  const show = (destination) => page.evaluate(name => showPage(name), destination);
  await show("triggers");
  assert.match(await page.locator("#trigger_cards").innerText(), /Active triggers\s+3\s+Action review required/i);
  assert.equal(await page.locator('#side-nav [data-page="triggers"] .nav-badge').textContent(), "3");
  assert.match(await page.locator("#trigger_tbl").innerText(), /Essential spending.*122,000.*Active.*first missed/is);
  assert.match(await page.locator("#trigger_tbl").innerText(), /Full annual budget.*414,150/is);

  await show("oneoff");
  assert.match(await page.locator("#oo_cards").innerText(), /\$441,674.*funds the one-off and meets the investment floor/is);
  assert.match(await page.locator("#oo_funding").innerText(), /\$400,000.*With a \$0 one-off.*already misses/is);
  const setSlider = (id, amount) => page.locator(id).evaluate((input, value) => {
    input.value = String(value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, amount);
  await setSlider("#sl_oo", 400000);
  assert.match(await page.locator("#oo_funding").innerText(), /\$924,727.*first shortfall in the year ending at age 61/is);
  await setSlider("#sl_oo", 0);

  await show("guardrails");
  await page.locator("#pc_essential").fill("122000");
  await page.locator("#pc_runs").fill("12");
  await page.locator("#pc_75_kind").selectOption("hard");
  await page.locator("#pc_75_amount").fill("500000");
  await page.locator("#pc_run").click();
  assert.equal(await page.locator("#pc_output").isVisible(), true);
  assert.match(await page.locator("#pc_context").innerText(), /essentials \$122,000\/yr.*age 75 hard \$500,000/);
  await page.locator("#pc_essential").fill("150000");
  assert.equal(await page.locator("#pc_output").isVisible(), false);
  assert.equal(await page.locator("#pc_results").innerHTML(), "");
  assert.match(await page.locator("#pc_status").innerText(), /Inputs changed/);
  await page.locator("#pc_run").click();
  assert.match(await page.locator("#pc_context").innerText(), /essentials \$150,000\/yr/);
  await setSlider("#sl_likely", 6);
  assert.equal(await page.locator("#pc_output").isVisible(), false);
  await setSlider("#sl_likely", 5);

  await show("decisionbrief");
  const guide = page.locator("#v23-btn-guide");
  await guide.click();
  assert.equal(await page.locator("#v23-guide-x").evaluate(el => el === document.activeElement), true);
  await page.keyboard.press("Shift+Tab");
  assert.equal(await page.evaluate(() => !!document.activeElement.closest("#v23-guide")), true);
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("#v23-guide").isVisible(), false);
  assert.equal(await guide.evaluate(el => el === document.activeElement), true);
  await page.locator("#v23-command-link").click();
  assert.match(await page.locator("#v23-handoff-values").innerText(), /\$160,000 per year flat.*2027–28/);
  await page.getByRole("button",{name:"Stay in V23",exact:true}).click();
  assert.equal(await page.locator("#v23-handoff-dialog").isVisible(), false);

  await show("checklist");
  await page.locator('#checklist_container input[data-id="cl1"]').check();
  const backup = JSON.parse(await downloadSettings(page));
  assert.equal(backup.state.essentialSpending,122000);
  assert.equal(backup.state.salaryTaxYear,"2027-28");
  assert.equal(backup.checklist.cl1,true);

  await open(page, new URL(`?section=scenario&tool=risk&${fixture}`, base));
  const risk = page.locator(".risk-funding");
  await risk.waitFor();
  assert.match(await risk.innerText(), /Investment floor reached\s+71\.2%\s+427 of 600 paths/i);
  assert.match(await risk.innerText(), /Full budget and investment floor\s+1\.8%\s+11 of 600 paths/i);
  const riskEssentials = page.locator("#cc-risk-essentials");
  await riskEssentials.fill("122000");
  await riskEssentials.press("Enter");
  assert.match(await risk.innerText(), /Essentials and investment floor\s+2\.7%\s+16 of 600 paths/i);

  await open(page, new URL(`?section=scenario&tool=surface&${fixture}`, base));
  const surface = page.locator(".surface-canvas");
  await surface.press("ArrowRight");
  const draft = await page.getByRole("link",{name:"Review a Pool C draw in V23",exact:true}).getAttribute("href");
  const draftUrl = new URL(draft,base);
  assert.equal(draftUrl.searchParams.get("poolC"),"after-abp");
  await open(page,draftUrl);
  assert.match(await page.locator("#v23-shared-title").innerText(),/Surface draft ready/);
  assert.match(await page.locator("#v23-decision-basis").innerText(),/Keep Pool C invested/);
  await page.getByRole("button",{name:"Apply draft with Pool C draw",exact:true}).click();
  assert.match(await page.locator("#v23-decision-basis").innerText(),/Use after Pools A and B/);
  assert.match(await page.locator("#brief_reco").innerText(),/full \$2,415,000 planned/);
  await page.reload({waitUntil:"domcontentloaded"});
  assert.match(await page.locator("#v23-decision-basis").innerText(),/Use after Pools A and B/);

  await open(page,new URL(`?section=review&${fixture}`,base));
  const review = page.locator(".actual-plan-review");
  await page.getByRole("button",{name:"Capture current snapshot",exact:true}).click();
  await review.getByRole("spinbutton",{name:/^Actual lifestyle spending/}).fill("120000");
  const spending = review.locator('[data-review-field="spending"]');
  assert.deepEqual(await spending.locator("dd").allInnerTexts(),["$160,000","$120,000","$160,000"]);
  const comparison = page.locator(".shared-plan-controls");
  await comparison.locator("summary").click();
  const budget = comparison.getByRole("spinbutton",{name:"Flat net spending / year",exact:true});
  await budget.fill("122000");
  await budget.press("Tab");
  assert.deepEqual(await spending.locator("dd").allInnerTexts(),["$160,000","$120,000","$122,000"]);
  assert.match(await spending.innerText(),/\-\$40,000 vs saved forecast/);
  await page.reload({waitUntil:"domcontentloaded"});
  await review.waitFor();
  assert.deepEqual(await spending.locator("dd").allInnerTexts(),["$160,000","$120,000","$122,000"]);
}

async function exerciseDecisionWorkbench(page, base) {
  await page.evaluate(() => localStorage.clear());
  const shared = "shared=1&rail=B&pss=70-30&basis=prudent-630&spend=160000&return=.05&age=75&seed=20260814&theme=dark";
  const deep = new URL(`deep-model.html?page=decisionbrief&${shared}`, base);
  await open(page, deep);
  await page.locator("#v23-set-essentials").click();
  await page.locator("#v23_essentials").fill("122000");
  await page.locator("#v23_essentials").press("Tab");
  const later = page.locator("#v23_later_check_age");
  assert.equal(await page.locator("#v23-decision-outcomes").getByText("Investments at 85", { exact: true }).count(), 0);
  await later.fill("85");
  await later.press("Tab");
  assert.match(await page.locator("#v23-decision-outcomes").innerText(), /Full budget through 85/i);
  assert.match(await page.locator("#v23-funding-explanation").innerText(), /Pool C counts toward your investments and stays in reserve/);
  const fullBudget = page.locator("#v23-decision-outcomes .card").filter({ hasText: "Full budget through 75" });
  await fullBudget.getByRole("button", { name: "Inspect age 69" }).click();
  const trace = page.locator("#decision-trace-results");
  assert.match(await page.locator("#decision-trace-label").innerText(), /age 68 to 69/);
  const value = (root, term) => root.locator("dl > div").filter({ has: page.getByText(term, { exact: true }) }).first().locator("dd").innerText();
  assert.equal(await value(trace, "Net pension spent"), "$95,434.30");
  assert.equal(await value(trace, "Pool C spent"), "$0.00");
  assert.equal(await value(trace, "Cash flow reconciliation difference"), "$0.00");

  await page.locator("#decision-trace-age").selectOption("75");
  const download = page.waitForEvent("download");
  await page.locator("#btn-csv").click();
  const rawCsv = await readFile(await (await download).path(), "utf8");
  const [fields, ...annual] = rawCsv.split("\n").map(row => row.split(","));
  const ending75 = annual.find(row => row[0] === "75");
  const csvCapital = Number(ending75[fields.indexOf("Closing investments exact ($)")]);
  const chartCapital = (await chartValues(page, "#brief_chart", "Capital @75"))[2];
  assert.ok(Math.abs(csvCapital - chartCapital) < .005);
  assertMoney(Number((await value(trace, "Closing investments")).replace(/[$,]/g, "")), csvCapital, "Trace agrees with the exported ledger");

  await page.getByRole("button", { name: "Compare alternatives", exact: true }).click();
  await page.locator("#decision-draft-budget").fill("122000");
  await page.locator("#decision-draft-semantics").selectOption("total");
  const run = page.getByRole("button", { name: "Run plan comparison", exact: true });
  await run.click();
  const result = (id) => page.locator(`[data-draft-id="${id}"]`);
  assert.equal(await value(result("current"), "Full budget + floor through 75"), "1 of 200 (0.5%)");
  assert.equal(await value(result("reserve"), "Full budget + floor through 75"), "50 of 200 (25%)");
  assert.equal(await value(result("reserve"), "Full budget + floor through 85"), "17 of 200 (8.5%)");
  assert.equal(await value(result("reserve"), "Budget unfunded through 85"), "$366,896");
  assert.equal(await value(result("reserve"), "Investments at 85"), "$0");
  await page.locator("#decision-miss-plan").selectOption("reserve");
  assert.match(await page.locator("#decision-miss-checkpoints").innerText(), /60 of 200 histories first fall short by age 75.*157 of 200 histories first fall short by age 85/);
  const age70Miss = page.locator("#decision-miss-table tbody tr").filter({ has: page.locator('[data-miss-age="70"]') });
  assert.equal(await age70Miss.locator("td").nth(2).innerText(), "7");
  await page.locator('[data-miss-age="75"]').click();
  assert.match(await page.locator("#decision-trace-label").innerText(), /Use Pool C after A\/B.*age 74 to 75.*simulated market path/i);
  const paid = Number((await value(trace, "Spending paid")).replace(/[$,]/g, ""));
  const unpaid = Number((await value(trace, "Spending unfunded")).replace(/[$,]/g, ""));
  assert.ok(unpaid > 0);
  assertMoney(paid + unpaid, 160000, "Selected simulated year reconciles to the budget");
  assert.equal(await value(trace, "Cash flow reconciliation difference"), "$0.00");
  await page.locator("#decision-miss-kind").selectOption("essentials");
  assert.doesNotMatch(await page.locator("#decision-miss-checkpoints").innerText(), /157 of 200/);
  await result("reserve").getByRole("button", { name: "Trace first shortfall: age 79 to 80" }).click();
  assert.match(await page.locator("#decision-trace-label").innerText(), /Use Pool C after A\/B.*age 79 to 80/);
  assert.equal(await value(trace, "Cash flow reconciliation difference"), "$0.00");
  await page.getByRole("button", { name: "Inspect active plan" }).click();
  assert.equal(await value(result("budget"), "Investments at 75"), "$1,062,576");
  assert.equal(await value(result("election"), "First-year budget"), "$160,000.00");
  const splitAmounts = await page.locator(".decision-alternative dd").evaluateAll(cells => cells
    .filter(cell => cell.textContent.startsWith("$")).filter(cell => {
      const range = document.createRange();
      range.selectNodeContents(cell);
      return range.getClientRects().length !== 1;
    }).map(cell => cell.textContent));
  assert.deepEqual(splitAmounts, [], "Every dollar amount stays on one line");
  const openBudget = result("budget").getByRole("button", { name: "Preview Lower flat budget" });
  await openBudget.click();
  const preview = page.locator("#decision-draft-preview");
  assert.match(await preview.innerText(), /\$122,000\/yr total/);
  await preview.getByRole("button", { name: "Keep current plan", exact: true }).click();
  assert.match(await fullBudget.innerText(), /\$414,150 unfunded/);
  await page.locator("#decision-draft-budget").fill("125000");
  assert.equal(await page.locator("#decision-draft-results").isVisible(), false);
  assert.equal(await page.locator("#decision-first-misses").isVisible(), false);
  await page.locator("#decision-draft-budget").fill("122000");
  await run.click();
  await openBudget.click();
  const draftId = await value(preview, "Draft plan ID");
  await preview.getByRole("button", { name: "Apply draft to V23", exact: true }).click();
  await page.getByText("Lower flat budget applied in V23.", { exact: false }).waitFor();
  assert.match(await page.locator("#brief_reco").innerText(), /full \$1,830,000 planned/);
  const portable = JSON.parse(await downloadSettings(page));
  assert.equal(portable.plan.planId, draftId);
  assert.equal(portable.plan.sourceDate, "1 September 2026");
  assert.equal(portable.plan.simulationSeed, 20260814);
  assert.equal(portable.state.totalSpendTarget, 122000);
  assert.equal(portable.state.laterCheckAge, 85);

  await open(page, new URL(`?section=scenario&tool=lab&${shared}`, base));
  const calendar = page.locator(".dated-payment");
  await calendar.locator(":scope > summary").click();
  assert.match(await calendar.innerText(), /21 Dec 2033 to 30 June? 2034.*192 of 365.*\$84,164.*\$9,290/s);
  await calendar.getByText("Enter dates and balances for this calendar", { exact: true }).click();
  await calendar.getByLabel("First PSS payday (optional)").fill("2034-01-05");
  await calendar.getByLabel("Balance at next 1 July ($)").fill("400000");
  await calendar.getByLabel("Age at next 1 July").fill("65");
  await calendar.getByRole("button", { name: "Update calendar" }).click();
  assert.match(await calendar.innerText(), /13 estimated PSS paydays.*\$20,000.*26 estimated PSS paydays/s);
  const cash = calendar.getByRole("region", { name: "Cash until the first pension payments" });
  assert.match(await cash.innerText(), /No dated PSS deposit entered.*No dated ABP deposit entered/s);
  await cash.getByLabel("Starting cash ($)", { exact: true }).fill("5000");
  await cash.getByLabel("Days from retirement").fill("20");
  const movements = [
    ["pss", "2034-01-05", "3670.55"], ["abp", "2034-01-07", "2000"], ["bill", "2033-12-28", "1200"],
  ];
  for (const [index, [kind, date, amount]] of movements.entries()) {
    await cash.getByRole("button", { name: "Add dated movement" }).click();
    const fields = cash.getByRole("group", { name: `Cash movement ${index + 1}` });
    await fields.getByLabel("Type").selectOption(kind);
    await fields.getByLabel("Date", { exact: true }).fill(date);
    await fields.getByLabel("Amount ($)", { exact: true }).fill(amount);
  }
  await cash.getByRole("button", { name: "Calculate cash balance" }).click();
  assert.match(await cash.locator("#cash-bridge-lowest").innerText(), /-\$2,775\.34 on 4 Jan(?:uary)? 2034/);
  assert.match(await cash.innerText(), /29 Dec(?:ember)? 2033.*\$703\.43/s);
  await cash.getByRole("button", { name: "Show every day" }).click();
  assert.equal(await cash.locator("tbody tr").count(), 20);
  const calendarExport = JSON.parse(await downloadSettings(page, "plan only"));
  assert.equal(calendarExport.calendar.cashBridge.events[0].amount, 3670.55);
  await page.reload({waitUntil:"domcontentloaded"});
  await calendar.locator(":scope > summary").click();
  assert.match(await calendar.innerText(), /\$20,000.*26 estimated PSS paydays/s);
  assert.match(await cash.locator("#cash-bridge-lowest").innerText(), /-\$2,775\.34/);
}

async function exerciseMinimumVerdict(page, base) {
  await page.evaluate(() => localStorage.clear());
  const link = new URL("deep-model.html?page=executive&shared=1&rail=B&pss=70-30&basis=prudent-630&spend=122000&return=.05&age=75&floor=1200000", base);
  await open(page, link);
  assert.match(await page.locator("#exec_badges .status-pill").first().innerText(), /Below minimum goal.*\$137,424 below the \$1,200,000 minimum/s);
  assert.match(await page.locator("#exec_cards").innerText(), /\$1,062,576/);
  assert.match(await page.locator("#exec_tbl").innerText(), /Profile target \(reference only\)/i);
  assert.equal(await page.locator('nav [data-page="executive"] .nav-badge.bad').count(), 1);
  await open(page, new URL(link.href.replace("page=executive", "page=guardrails")));
  assert.match(await page.locator("#gr_cards").innerText(), /Protect floor.*\$137,424 below the \$1,200,000 minimum/s);
}

async function exerciseInvestmentGoalsAndExports(page, base) {
  await page.evaluate(() => localStorage.clear());
  const fixture = "shared=1&rail=B&pss=70-30&basis=prudent-630&spend=160000&return=.05&age=75&seed=20260814";
  await open(page, new URL(`?section=scenario&tool=risk&${fixture}`, base));
  const risk = page.locator(".risk-funding");
  await risk.getByRole("button", { name: "Edit investment goal and ages" }).click();
  const floor = page.locator("#cc-investment-floor"), later = page.locator("#cc-later-check-age");
  await floor.fill("700000");
  await floor.press("Tab");
  await later.fill("85");
  await later.press("Enter");
  assert.match(await risk.innerText(), /Investment goal \$700,000/);
  assert.match(await risk.locator(".risk-checkpoint").first().innerText(), /Target at age 75.*unfunded/s);
  assert.match(await risk.locator(".risk-checkpoint").last().innerText(), /Later check at age 85.*reached \$700,000/s);
  await risk.getByRole("button", { name: /Inspect first shortfall/ }).first().click();
  const trace = page.getByRole("region", { name: "Selected-year three-pool money flow" });
  assert.match(await trace.innerText(), /target remains unfunded/);
  const timing = page.getByRole("region", { name: "When spending first falls short" });
  const fullyFunded = risk.locator(".risk-checkpoint").first().locator(".metric").filter({ has: page.getByText("Full budget every year", { exact: true }) });
  const fundedPaths = parseInt(await fullyFunded.locator(".metric-sub").innerText(), 10);
  assert.match(await timing.getByRole("status").innerText(), new RegExp(`${600 - fundedPaths} of 600 histories first fall short by age 75`));
  await timing.getByRole("button", { name: /Inspect one path for age/ }).first().click();
  assert.match(await trace.innerText(), /Simulated market path [0-9]+/);
  await trace.getByRole("button", { name: "Return to steady path" }).click();
  assert.match(await trace.innerText(), /Steady return path/);
  const handoff = page.locator(".cc-goal-handoff");
  assert.equal(new URL(await handoff.getByRole("link").getAttribute("href"), base).searchParams.get("floor"), null);
  await handoff.getByRole("checkbox").check();
  const toV23 = new URL(await handoff.getByRole("link").getAttribute("href"), base);
  assert.equal(toV23.searchParams.get("floor"), "700000");
  assert.equal(toV23.searchParams.get("checkAge"), "85");
  toV23.searchParams.set("page","decisionbrief");
  await open(page, toV23);
  assert.match(await page.locator("#v23-decision-outcomes").innerText(), /\$700,000 floor.*Investments at 85/is);
  await page.locator("#v23-set-essentials").click();
  const v23Floor = page.locator("#v23_investment_floor");
  await v23Floor.fill("800000");
  await v23Floor.press("Tab");
  await page.locator("#sel_poolcpolicy").selectOption("above-reserve");
  await page.locator("#v23_poolc_reserve").fill("900000");
  await page.locator("#v23_poolc_reserve").press("Tab");
  assert.match(await page.locator("#v23-decision-outcomes").innerText(), /Pool C is .* below its reserve/);
  const note = page.locator('[data-note-key="decisionbrief"]');
  await note.fill("SYNTHETIC NOTE LOCAL TO V23");
  const portableBytes = await downloadSettings(page, "plan only");
  const portable = JSON.parse(portableBytes);
  assert.equal(portable.exportScope,"plan-only");
  assert.equal(portable.state.investmentFloor,800000);
  assert.equal(portable.state.poolCReserve,900000);
  assert.equal(portable.state.useReserveForOneOffs,false);
  assert.equal(portable.state.laterCheckAge,85);
  for(const field of ["notes","slots","slotNames","checklist"]) assert.equal(portable[field],undefined);
  assert.equal(JSON.parse(await downloadSettings(page)).notes.decisionbrief,"SYNTHETIC NOTE LOCAL TO V23");
  await v23Floor.fill("850000");
  await v23Floor.press("Tab");
  const loadV23 = (buffer) => page.locator("#inp-import-settings").setInputFiles({name:"plan-only.json",mimeType:"application/json",buffer});
  const v23Import = page.locator("#v23-import-dialog");
  await loadV23(portableBytes);
  assert.match(await v23Import.getByRole("row", {name: /Minimum investment goal/}).innerText(), /\$850,000.*\$800,000/s);
  assert.match(await v23Import.getByRole("row", {name: /Target check/}).innerText(), /funded.*unfunded.*invested/s);
  await v23Import.getByRole("button", {name:"Cancel",exact:true}).click();
  assert.equal(await v23Floor.inputValue(),"850000");
  await loadV23(portableBytes);
  await v23Import.getByRole("button", {name:"Apply import",exact:true}).click();
  await page.getByText(`Plan ${portable.plan.planId} restored with matching inputs and calculation version.`, { exact:true }).waitFor({state:"attached"});
  assert.equal(await note.inputValue(),"SYNTHETIC NOTE LOCAL TO V23");
  await page.getByRole("button", {name:"Undo import",exact:true}).click();
  assert.equal(await v23Floor.inputValue(),"850000");
  const changedBackup = { ...portable, exportScope:"backup", notes:{decisionbrief:"IMPORTED NOTE",guardrails:"IMPORTED SECOND NOTE"} };
  await loadV23(Buffer.from(JSON.stringify(changedBackup)));
  await v23Import.getByRole("button", {name:"Apply import",exact:true}).click();
  assert.equal(await note.inputValue(),"IMPORTED NOTE");
  await note.fill("EDITED AFTER IMPORT");
  await page.getByRole("button", {name:"Undo import",exact:true}).click();
  assert.equal(await note.inputValue(),"EDITED AFTER IMPORT");
  assert.equal(await page.locator('[data-note-key="guardrails"]').inputValue(),"");
  await loadV23(portableBytes);
  await v23Import.getByRole("button", {name:"Apply import",exact:true}).click();
  await page.locator("#v23-command-link").click();
  assert.match(await page.locator("#v23-handoff-comparison").innerText(), /V23 goal \$800,000.*Command Centre goal \$700,000/s);
  await page.locator("#v23-handoff-goals").check();
  const toCommand = new URL(await page.locator("#v23-handoff-open").getAttribute("href"));
  assert.equal(toCommand.searchParams.get("floor"),"800000");
  assert.equal(toCommand.searchParams.get("checkAge"),"85");
  toCommand.searchParams.set("section","review");
  await open(page,toCommand);
  await page.locator(".actual-plan-note textarea").fill("SYNTHETIC NOTE LOCAL TO COMMAND CENTRE");
  const commandBytes = await downloadSettings(page,"plan only");
  const command = JSON.parse(commandBytes);
  assert.equal(command.current.investmentFloor,800000);
  assert.equal(command.current.laterCheckAge,85);
  for(const field of ["actualCheckpoints","saved","reviewChecks","reviewSnapshot"]) assert.equal(command[field],undefined);
  assert.equal(JSON.parse(await downloadSettings(page)).actualCheckpoints[75].note,"SYNTHETIC NOTE LOCAL TO COMMAND CENTRE");
  await open(page,new URL(`?section=scenario&tool=lab&floor=500000&checkAge=none&${fixture}`,base));
  const priorPlanId = await page.locator(".command-plan-id code").textContent();
  const loadCommand = (buffer) => page.locator(".scenario-actions input[type=file]").setInputFiles({name:"plan-only.json",mimeType:"application/json",buffer});
  const ccImport = page.getByRole("dialog", {name:"Review Command Centre settings import"});
  await loadCommand(commandBytes);
  assert.match(await ccImport.getByRole("row", {name:/Minimum investment goal/}).innerText(), /\$500,000.*\$800,000/s);
  await ccImport.getByRole("button", {name:"Cancel",exact:true}).click();
  assert.equal(await page.locator(".command-plan-id code").textContent(),priorPlanId);
  await loadCommand(commandBytes);
  await ccImport.getByRole("button", {name:"Apply import",exact:true}).click();
  await page.getByText("Imported plan ID and calculation version match.",{exact:true}).waitFor({state:"attached"});
  assert.equal(await page.locator(".command-plan-id code").textContent(),command.plan.planId);
  await page.getByRole("button", {name:"Undo import",exact:true}).click();
  assert.equal(await page.locator(".command-plan-id code").textContent(),priorPlanId);
  const commandBackup = { ...command, exportScope:"backup", reviewChecks:{spending:true}, actualCheckpoints:{75:{note:"IMPORTED RECORD"}} };
  await loadCommand(Buffer.from(JSON.stringify(commandBackup)));
  await ccImport.getByRole("button", {name:"Apply import",exact:true}).click();
  const recorded = () => page.evaluate(() => JSON.parse(localStorage.getItem("robinson-retirement-actual-checkpoints"))[75].note);
  assert.equal(await recorded(),"IMPORTED RECORD");
  await page.getByRole("button", {name:"Undo import",exact:true}).click();
  assert.equal(await recorded(),"SYNTHETIC NOTE LOCAL TO COMMAND CENTRE");
  await open(page,new URL("?section=review",base));
  assert.equal(await page.locator(".actual-plan-note textarea").inputValue(),"SYNTHETIC NOTE LOCAL TO COMMAND CENTRE");
}

async function exerciseSideMenu(page, base) {
  const originalViewport = page.viewportSize();
  const scenario = new URL("?section=scenario&tool=explore&shared=1&spend=122000&age=75",base);
  const menu = page.locator("#nav-menu-button");
  const sidebar = page.locator("#retirement-sidebar");
  const chart = page.locator(".integrated-explorer iframe");
  const chartWidth = () => chart.evaluate(frame => frame.getBoundingClientRect().width);
  await page.evaluate(() => localStorage.removeItem("robinson-retirement-nav-collapsed"));
  try {
    await page.setViewportSize({ width:1920, height:950 });
    await open(page,scenario);
    await page.getByRole("button",{name:"Hide menu",exact:true}).waitFor();
    const withSidebar = await chartWidth();
    await menu.click();
    await sidebar.waitFor({state:"hidden"});
    assert.equal(await menu.getAttribute("aria-expanded"),"false");
    assert.ok(await sidebar.evaluate(element=>element.inert));
    const withRoom = await chartWidth();
    assert.ok(withRoom - withSidebar >= 200, "Hiding the menu gives the wide chart back the sidebar's space");
    await page.reload({waitUntil:"domcontentloaded"});
    await page.getByRole("button",{name:"Show menu",exact:true}).waitFor();
    assert.equal(await chartWidth(),withRoom);
    await menu.press("[");
    await sidebar.waitFor();
    assert.equal(await menu.getAttribute("aria-expanded"),"true");
    await menu.press("[");
    await sidebar.waitFor({state:"hidden"});

    await page.setViewportSize({ width:1024, height:800 });
    await page.locator(".app-layout:not(.nav-collapsed)").waitFor();
    const tabletWidth = await chartWidth();
    await menu.click();
    await sidebar.waitFor();
    assert.equal(await sidebar.evaluate(element=>getComputedStyle(element).position),"fixed");
    assert.equal(await chartWidth(),tabletWidth,"The tablet drawer leaves the chart width alone");
    await page.keyboard.press("Escape");
    await sidebar.waitFor({state:"hidden"});
    assert.ok(await menu.evaluate(element=>element===document.activeElement));
    await menu.click();
    await sidebar.getByRole("button",{name:/^PSS/}).click();
    await sidebar.waitFor({state:"hidden"});
    await page.waitForFunction(()=>new URLSearchParams(location.search).get("section")==="pss");

    await page.setViewportSize({ width:320, height:720 });
    await page.getByRole("button",{name:"Show menu",exact:true}).waitFor();
    await menu.click();
    await sidebar.waitFor();
    assert.ok(await page.locator(".topbar").evaluate(element=>element.scrollWidth<=element.clientWidth+1));
    await page.setViewportSize({ width:1440, height:950 });
    await page.getByRole("button",{name:"Show menu",exact:true}).waitFor();
    await sidebar.waitFor({state:"hidden"});
    assert.equal(await page.locator(".nav-backdrop").count(),0);
  } finally {
    await page.setViewportSize(originalViewport);
    await page.evaluate(() => localStorage.removeItem("robinson-retirement-nav-collapsed"));
  }
}

async function exerciseGuideHelp(page, base) {
  await page.evaluate(() => localStorage.clear());
  const shared = "shared=1&rail=B&pss=70-30&basis=prudent-630&spend=160000&return=.05&age=74&floor=710000&checkAge=86";
  await open(page, new URL(`deep-model.html?page=decisionbrief&${shared}`, base));
  const launch = page.locator("#v23-btn-guide");
  const guide = page.locator("#v23-guide");
  const guideBody = guide.locator("#v23-guide-body");
  await launch.click();
  assert.match(await guideBody.innerText(), /Ages 74 and 86\s+\$710,000 minimum total investments/);
  const quick = guide.getByRole("button", { name: "Quick start", exact: true });
  await quick.click();
  assert.equal(await quick.getAttribute("aria-pressed"),"true");
  assert.match(await guideBody.innerText(), /\$160,000 from 60 and \$122,000 from 70/);
  assert.match(await guideBody.innerText(), /Command Centre compares a flat annual budget in Lab, Explore, Compare, Frontier, Surface and Risk/);
  assert.equal(await guide.locator(".v23-modal").evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
  await guide.getByRole("button", { name:"Controls", exact:true }).click();
  assert.match(await guideBody.innerText(),/A blank reserve keeps Pool C invested/);
  assert.match(await guideBody.innerText(),/Full backup also includes notes, saved slots and checklist/);
  await guide.getByRole("button", { name:"All pages", exact:true }).click();
  const guideItems = guideBody.locator(".v23-guide-item");
  assert.equal(await guideItems.count(),33);
  assert.ok((await guideItems.locator("p").allTextContents()).every(text=>text.trim().length>0));
  await guideBody.locator('[data-guide-page="montecarlo"]').click();
  await page.locator("#page-montecarlo").waitFor();
  assert.equal(await guide.isVisible(),false);
  await launch.click();
  assert.match(await guideBody.innerText(),/Ages 74 and 86\s+\$710,000 minimum total investments/);
  await page.keyboard.press("Escape");
  await open(page,new URL(`?section=scenario&tool=risk&${shared}`,base));
  const help = page.locator(".workspace-guide");
  await help.locator(":scope > summary").click();
  assert.match(await help.innerText(),/600 histories with 12% volatility.*separate sample/s);
  await help.getByText("Plan controls, handoff and backups",{exact:true}).click();
  assert.match(await help.innerText(),/Download full backup to include saved plans, checklist and recorded actuals/);
  const reference = help.getByRole("link",{name:"Open the guide and model reference",exact:true});
  await reference.click();
  await page.locator("#using-the-planner").waitFor();
  assert.match(await page.locator("#scope").innerText(),/\$160,000 from 60 and \$122,000 from 70/);
  assert.match(await page.locator("#scope").innerText(),/\$320,000 in Pool C and \$300,000 reserved/);
}

async function exerciseAIContextPrivacy(page, base) {
  const requests = [];
  const endpoint = "**/api/retirement-ai";
  await page.route(endpoint, async route => {
    const headers = { "access-control-allow-origin":"*", "access-control-allow-methods":"POST, OPTIONS", "access-control-allow-headers":"content-type" };
    if (route.request().method() === "OPTIONS") { await route.fulfill({ status: 204, headers }); return; }
    requests.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, headers, contentType: "text/event-stream", body: 'data: {"text":"Synthetic privacy response"}\n\n' });
  });
  const check = async ({ panel, input, preview, notes, secret, optionalKey, draft }) => {
    await panel.getByText("Preview data before sending", { exact:true }).click();
    const field = panel.locator(input);
    const send = panel.getByRole("button", { name:"Send", exact:true });
    await field.fill(draft);
    assert.equal(JSON.parse(await panel.locator(preview).textContent()).context[optionalKey], undefined);
    await send.click();
    await panel.getByText("Synthetic privacy response", { exact:true }).last().waitFor();
    assert.equal(requests.at(-1).context[optionalKey], undefined);
    assert.ok(!JSON.stringify(requests.at(-1)).includes(secret));
    assert.equal(requests.at(-1).messages.length, 1);
    await panel.getByLabel("Include saved reviews and scenarios").check();
    assert.ok(!JSON.stringify(JSON.parse(await panel.locator(preview).textContent()).context).includes(secret));
    await panel.getByLabel(notes).check();
    assert.ok(JSON.stringify(JSON.parse(await panel.locator(preview).textContent()).context).includes(secret));
    await field.fill("Send the selected note.");
    await send.click();
    await panel.getByText("Synthetic privacy response", { exact:true }).nth(1).waitFor();
    assert.ok(JSON.stringify(requests.at(-1).context[optionalKey]).includes(secret));
    assert.equal(requests.at(-1).messages.length, 1, "Previous chat needs explicit opt-in");
  };
  try {
    await open(page, new URL("deep-model.html?page=decisionbrief&shared=1&rail=B&pss=70-30&spend=122000",base));
    await page.locator('[data-note-key="decisionbrief"]').fill("SYNTHETIC PRIVATE V23 NOTE");
    await page.locator("#v23-ai-launcher").click();
    await check({ panel:page.locator("#v23-ai-panel"), input:"#v23-ai-input", preview:"#v23-ai-context-preview",
      notes:"Include personal adviser notes", secret:"SYNTHETIC PRIVATE V23 NOTE", optionalKey:"adviserNotes", draft:"Check the model." });
    await open(page,new URL("?section=review",base));
    await page.locator(".actual-plan-note textarea").fill("SYNTHETIC PRIVATE CC NOTE");
    await page.locator(".ai-launcher").click();
    await check({ panel:page.locator("#retirement-ai-panel"), input:"#retirement-ai-message", preview:"#cc-ai-context-preview",
      notes:"Include personal review notes", secret:"SYNTHETIC PRIVATE CC NOTE", optionalKey:"reviewNotes", draft:"Check the review basis." });
  } finally {
    await page.unroute(endpoint);
  }
}

async function exerciseOfflineWorkbench(browser, base) {
  const context = await browser.newContext(mobileOptions);
  try {
    const page = await context.newPage();
    await open(page, new URL("model-reference.txt", base));
    const retiredCaches = [28, 29, 30, 31, 32, 33, 34, 35, 36].map(version => `robinson-retirement-pages-v${version}`);
    await page.evaluate(async retiredCaches => {
      await Promise.all(retiredCaches.map(name => caches.open(name)));
      await caches.open("unrelated-site-cache");
    }, retiredCaches);
    const deep = new URL("deep-model.html?page=decisionbrief&shared=1&rail=B&pss=70-30&basis=prudent-630&spend=160000&return=.05&age=75", base);
    await open(page, deep);
    const canonical = page.url();
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    const cacheNames = await page.evaluate(() => caches.keys());
    assert.ok(cacheNames.includes("unrelated-site-cache"), "Cache activation leaves other sites' caches intact");
    assert.ok(retiredCaches.every(name => !cacheNames.includes(name)), "The obsolete retirement caches are removed");
    await context.setOffline(true);
    const cold = await context.newPage();
    await open(cold, new URL("?section=scenario&tool=lab", base));
    await cold.locator(".shared-plan-controls").waitFor();
    await cold.close();
    for (const url of new Set([canonical, deep.href])) {
      await open(page, new URL(url));
      assert.match(await page.locator("#v23-decision-summary").innerText(), /\$414,150 unfunded.*age 69/s);
    }
    await page.evaluate(() => {
      const legacy = JSON.parse(localStorage.getItem("v23_4_state"));
      legacy.totalSpendTarget = null;
      legacy.gapBands = [{age:60,amount:25000,unit:"dollar",startOnBirthday:false},{age:70,amount:15000,unit:"dollar",startOnBirthday:false}];
      delete legacy.sharedImport;
      localStorage.removeItem("v23_4_state");
      localStorage.setItem("v23_3_state", JSON.stringify(legacy));
      localStorage.setItem("v23_welcome", "done");
    });
    const older = await context.newPage();
    const income = new URL("deep-model.html?page=income", base);
    await open(older, income);
    const toggle = older.locator("#plan-controls-toggle");
    if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
    const amount = older.locator('[data-band-amount="0"]');
    assert.equal(await amount.inputValue(),"25000");
    await amount.fill("27000");
    await amount.press("Tab");
    const update = await older.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      const active = registration.active;
      try { await registration.update(); } catch { /* network unavailable */ }
      return { offline:!navigator.onLine, sameWorker:registration.active===active, waiting:Boolean(registration.waiting) };
    });
    assert.deepEqual(update,{offline:true,sameWorker:true,waiting:false},"An offline update leaves the installed release available");
    await older.reload({waitUntil:"domcontentloaded"});
    if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
    assert.equal(await amount.inputValue(),"27000");
    if (!url) {
      await context.setOffline(false);
      const interrupted = await older.evaluate(async () => {
        const installed=await navigator.serviceWorker.ready;
        const script=new URL(installed.active.scriptURL);
        script.searchParams.set("test-install","missing-asset");
        const prior=installed.active.scriptURL;
        const next=await navigator.serviceWorker.register(script.href,{scope:installed.scope});
        const candidate=next.installing;
        if (candidate&&!["redundant","activated"].includes(candidate.state)) await new Promise(resolve => {
          const timeout=setTimeout(resolve,5000);
          candidate.addEventListener("statechange", () => {
            if (["redundant","activated"].includes(candidate.state)){clearTimeout(timeout);resolve();}
          });
        });
        return {retained:next.active?.scriptURL===prior,badCache:(await caches.keys()).includes("robinson-retirement-pages-v-interrupted")};
      });
      assert.deepEqual(interrupted,{retained:true,badCache:false},"A replacement with a missing launch asset keeps the installed worker and removes its incomplete cache");
    }
    await older.close();
    console.log(`Retirement cache upgrade and offline V23 passed on ${base.href}`);
  } finally {
    await context.close();
  }
}

const preview = url ? { base: new URL(url.endsWith("/") ? url : url + "/") } : await serveBuild();
let browser;
try {
  browser = await (defaultBrowserType === "webkit" ? webkit : chromium).launch();
  for (const width of mobileEngine ? [mobileOptions.viewport.width] : [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 950 }, ...mobileOptions, locale: "en-AU", reducedMotion: "reduce" });
    try {
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await exerciseV23(page, preview.base);
      if (!mobileEngine) {
        await exerciseV23EdgeCases(page, preview.base);
        await exerciseExplorer(page, preview.base);
        await exerciseAuditedControls(page, preview.base);
        await exerciseBandEditor(page, preview.base);
        await exerciseDecisionBrief(page, preview.base);
        await exerciseDecisionIntegrity(page, preview.base);
      }
      await exerciseDecisionWorkbench(page, preview.base);
      await exerciseMinimumVerdict(page, preview.base);
      await exerciseInvestmentGoalsAndExports(page, preview.base);
      await exerciseGuideHelp(page, preview.base);
      if (!mobileEngine && width === 1440) await exerciseSideMenu(page, preview.base);
      await exerciseAIContextPrivacy(page, preview.base);
      assert.deepEqual(errors, [], `Browser errors at ${width}px`);
      console.log(`Retirement browser journeys passed at ${width}px${mobileEngine ? ` (${mobileEngine} profile)` : ""} on ${preview.base.href}`);
    } finally {
      await context.close();
    }
  }
  await exerciseOfflineWorkbench(browser, preview.base);
} finally {
  await browser?.close();
  preview.server?.close();
}
