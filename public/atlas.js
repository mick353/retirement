(function () {
  "use strict";

  const TBC = 2_100_000;
  const TSB_BUFFER = 5_000;
  const POOL_C_DRAG = 0.0035;
  const HOME_FLOOR = 500_000;
  const GROSS_ESTATE_FLOOR = 1_000_000;
  const WASH_AMOUNT = 130_000;

  const RAILS = {
    A: {
      key: "A",
      title: "Rail A — conservative wealth benchmark",
      short: "Conservative wealth / investment benchmark",
      source: "March iEstimator · V5/V23 control",
      purpose: "Preserves the March/V5 control baseline for investment-only wealth benchmarks and the canonical NCC-wash mechanics research.",
      fas: 143_700.42,
      grossPension: 78_382.04,
      netPension: 76_041.68,
      lumpSum: 574_801.66,
      hostplus: 317_447.66,
      capital: 892_249.32,
      dbSpecialValue: 1_254_112.64,
      poolA: 840_887.36,
      poolC: 51_361.96,
      lumpTaxFree: null,
      lumpTaxableTaxed: null,
      washTaxableShare: 0.709677,
      washEvidence: "Master-locked planning convention: 70.97% taxable-taxed, 29.03% tax-free and 0% untaxed. This convention is held across rails pending a deliberate master revision; confirm provider execution and account components before acting.",
      taxStatus: "Modelled Rail A wash profile",
    },
    B: {
      key: "B",
      title: "Rail B — spending frontier",
      short: "Spending frontier / lifestyle optionality",
      source: "2 July 2026 iEstimator · frontier report",
      purpose: "Uses the newer 2 July iEstimator to test spending power against a property-inclusive estate floor.",
      fas: 151_343.31,
      grossPension: 82_550.89,
      netPension: 76_302.72,
      lumpSum: 605_373.22,
      hostplus: 317_447.66,
      capital: 922_820.88,
      dbSpecialValue: 1_320_814.24,
      poolA: 774_185.76,
      poolC: 148_635.12,
      lumpTaxFree: 175_753.71,
      lumpTaxableTaxed: 429_619.52,
      washTaxableShare: 0.709677,
      washEvidence: "Master-locked 60/40 engine convention: 70.97% taxable-taxed, 29.03% tax-free and 0% untaxed. The July PSS lump agrees; confirm provider execution and account components before acting.",
      taxStatus: "Modelled Rail B wash profile",
    },
  };

  const $ = (id) => document.getElementById(id);
  const money0 = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
  const money2 = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const compact = (value) => value >= 1_000_000 ? `$${(value / 1_000_000).toFixed(2)}m` : `$${Math.round(value / 1_000).toLocaleString("en-AU")}k`;
  const pct = (value, digits = 1) => `${(value * 100).toFixed(digits)}%`;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const params = new URLSearchParams(location.search);
  const parsedReturn = Number(params.get("return"));
  const state = {
    rail: params.get("rail") === "A" ? "A" : "B",
    spend: clamp(Number(params.get("spend")) || 110_000, 76_000, 150_000),
    realReturn: clamp(Number.isFinite(parsedReturn) && parsedReturn > 0 ? parsedReturn : 0.05, 0.02, 0.075),
    targetAge: clamp(Number(params.get("age")) || 75, 70, 95),
    home: clamp(Number(params.get("home")) || HOME_FLOOR, 300_000, 1_000_000),
    taxYear: params.get("taxYear") === "2027-28" ? "2027-28" : "2026-27",
    liquidityMonths: clamp(Number(params.get("reserveMonths")) || 12, 0, 24),
    simulationSeed: clamp(Number(params.get("seed")) || 20260814, 1, 2_147_483_647),
    selectedIncomeAge: 61,
    selectedCapitalAge: clamp(Number(params.get("age")) || 75, 60, 95),
    inspectionAge: clamp(Number(params.get("age")) || 75, 60, 95),
    washCycles: 6,
    visualMode: ["horizon", "river", "orbit", "waterfall", "sunburst", "table"].includes(params.get("view")) ? params.get("view") : "horizon",
    visualPerspective: true,
    compareRail: false,
  };

  let charts = { income: null, capital: null, frontier: null };
  let activeVisualLedger = [];
  let visualGeometry = null;
  let visualPointerDown = false;
  let visualPlayTimer = null;
  let toastTimer;

  function drawRate(age) {
    const ageAt1July = Math.max(0, age - 1);
    if (ageAt1July < 65) return 0.04;
    if (ageAt1July < 75) return 0.05;
    if (ageAt1July < 80) return 0.06;
    if (ageAt1July < 85) return 0.07;
    if (ageAt1July < 90) return 0.09;
    if (ageAt1July < 95) return 0.11;
    return 0.14;
  }

  function incomeTax(gross, taxYear = state.taxYear) {
    const lowerRate = taxYear === "2027-28" ? 0.14 : 0.15;
    let tax = 0;
    if (gross > 18_200) tax += (Math.min(gross, 45_000) - 18_200) * lowerRate;
    if (gross > 45_000) tax += (Math.min(gross, 135_000) - 45_000) * 0.30;
    if (gross > 135_000) tax += (Math.min(gross, 190_000) - 135_000) * 0.37;
    if (gross > 190_000) tax += (gross - 190_000) * 0.45;
    return Math.max(0, tax);
  }

  function salaryNet(gross, taxYear = state.taxYear) {
    return gross - incomeTax(gross, taxYear) - gross * 0.02;
  }

  function grossForNet(target, taxYear = state.taxYear) {
    let low = target;
    let high = 500_000;
    for (let index = 0; index < 70; index += 1) {
      const midpoint = (low + high) / 2;
      if (salaryNet(midpoint, taxYear) < target) low = midpoint;
      else high = midpoint;
    }
    return high;
  }

  function operationalLedger(rail, spend, realReturn) {
    let poolA = rail.poolA;
    let poolC = rail.poolC;
    const rows = [{
      year: "2033 launch", age: 60, pension: 0, openingA: poolA, openingC: poolC,
      poolA, poolC, mandatory: 0, draw: 0, spend: 0, fundedSpend: 0, shortfall: 0, reinvestment: 0,
      externalTaxDrag: 0, netIncome: 0, grossEquivalent: 0, ending: poolA + poolC,
    }];
    for (let age = 61; age <= 95; age += 1) {
      const openingA = poolA;
      const openingC = poolC;
      const mandatory = openingA * drawRate(age);
      const lifestyleGap = Math.max(0, spend - rail.netPension);
      const draw = Math.min(openingA, Math.max(mandatory, lifestyleGap));
      const netIncome = rail.netPension + draw;
      const fundedSpend = Math.min(spend, netIncome);
      const shortfall = Math.max(0, spend - netIncome);
      const reinvestment = Math.max(0, netIncome - spend);
      const externalTaxDrag = openingC * POOL_C_DRAG;
      poolA = Math.max(0, openingA * (1 + realReturn) - draw);
      poolC = Math.max(0, openingC * (1 + realReturn) - externalTaxDrag + reinvestment);
      rows.push({
        year: `${2033 + age - 60}-${String(34 + age - 60).slice(-2)}`,
        age, pension: rail.netPension, openingA, openingC, poolA, poolC, mandatory,
        draw, spend, fundedSpend, shortfall, reinvestment, externalTaxDrag, netIncome,
        grossEquivalent: grossForNet(netIncome), ending: poolA + poolC,
      });
    }
    return rows;
  }

  function endingAt(rail, spend, realReturn, age) {
    return operationalLedger(rail, spend, realReturn).find((row) => row.age === age)?.ending || rail.capital;
  }

  function rowAt(ledger, age) {
    return ledger.find((row) => row.age === age) || ledger[ledger.length - 1];
  }

  function currentRail() {
    return RAILS[state.rail];
  }

  function scenarioQuery() {
    const query = new URLSearchParams({
      shared: "1",
      rail: state.rail,
      spend: String(Math.round(state.spend)),
      return: String(Number(state.realReturn.toFixed(4))),
      age: String(state.targetAge),
      home: String(Math.round(state.home)),
      taxYear: state.taxYear,
      reserveMonths: String(state.liquidityMonths),
      seed: String(state.simulationSeed),
      view: state.visualMode,
    });
    return query.toString();
  }

  function persistScenario() {
    const payload = { version: 4, updatedAt: new Date().toISOString(), rail: state.rail, spend: state.spend, realReturn: state.realReturn, targetAge: state.targetAge, homeValue: state.home, taxYear: state.taxYear, liquidityMonths: state.liquidityMonths, simulationSeed: state.simulationSeed };
    try { localStorage.setItem("robinson-retirement-shared-scenario", JSON.stringify(payload)); } catch { /* device-local convenience only */ }
    history.replaceState(null, "", `${location.pathname}?${scenarioQuery()}${location.hash}`);
    const v23 = `./deep-model.html?${scenarioQuery()}`;
    $("headerV23").href = v23;
    $("v23Link").href = v23;
    document.querySelectorAll('[data-target="v23"]').forEach((link) => { link.href = v23; });
    const command = `./?${scenarioQuery()}`;
    $("commandLink").href = command;
    document.querySelectorAll('[data-target="command"]').forEach((link) => { link.href = command; });
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    $("toast").textContent = message;
    $("toast").classList.add("show");
    toastTimer = setTimeout(() => $("toast").classList.remove("show"), 2200);
  }

  function chartTheme() {
    const style = getComputedStyle(document.documentElement);
    return {
      text: style.getPropertyValue("--muted").trim(),
      line: style.getPropertyValue("--line").trim(),
      blue: style.getPropertyValue("--blue").trim(),
      green: style.getPropertyValue("--green").trim(),
      amber: style.getPropertyValue("--amber").trim(),
      violet: style.getPropertyValue("--violet").trim(),
      danger: style.getPropertyValue("--danger").trim(),
    };
  }

  function baseChartOptions(onClick) {
    const colors = chartTheme();
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      animation: { duration: matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 300 },
      onClick,
      plugins: {
        legend: { position: "bottom", labels: { color: colors.text, usePointStyle: true, boxWidth: 8, boxHeight: 8, padding: 18, font: { size: 10, weight: 700 } } },
        tooltip: { callbacks: { label: (context) => `${context.dataset.label}: ${money0.format(context.parsed.y)}` } },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: colors.text, maxTicksLimit: 9, font: { size: 10, weight: 700 } } },
        y: { beginAtZero: true, grid: { color: colors.line }, ticks: { color: colors.text, callback: (value) => compact(Number(value)), font: { size: 10, weight: 700 } } },
      },
    };
  }

  function chartIndex(chart, event, elements) {
    if (elements.length) return elements[0].index;
    const point = Chart.helpers.getRelativePosition(event, chart);
    return clamp(Math.round(chart.scales.x.getValueForPixel(point.x)), 0, chart.data.labels.length - 1);
  }

  function renderIncomeChart(ledger) {
    const operatingRows = ledger.filter((row) => row.age > 60);
    const colors = chartTheme();
    if (charts.income) charts.income.destroy();
    charts.income = new Chart($("incomeChart"), {
      type: "line",
      data: {
        labels: operatingRows.map((row) => `${row.age - 1}→${row.age}`),
        datasets: [
          { label: "Target spending", data: operatingRows.map((row) => row.spend), borderColor: colors.amber, backgroundColor: colors.amber, borderWidth: 2.5, pointRadius: 0, tension: .18 },
          { label: "Funded spending", data: operatingRows.map((row) => row.fundedSpend), borderColor: colors.green, backgroundColor: colors.green, borderWidth: 2.25, pointRadius: 0, borderDash: [5, 4], tension: .18 },
          { label: "Net PSS pension", data: operatingRows.map((row) => row.pension), borderColor: colors.violet, backgroundColor: colors.violet, borderWidth: 3, pointRadius: 0, tension: .12 },
          { label: "ABP draw", data: operatingRows.map((row) => row.draw), borderColor: colors.blue, backgroundColor: colors.blue, borderWidth: 2.5, pointRadius: 0, tension: .18 },
          { label: "Reinvested surplus", data: operatingRows.map((row) => row.reinvestment), borderColor: colors.green, backgroundColor: colors.green, borderWidth: 2, pointRadius: 0, borderDash: [5, 4], tension: .18 },
        ],
      },
      options: baseChartOptions((event, elements, chart) => {
        const index = chartIndex(chart, event, elements);
        state.selectedIncomeAge = operatingRows[index].age;
        renderSelectedCashflow(operatingRows[index]);
      }),
    });
  }

  function renderSelectedCashflow(row) {
    $("incomeAgeSelect").value = String(row.age);
    $("selectedAge").textContent = `${row.age - 1}→${row.age}`;
    $("selectedPension").textContent = money0.format(row.pension);
    $("selectedDraw").textContent = money0.format(row.draw);
    $("selectedSpend").textContent = money0.format(row.spend);
    $("selectedFundedSpend").textContent = money0.format(row.fundedSpend);
    $("selectedShortfall").textContent = row.shortfall > 0 ? money0.format(row.shortfall) : "—";
    $("selectedReinvestment").textContent = money0.format(row.reinvestment);
    $("selectedGross").textContent = money0.format(row.grossEquivalent);
  }

  function withAlpha(color, alpha) {
    if (/^#[0-9a-f]{6}$/i.test(color)) return `${color}${Math.round(alpha * 255).toString(16).padStart(2, "0")}`;
    return color;
  }

  const VISUAL_MODE_COPY = {
    horizon: {
      label: "RETIREMENT HORIZON",
      hint: "Drag across the terrain or use the age controls",
      summary: "The active ledger is illuminated inside a deterministic real-return corridor. Change the return above and the full surface recalculates.",
      disclosure: "Horizon compares deterministic real-return paths around the active rate. These are scenario slices, not probabilities. The illuminated path and every readout use the active annual ledger.",
    },
    river: {
      label: "FINANCIAL RIVER",
      hint: "Move the time gate to inspect what funds each year",
      summary: "Annual PSS, portfolio draw and reinvestment flows sit above a separately scaled Pool A and Pool C capital river, avoiding any mix of income and stock units.",
      disclosure: "Financial River keeps annual cash flows and capital stocks on separate visual scales. Flow widths and the selected-age gate recalculate from the same active ledger.",
    },
    orbit: {
      label: "LEGACY ORBIT",
      hint: "Drag around the age orbit or select a capital layer",
      summary: "A spatial cross-section separates Pool A, Pool C and the real home while the age orbit moves the same ledger through time.",
      disclosure: "Legacy Orbit is a composition view. The central layers are real capital and home values; the PSS floor remains an annual-income halo and is never added to estate capital.",
    },
    waterfall: {
      label: "CAPITAL WATERFALL",
      hint: "Use the age controls to reconcile any planning year",
      summary: "Opening capital, real earnings, draw, external tax drag and reinvestment reconcile exactly to the selected year-end balance.",
      disclosure: "Waterfall uses exact annual ledger movements in real dollars. Pool A and Pool C earnings are calculated at the active real return; Pool C then carries the modelled 0.35% distribution drag.",
    },
    sunburst: {
      label: "ESTATE SUNBURST",
      hint: "Move through time to see the composition rebalance",
      summary: "The selected estate is decomposed into Pool A, Pool C and the real home, with the PSS coverage ring shown separately as annual income context.",
      disclosure: "Sunburst shows composition, not certainty. The home is held constant in real dollars and the investment layers come from the active annual ledger.",
    },
    table: {
      label: "EXACT ANNUAL LEDGER",
      hint: "Select a row or use the age controls",
      summary: "Every birthday-year row exposes the exact values behind all five graphical views.",
      disclosure: "The table is the exact annual real-dollar ledger used by every visual mode. Age 60 is the opening snapshot; annual pension, draw, spending and growth begin in the age 60→61 row.",
    },
  };

  function canvasFrame() {
    const canvas = $("visualCanvas");
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(320, Math.round(rect.width));
    const height = Math.max(360, Math.round(rect.height));
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const context = canvas.getContext("2d");
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    return { canvas, context, width, height };
  }

  function visualPalette(light = false) {
    return light ? {
      bg: "#f8fbff", panel: "#ffffff", text: "#10203a", muted: "#637994", grid: "#d8e3f2",
      blue: "#2f67dc", green: "#11845e", amber: "#d17a12", violet: "#7650c8", cyan: "#47b9d7", danger: "#c53c56",
    } : {
      bg: "#030b16", panel: "#08182b", text: "#edf4ff", muted: "#8da7ca", grid: "#17304e",
      blue: "#5f8dff", green: "#4bd9aa", amber: "#f3aa52", violet: "#bd79ff", cyan: "#54c7e8", danger: "#ff728c",
    };
  }

  function traceLine(context, values, x, y) {
    context.beginPath();
    values.forEach((value, index) => index ? context.lineTo(x(index), y(value, index)) : context.moveTo(x(index), y(value, index)));
  }

  function fillBetween(context, upper, lower, x, y, fill) {
    context.beginPath();
    upper.forEach((value, index) => index ? context.lineTo(x(index), y(value, index)) : context.moveTo(x(index), y(value, index)));
    for (let index = lower.length - 1; index >= 0; index -= 1) context.lineTo(x(index), y(lower[index], index));
    context.closePath();
    context.fillStyle = fill;
    context.fill();
  }

  function drawPerspectiveFloor(context, width, height, pad, palette) {
    const horizon = height - pad.b;
    const depth = state.visualPerspective ? Math.min(68, height * .14) : 0;
    context.save();
    context.strokeStyle = withAlpha(palette.grid, .72);
    context.lineWidth = 1;
    for (let index = 0; index <= 8; index += 1) {
      const xx = pad.l + index / 8 * (width - pad.l - pad.r);
      context.beginPath();
      context.moveTo(xx, horizon);
      context.lineTo(width / 2 + (xx - width / 2) * .72, horizon - depth);
      context.stroke();
    }
    for (let index = 0; index <= 4; index += 1) {
      const yy = horizon - index / 4 * depth;
      const inset = index / 4 * (width * .07);
      context.beginPath();
      context.moveTo(pad.l + inset, yy);
      context.lineTo(width - pad.r - inset, yy);
      context.stroke();
    }
    context.restore();
  }

  function drawHorizon(frame, ledger) {
    const { context, width, height } = frame;
    const palette = visualPalette(false);
    const pad = { l: width < 620 ? 48 : 68, r: width < 620 ? 24 : 76, t: 76, b: 62 };
    const rates = [...new Set([.02, .04, state.realReturn, .065, .075].map((value) => Number(value.toFixed(4))))].sort((a, b) => a - b);
    const paths = rates.map((rate) => operationalLedger(currentRail(), state.spend, rate));
    const maximum = Math.max(...paths.flatMap((path) => path.map((row) => row.ending)), 1) * 1.08;
    const x = (index) => pad.l + index / Math.max(1, ledger.length - 1) * (width - pad.l - pad.r);
    const y = (value, index = 0, layer = 0) => pad.t + (1 - value / maximum) * (height - pad.t - pad.b) - (state.visualPerspective ? layer * 5 + index * .08 : 0);
    const gradient = context.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "#0a2441");
    gradient.addColorStop(1, palette.bg);
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
    drawPerspectiveFloor(context, width, height, pad, palette);

    context.font = "700 10px Arial, sans-serif";
    context.fillStyle = palette.muted;
    context.textBaseline = "middle";
    for (let tick = 0; tick <= 4; tick += 1) {
      const yy = pad.t + tick / 4 * (height - pad.t - pad.b);
      context.strokeStyle = withAlpha(palette.grid, .72);
      context.beginPath(); context.moveTo(pad.l, yy); context.lineTo(width - pad.r, yy); context.stroke();
      context.textAlign = "right";
      context.fillText(compact(maximum * (1 - tick / 4)), pad.l - 8, yy);
    }

    const sortedValues = paths.map((path) => path.map((row) => row.ending));
    for (let index = 0; index < sortedValues.length - 1; index += 1) {
      fillBetween(context, sortedValues[index + 1], sortedValues[index], x, (value, point) => y(value, point, index), withAlpha(index % 2 ? palette.blue : palette.violet, .13 + index * .035));
    }

    paths.forEach((path, layer) => {
      const active = rates[layer] === state.realReturn;
      const values = path.map((row) => row.ending);
      traceLine(context, values, x, (value, index) => y(value, index, layer));
      context.strokeStyle = active ? palette.green : [palette.violet, palette.blue, palette.cyan, palette.amber, palette.violet][layer];
      context.lineWidth = active ? 4 : 1.6;
      context.globalAlpha = active ? 1 : .62;
      context.shadowColor = active ? palette.green : "transparent";
      context.shadowBlur = active ? 13 : 0;
      context.stroke();
      context.shadowBlur = 0;
      context.globalAlpha = 1;
      const last = values.length - 1;
      context.fillStyle = active ? palette.green : palette.muted;
      context.font = active ? "900 10px Arial, sans-serif" : "700 9px Arial, sans-serif";
      context.textAlign = "left";
      context.fillText(`${pct(rates[layer])}${active ? " active" : ""}`, x(last) + 7, y(values[last], last, layer));
    });

    if (state.compareRail) {
      const other = operationalLedger(RAILS[state.rail === "A" ? "B" : "A"], state.spend, state.realReturn).map((row) => row.ending);
      traceLine(context, other, x, (value, index) => y(value, index, 0));
      context.setLineDash([7, 6]); context.strokeStyle = palette.amber; context.lineWidth = 2; context.globalAlpha = .9; context.stroke(); context.setLineDash([]); context.globalAlpha = 1;
    }

    const selectedIndex = clamp(state.selectedCapitalAge - 60, 0, ledger.length - 1);
    const selectedX = x(selectedIndex);
    const plane = context.createLinearGradient(selectedX, pad.t, selectedX, height - pad.b);
    plane.addColorStop(0, withAlpha(palette.cyan, .03)); plane.addColorStop(.5, withAlpha(palette.cyan, .26)); plane.addColorStop(1, withAlpha(palette.cyan, .04));
    context.fillStyle = plane; context.fillRect(selectedX - 5, pad.t, 10, height - pad.t - pad.b);
    context.strokeStyle = palette.cyan; context.lineWidth = 2; context.beginPath(); context.moveTo(selectedX, pad.t); context.lineTo(selectedX, height - pad.b); context.stroke();
    const selectedY = y(ledger[selectedIndex].ending, selectedIndex, rates.indexOf(state.realReturn));
    context.beginPath(); context.arc(selectedX, selectedY, 7, 0, Math.PI * 2); context.fillStyle = palette.green; context.shadowColor = palette.green; context.shadowBlur = 15; context.fill(); context.shadowBlur = 0;
    context.textAlign = "center"; context.fillStyle = palette.text; context.font = "800 10px Arial, sans-serif";
    ledger.forEach((row, index) => { if (row.age % 5 === 0 || row.age === 95) context.fillText(String(row.age), x(index), height - 27); });
    context.textAlign = "left"; context.fillStyle = palette.muted; context.font = "800 9px Arial, sans-serif"; context.fillText("REAL INVESTMENT CAPITAL · RETURN SCENARIO SLICES", pad.l, 58);
    visualGeometry = { mode: "linear", plotLeft: pad.l, plotWidth: width - pad.l - pad.r, width, height };
  }

  function drawRibbon(context, values, x, centre, widthScale, color, label, palette) {
    const upper = values.map((value, index) => centre(index) - Math.max(3, value * widthScale) / 2);
    const lower = values.map((value, index) => centre(index) + Math.max(3, value * widthScale) / 2);
    context.beginPath();
    upper.forEach((value, index) => index ? context.lineTo(x(index), value) : context.moveTo(x(index), value));
    for (let index = lower.length - 1; index >= 0; index -= 1) context.lineTo(x(index), lower[index]);
    context.closePath();
    const gradient = context.createLinearGradient(x(0), 0, x(values.length - 1), 0);
    gradient.addColorStop(0, withAlpha(color, .45)); gradient.addColorStop(.5, withAlpha(color, .8)); gradient.addColorStop(1, withAlpha(color, .5));
    context.fillStyle = gradient; context.shadowColor = withAlpha(color, .35); context.shadowBlur = 12; context.fill(); context.shadowBlur = 0;
    context.strokeStyle = color; context.lineWidth = 1.5; context.stroke();
    context.fillStyle = palette.text; context.font = "800 9px Arial, sans-serif"; context.textAlign = "left"; context.fillText(label, x(0), centre(0) - Math.max(3, values[0] * widthScale) / 2 - 10);
  }

  function drawRiver(frame, ledger) {
    const { context, width, height } = frame;
    const palette = visualPalette(true);
    const pad = { l: width < 620 ? 42 : 70, r: 30, t: 92, b: 46 };
    const x = (index) => pad.l + index / Math.max(1, ledger.length - 1) * (width - pad.l - pad.r);
    const annualMax = Math.max(state.spend, currentRail().netPension, ...ledger.map((row) => row.draw), 1);
    const widthScale = Math.min(50, height * .09) / annualMax;
    context.fillStyle = palette.bg; context.fillRect(0, 0, width, height);
    context.strokeStyle = palette.grid; context.lineWidth = 1;
    ledger.forEach((row, index) => { if (row.age % 5 === 0 || row.age === 95) { context.beginPath(); context.moveTo(x(index), pad.t); context.lineTo(x(index), height - pad.b); context.stroke(); } });

    const pssValues = ledger.map((row) => row.age === 60 ? 0 : row.pension);
    const drawValues = ledger.map((row) => row.age === 60 ? Math.max(0, state.spend - currentRail().netPension) : row.draw);
    const surplusValues = ledger.map((row) => row.reinvestment);
    drawRibbon(context, pssValues, x, (index) => height * .28 + Math.sin(index * .35) * 8, widthScale, palette.green, "INDEXED PSS · ANNUAL FLOW", palette);
    drawRibbon(context, drawValues, x, (index) => height * .43 + Math.sin(index * .27 + .8) * 13, widthScale, palette.blue, "POOL A DRAW · ANNUAL FLOW", palette);
    drawRibbon(context, surplusValues, x, (index) => height * .56 + Math.sin(index * .31 + 1.4) * 8, widthScale, palette.violet, "REINVESTED SURPLUS · ANNUAL FLOW", palette);

    const capitalTop = height * .70;
    const capitalBottom = height - pad.b;
    const maximum = Math.max(...ledger.map((row) => row.ending), 1) * 1.06;
    const capitalY = (value) => capitalBottom - value / maximum * (capitalBottom - capitalTop);
    fillBetween(context, ledger.map((row) => row.ending), ledger.map(() => 0), x, capitalY, withAlpha(palette.blue, .22));
    fillBetween(context, ledger.map((row) => row.poolC), ledger.map(() => 0), x, capitalY, withAlpha(palette.violet, .32));
    traceLine(context, ledger.map((row) => row.ending), x, capitalY); context.strokeStyle = palette.blue; context.lineWidth = 3; context.stroke();
    traceLine(context, ledger.map((row) => row.poolC), x, capitalY); context.strokeStyle = palette.violet; context.lineWidth = 2; context.stroke();
    context.fillStyle = palette.muted; context.font = "800 8px Arial, sans-serif"; context.textAlign = "left"; context.fillText("CAPITAL STOCK · SEPARATE SCALE", pad.l, capitalTop - 12);
    if (state.compareRail) {
      const other = operationalLedger(RAILS[state.rail === "A" ? "B" : "A"], state.spend, state.realReturn);
      traceLine(context, other.map((row) => row.ending), x, capitalY); context.setLineDash([6, 5]); context.strokeStyle = palette.amber; context.lineWidth = 2; context.stroke(); context.setLineDash([]);
    }

    const selectedIndex = clamp(state.selectedCapitalAge - 60, 0, ledger.length - 1);
    const gateX = x(selectedIndex);
    const gate = context.createLinearGradient(gateX, 0, gateX, height);
    gate.addColorStop(0, withAlpha(palette.violet, .02)); gate.addColorStop(.5, withAlpha(palette.violet, .22)); gate.addColorStop(1, withAlpha(palette.violet, .04));
    context.fillStyle = gate; context.fillRect(gateX - 6, 70, 12, height - 105);
    context.strokeStyle = palette.violet; context.lineWidth = 2; context.beginPath(); context.moveTo(gateX, 72); context.lineTo(gateX, height - 34); context.stroke();
    context.beginPath(); context.arc(gateX, 72, 7, 0, Math.PI * 2); context.fillStyle = palette.panel; context.fill(); context.strokeStyle = palette.violet; context.lineWidth = 3; context.stroke();
    const selected = ledger[selectedIndex];
    const calloutWidth = 142;
    const calloutX = gateX > width - calloutWidth - 28 ? gateX - calloutWidth - 12 : gateX + 12;
    context.fillStyle = withAlpha(palette.panel, .93); context.fillRect(calloutX, 92, calloutWidth, 68); context.strokeStyle = withAlpha(palette.violet, .35); context.strokeRect(calloutX, 92, calloutWidth, 68);
    context.textAlign = "left"; context.fillStyle = palette.text; context.font = "900 9px Arial, sans-serif"; context.fillText(`AGE ${selected.age} FLOW GATE`, calloutX + 9, 108);
    context.fillStyle = palette.muted; context.font = "700 8px Arial, sans-serif"; context.fillText(`PSS ${money0.format(selected.age === 60 ? currentRail().netPension : selected.pension)} p.a.`, calloutX + 9, 125); context.fillText(`Draw ${money0.format(selected.age === 60 ? Math.max(0, state.spend - currentRail().netPension) : selected.draw)} p.a.`, calloutX + 9, 140); context.fillText(`Reinvest ${money0.format(selected.reinvestment)} p.a.`, calloutX + 9, 155);
    context.fillStyle = palette.text; context.font = "900 10px Arial, sans-serif"; context.textAlign = "center";
    ledger.forEach((row, index) => { if (row.age % 5 === 0 || row.age === 95 || row.age === state.selectedCapitalAge) context.fillText(String(row.age), x(index), height - 22); });
    visualGeometry = { mode: "linear", plotLeft: pad.l, plotWidth: width - pad.l - pad.r, width, height };
  }

  function drawEllipsePlatform(context, cx, cy, rx, ry, depth, color, label, value, palette) {
    for (let offset = depth; offset >= 1; offset -= 1) {
      context.beginPath(); context.ellipse(cx, cy + offset, rx, ry, 0, 0, Math.PI * 2); context.fillStyle = withAlpha(color, .16 + offset / Math.max(1, depth) * .16); context.fill();
    }
    const gradient = context.createRadialGradient(cx - rx * .28, cy - ry * .35, 4, cx, cy, rx);
    gradient.addColorStop(0, withAlpha("#ffffff", .22)); gradient.addColorStop(.22, withAlpha(color, .94)); gradient.addColorStop(1, withAlpha(color, .5));
    context.beginPath(); context.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); context.fillStyle = gradient; context.shadowColor = withAlpha(color, .45); context.shadowBlur = 15; context.fill(); context.shadowBlur = 0; context.strokeStyle = withAlpha("#ffffff", .34); context.lineWidth = 1; context.stroke();
    if (rx > 65) { context.fillStyle = palette.text; context.font = "900 9px Arial, sans-serif"; context.textAlign = "center"; context.fillText(label, cx, cy - 3); context.fillStyle = withAlpha(palette.text, .8); context.font = "700 9px Arial, sans-serif"; context.fillText(money0.format(value), cx, cy + 10); }
  }

  function drawOrbit(frame, ledger) {
    const { context, width, height } = frame;
    const palette = visualPalette(false);
    context.fillStyle = palette.bg; context.fillRect(0, 0, width, height);
    const cx = width * .53;
    const cy = height * .49;
    const orbitRx = Math.min(width * .39, 410);
    const orbitRy = Math.min(height * .35, 185);
    const start = Math.PI * 1.12;
    const span = Math.PI * 1.72;
    context.strokeStyle = withAlpha(palette.blue, .65); context.lineWidth = 2; context.shadowColor = palette.blue; context.shadowBlur = 8; context.beginPath(); context.ellipse(cx, cy, orbitRx, orbitRy, 0, start, start + span); context.stroke(); context.shadowBlur = 0;
    context.strokeStyle = withAlpha(palette.green, .23); context.lineWidth = 10; context.beginPath(); context.ellipse(cx, cy, orbitRx - 18, orbitRy - 8, 0, start, start + span); context.stroke();
    if (state.compareRail) { context.setLineDash([7, 6]); context.strokeStyle = palette.amber; context.lineWidth = 1.5; context.beginPath(); context.ellipse(cx, cy, orbitRx + 12, orbitRy + 6, 0, start, start + span); context.stroke(); context.setLineDash([]); }

    const selected = rowAt(ledger, state.selectedCapitalAge);
    const estate = Math.max(1, selected.ending + state.home);
    const maxRadius = Math.min(width * .24, 225);
    const radius = (value, floor) => Math.max(floor, Math.sqrt(Math.max(0, value) / estate) * maxRadius);
    drawEllipsePlatform(context, cx, cy + 83, radius(state.home, 105), Math.max(25, radius(state.home, 105) * .27), state.visualPerspective ? 18 : 2, palette.amber, "HOME · ESTATE BASE", state.home, palette);
    drawEllipsePlatform(context, cx, cy + 29, radius(selected.poolA, 120), Math.max(29, radius(selected.poolA, 120) * .27), state.visualPerspective ? 16 : 2, palette.blue, "POOL A · FLEXIBLE CAPITAL", selected.poolA, palette);
    drawEllipsePlatform(context, cx, cy - 25, radius(selected.poolC, 68), Math.max(22, radius(selected.poolC, 68) * .3), state.visualPerspective ? 14 : 2, palette.violet, "POOL C · INVESTED RESERVE", selected.poolC, palette);
    context.beginPath(); context.ellipse(cx, cy - 72, Math.min(82, maxRadius * .42), 25, 0, 0, Math.PI * 2); context.strokeStyle = palette.green; context.lineWidth = 5; context.shadowColor = palette.green; context.shadowBlur = 14; context.stroke(); context.shadowBlur = 0;
    context.fillStyle = palette.green; context.font = "900 9px Arial, sans-serif"; context.textAlign = "center"; context.fillText(`PSS FLOOR ${money0.format(currentRail().netPension)} P.A.`, cx, cy - 72);

    const zones = [];
    ledger.forEach((row) => {
      const progress = (row.age - 60) / 35;
      const angle = start + progress * span;
      const x = cx + Math.cos(angle) * orbitRx;
      const y = cy + Math.sin(angle) * orbitRy;
      zones.push({ age: row.age, x, y, r: row.age === state.selectedCapitalAge ? 13 : 7 });
      if (row.age % 5 === 0 || [60, 67, 70, state.targetAge, 85, 95].includes(row.age)) {
        context.beginPath(); context.arc(x, y, row.age === state.selectedCapitalAge ? 10 : 4, 0, Math.PI * 2); context.fillStyle = row.age === state.selectedCapitalAge ? palette.cyan : [67, 70, 85, 95].includes(row.age) ? palette.violet : palette.blue; context.shadowColor = context.fillStyle; context.shadowBlur = row.age === state.selectedCapitalAge ? 18 : 6; context.fill(); context.shadowBlur = 0;
        context.fillStyle = row.age === state.selectedCapitalAge ? palette.text : palette.muted; context.font = row.age === state.selectedCapitalAge ? "900 18px Arial, sans-serif" : "800 9px Arial, sans-serif"; context.textAlign = "center"; context.fillText(String(row.age), x, y - (row.age === state.selectedCapitalAge ? 20 : 13));
      }
    });
    const selectedZone = zones[state.selectedCapitalAge - 60];
    context.strokeStyle = palette.cyan; context.lineWidth = 2; context.beginPath(); context.moveTo(selectedZone.x, selectedZone.y); context.lineTo(cx, cy - 44); context.stroke();
    context.fillStyle = palette.muted; context.font = "800 8px Arial, sans-serif"; context.textAlign = "center"; context.fillText("AGE ORBIT · 60 TO 95", cx, height - 24);
    visualGeometry = { mode: "orbit", zones, width, height };
  }

  function drawWaterfall(frame, ledger) {
    const { context, width, height } = frame;
    const palette = visualPalette(false);
    context.fillStyle = palette.bg; context.fillRect(0, 0, width, height);
    const row = rowAt(ledger, state.selectedCapitalAge);
    const isOpening = row.age === 60;
    const opening = row.openingA + row.openingC;
    const earnA = isOpening ? 0 : row.openingA * state.realReturn;
    const earnC = isOpening ? 0 : row.openingC * state.realReturn;
    const items = isOpening ? [
      { label: "Opening capital", value: row.ending, total: true },
    ] : [
      { label: "Opening capital", value: opening, total: true },
      { label: "Pool A earnings", value: earnA },
      { label: "Pool C earnings", value: earnC },
      { label: "Portfolio draw", value: -row.draw },
      { label: "External drag", value: -row.externalTaxDrag },
      { label: "Reinvested surplus", value: row.reinvestment },
      { label: "Ending capital", value: row.ending, total: true },
    ];
    const pad = { l: 56, r: 28, t: 110, b: 82 };
    const plotHeight = height - pad.t - pad.b;
    const maximum = Math.max(opening + Math.max(0, earnA) + Math.max(0, earnC) + Math.max(0, row.reinvestment), row.ending, 1) * 1.08;
    const y = (value) => pad.t + (1 - value / maximum) * plotHeight;
    const gap = (width - pad.l - pad.r) / items.length;
    let running = 0;
    context.strokeStyle = palette.grid; context.lineWidth = 1;
    [0, .25, .5, .75, 1].forEach((tick) => { const yy = pad.t + tick * plotHeight; context.beginPath(); context.moveTo(pad.l, yy); context.lineTo(width - pad.r, yy); context.stroke(); context.fillStyle = palette.muted; context.font = "700 9px Arial, sans-serif"; context.textAlign = "right"; context.fillText(compact(maximum * (1 - tick)), pad.l - 8, yy); });
    items.forEach((item, index) => {
      const x = pad.l + index * gap + gap * .16;
      const barWidth = gap * .68;
      const startValue = item.total ? 0 : running;
      const endValue = item.total ? item.value : running + item.value;
      const top = y(Math.max(startValue, endValue));
      const bottom = y(Math.min(startValue, endValue));
      const color = item.total ? palette.blue : item.value >= 0 ? palette.green : item.label === "Portfolio draw" ? palette.amber : palette.danger;
      const gradient = context.createLinearGradient(0, top, 0, bottom);
      gradient.addColorStop(0, withAlpha(color, .95)); gradient.addColorStop(1, withAlpha(color, .45));
      context.fillStyle = gradient; context.fillRect(x, top, barWidth, Math.max(4, bottom - top)); context.strokeStyle = withAlpha("#ffffff", .22); context.strokeRect(x, top, barWidth, Math.max(4, bottom - top));
      context.fillStyle = palette.text; context.font = "800 9px Arial, sans-serif"; context.textAlign = "center"; context.fillText(item.total ? money0.format(item.value) : `${item.value >= 0 ? "+" : "−"}${money0.format(Math.abs(item.value))}`, x + barWidth / 2, Math.max(94, top - 10));
      const words = item.label.split(" "); context.fillStyle = palette.muted; context.font = "700 8px Arial, sans-serif"; words.forEach((word, wordIndex) => context.fillText(word, x + barWidth / 2, height - 48 + wordIndex * 10));
      if (!item.total) running = endValue; else if (index === 0) running = item.value;
      if (index < items.length - 1 && !items[index + 1].total) { context.setLineDash([4, 4]); context.strokeStyle = palette.grid; context.beginPath(); context.moveTo(x + barWidth, y(running)); context.lineTo(x + gap, y(running)); context.stroke(); context.setLineDash([]); }
    });
    context.fillStyle = palette.muted; context.font = "800 9px Arial, sans-serif"; context.textAlign = "left"; context.fillText(`${isOpening ? "RETIREMENT-DAY OPENING" : `AGE ${row.age - 1}→${row.age}`} · ${pct(state.realReturn)} REAL RETURN USED`, pad.l, 76);
    visualGeometry = { mode: "static", width, height };
  }

  function drawSunburst(frame, ledger) {
    const { context, width, height } = frame;
    const palette = visualPalette(false);
    context.fillStyle = palette.bg; context.fillRect(0, 0, width, height);
    const row = rowAt(ledger, state.selectedCapitalAge);
    const parts = [
      { label: "Pool A", value: row.poolA, color: palette.blue },
      { label: "Pool C", value: row.poolC, color: palette.violet },
      { label: "Home", value: state.home, color: palette.amber },
    ];
    const total = Math.max(1, parts.reduce((sum, part) => sum + part.value, 0));
    const cx = width * .46;
    const cy = height * .52;
    const outer = Math.min(width, height) * .30;
    const inner = outer * .48;
    let angle = -Math.PI / 2;
    for (let depth = state.visualPerspective ? 18 : 2; depth >= 1; depth -= 1) {
      let sideAngle = -Math.PI / 2;
      parts.forEach((part) => { const sweep = part.value / total * Math.PI * 2; context.beginPath(); context.arc(cx, cy + depth, outer, sideAngle, sideAngle + sweep); context.arc(cx, cy + depth, inner, sideAngle + sweep, sideAngle, true); context.closePath(); context.fillStyle = withAlpha(part.color, .14 + depth / 18 * .13); context.fill(); sideAngle += sweep; });
    }
    parts.forEach((part) => {
      const sweep = part.value / total * Math.PI * 2;
      const gradient = context.createRadialGradient(cx, cy, inner, cx, cy, outer);
      gradient.addColorStop(0, withAlpha(part.color, .46)); gradient.addColorStop(1, part.color);
      context.beginPath(); context.arc(cx, cy, outer, angle, angle + sweep); context.arc(cx, cy, inner, angle + sweep, angle, true); context.closePath(); context.fillStyle = gradient; context.shadowColor = withAlpha(part.color, .35); context.shadowBlur = 13; context.fill(); context.shadowBlur = 0; context.strokeStyle = withAlpha("#ffffff", .3); context.lineWidth = 2; context.stroke();
      const mid = angle + sweep / 2;
      const labelRadius = (outer + inner) / 2;
      const lx = cx + Math.cos(mid) * labelRadius;
      const ly = cy + Math.sin(mid) * labelRadius;
      if (part.value / total > .08) { context.fillStyle = palette.text; context.font = "900 10px Arial, sans-serif"; context.textAlign = "center"; context.fillText(part.label, lx, ly - 5); context.font = "700 9px Arial, sans-serif"; context.fillText(pct(part.value / total), lx, ly + 8); }
      angle += sweep;
    });
    context.fillStyle = palette.text; context.textAlign = "center"; context.font = "900 14px Arial, sans-serif"; context.fillText(`AGE ${row.age} ESTATE`, cx, cy - 8); context.font = "900 21px Arial, sans-serif"; context.fillText(money0.format(total), cx, cy + 15); context.fillStyle = palette.muted; context.font = "700 9px Arial, sans-serif"; context.fillText("REAL · BEFORE COSTS AND RESIDUAL DBT", cx, cy + 34);
    const coverage = clamp(currentRail().netPension / Math.max(1, state.spend), 0, 1);
    context.beginPath(); context.arc(cx, cy, outer + 28, -.5 * Math.PI, -.5 * Math.PI + coverage * Math.PI * 2); context.strokeStyle = palette.green; context.lineWidth = 7; context.lineCap = "round"; context.stroke(); context.lineCap = "butt";
    context.fillStyle = palette.green; context.font = "900 10px Arial, sans-serif"; context.fillText(`PSS COVERS ${pct(coverage)} OF PLANNED SPENDING`, cx, cy - outer - 49);
    const legendX = Math.min(width - 185, cx + outer + 58);
    parts.forEach((part, index) => { const yy = cy - 44 + index * 56; context.fillStyle = part.color; context.beginPath(); context.arc(legendX, yy, 6, 0, Math.PI * 2); context.fill(); context.fillStyle = palette.text; context.textAlign = "left"; context.font = "900 10px Arial, sans-serif"; context.fillText(part.label, legendX + 14, yy - 5); context.fillStyle = palette.muted; context.font = "700 9px Arial, sans-serif"; context.fillText(`${money0.format(part.value)} · ${pct(part.value / total)}`, legendX + 14, yy + 10); });
    visualGeometry = { mode: "static", width, height };
  }

  function renderVisualTable(ledger) {
    $("visualTableBody").innerHTML = ledger.map((row) => `<tr tabindex="0" data-visual-row-age="${row.age}" class="${row.age === state.selectedCapitalAge ? "active" : ""}"><td>${row.age === 60 ? "60 · opening" : `${row.age - 1}→${row.age}`}</td><td>${money0.format(row.openingA)}</td><td>${money0.format(row.openingC)}</td><td>${money0.format(row.pension)}</td><td>${money0.format(row.mandatory)}</td><td>${money0.format(row.draw)}</td><td>${money0.format(row.reinvestment)}</td><td>${money0.format(row.externalTaxDrag)}</td><td>${money0.format(row.poolA)}</td><td>${money0.format(row.poolC)}</td><td>${money0.format(row.ending)}</td><td>${money0.format(row.ending + state.home)}</td></tr>`).join("");
    $("visualTableBody").querySelectorAll("tr").forEach((row) => {
      const select = () => selectCapitalAge(ledger, Number(row.dataset.visualRowAge));
      row.addEventListener("click", select);
      row.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(); } });
    });
  }

  function renderVisualInspector(ledger) {
    const rail = currentRail();
    const row = rowAt(ledger, state.selectedCapitalAge);
    const isOpening = row.age === 60;
    const estate = row.ending + state.home;
    const total = Math.max(1, estate);
    $("visualAgeRange").value = String(row.age);
    $("visualAgeOut").textContent = String(row.age);
    $("visualStageAge").textContent = `AGE ${row.age}`;
    $("visualInspectorAge").textContent = `Age ${row.age}`;
    $("visualInspectorYear").textContent = isOpening ? "Retirement-day opening snapshot" : `End of planning year ${row.age - 60} · age ${row.age - 1}→${row.age}`;
    $("visualInspectorCapital").textContent = money0.format(row.ending);
    $("visualInspectorCapitalChange").textContent = `${pct(state.realReturn)} real return used · after inflation`;
    $("visualInspectorEstate").textContent = money0.format(estate);
    $("visualInspectorPoolA").textContent = money0.format(row.poolA);
    $("visualInspectorPoolC").textContent = money0.format(row.poolC);
    $("visualInspectorPension").textContent = `${money0.format(rail.netPension)} p.a.`;
    $("visualInspectorDraw").textContent = `${money0.format(isOpening ? Math.max(0, state.spend - rail.netPension) : row.draw)} p.a.`;
    $("visualInspectorReinvestment").textContent = `${money0.format(row.reinvestment)} p.a.`;
    $("visualInspectorDrag").textContent = `${money0.format(row.externalTaxDrag)} p.a.`;
    $("visualInspectorGross").textContent = isOpening ? "Begins in year 1" : `${money0.format(row.grossEquivalent)} p.a.`;
    $("visualInspectorCoverage").textContent = pct(rail.netPension / Math.max(1, state.spend));
    $("visualShareA").textContent = pct(row.poolA / total);
    $("visualShareC").textContent = pct(row.poolC / total);
    $("visualShareHome").textContent = pct(state.home / total);
    $("visualCanvas").setAttribute("aria-valuenow", String(row.age));
    $("visualCanvas").setAttribute("aria-valuetext", `Age ${row.age}: ${money0.format(row.ending)} investments and ${money0.format(estate)} gross estate using ${pct(state.realReturn)} real return`);
    $("visualMilestones").querySelectorAll("button").forEach((button) => { const active = Number(button.dataset.visualAge) === row.age; button.classList.toggle("active", active); button.setAttribute("aria-pressed", String(active)); });
    $("visualV23Link").href = `./deep-model.html?${scenarioQuery()}`;
  }

  function renderVisualStudio(ledger) {
    activeVisualLedger = ledger;
    const copy = VISUAL_MODE_COPY[state.visualMode];
    $("visualWorkspace").dataset.mode = state.visualMode;
    $("visualStageMode").textContent = copy.label;
    $("visualStageHint").textContent = copy.hint;
    $("visualSummary").textContent = copy.summary;
    $("visualDisclosure").textContent = copy.disclosure;
    $("visualRail").textContent = state.rail;
    $("visualSpend").textContent = `${money0.format(state.spend)} p.a.`;
    $("visualReturn").textContent = `${pct(state.realReturn)} p.a.`;
    $("visualTarget").textContent = String(state.targetAge);
    $("visualDimensionToggle").classList.toggle("active", state.visualPerspective);
    $("visualDimensionToggle").setAttribute("aria-pressed", String(state.visualPerspective));
    $("visualDimensionToggle").textContent = state.visualPerspective ? "Perspective" : "Flat";
    $("visualCompareRail").classList.toggle("active", state.compareRail);
    $("visualCompareRail").setAttribute("aria-pressed", String(state.compareRail));
    $("visualCompareRail").textContent = state.compareRail ? `Rail ${state.rail === "A" ? "B" : "A"} visible` : `Compare Rail ${state.rail === "A" ? "B" : "A"}`;
    $("visualModeTabs").querySelectorAll("button").forEach((button) => { const active = button.dataset.visualMode === state.visualMode; button.classList.toggle("active", active); button.setAttribute("aria-selected", String(active)); });
    const tableMode = state.visualMode === "table";
    $("visualWorkspace").hidden = tableMode;
    $("visualTableWrap").hidden = !tableMode;
    renderVisualInspector(ledger);
    renderVisualTable(ledger);
    if (tableMode) return;
    const frame = canvasFrame();
    if (!frame) return;
    if (state.visualMode === "horizon") drawHorizon(frame, ledger);
    else if (state.visualMode === "river") drawRiver(frame, ledger);
    else if (state.visualMode === "orbit") drawOrbit(frame, ledger);
    else if (state.visualMode === "waterfall") drawWaterfall(frame, ledger);
    else drawSunburst(frame, ledger);
  }

  function selectCapitalAge(ledger, age) {
    state.selectedCapitalAge = clamp(Number(age), 60, 95);
    renderCapitalReadout(rowAt(ledger, state.selectedCapitalAge));
    renderVisualStudio(ledger);
  }

  function visualAgeFromPoint(event) {
    if (!visualGeometry || !activeVisualLedger.length) return state.selectedCapitalAge;
    const rect = $("visualCanvas").getBoundingClientRect();
    const pointX = (event.clientX - rect.left) / Math.max(1, rect.width) * visualGeometry.width;
    const pointY = (event.clientY - rect.top) / Math.max(1, rect.height) * visualGeometry.height;
    if (visualGeometry.mode === "linear") return clamp(Math.round(60 + (pointX - visualGeometry.plotLeft) / Math.max(1, visualGeometry.plotWidth) * 35), 60, 95);
    if (visualGeometry.mode === "orbit") return visualGeometry.zones.reduce((nearest, zone) => Math.hypot(zone.x - pointX, zone.y - pointY) < Math.hypot(nearest.x - pointX, nearest.y - pointY) ? zone : nearest, visualGeometry.zones[0]).age;
    return state.selectedCapitalAge;
  }

  function renderVisualHover(event) {
    if (!visualGeometry || visualGeometry.mode === "static") { $("visualHover").hidden = true; return; }
    const age = visualAgeFromPoint(event);
    const row = rowAt(activeVisualLedger, age);
    const rect = $("visualCanvas").getBoundingClientRect();
    const hover = $("visualHover");
    hover.innerHTML = `<b>Age ${age}</b><span>${money0.format(row.ending)} investments</span><span>${money0.format(row.ending + state.home)} estate</span><span>${pct(state.realReturn)} real return used</span>`;
    hover.style.left = `${clamp(event.clientX - rect.left + 14, 10, Math.max(10, rect.width - 220))}px`;
    hover.style.top = `${clamp(event.clientY - rect.top + 14, 64, Math.max(64, rect.height - 100))}px`;
    hover.hidden = false;
  }

  function stopVisualPlay() {
    clearInterval(visualPlayTimer);
    visualPlayTimer = null;
    $("visualPlay").setAttribute("aria-pressed", "false");
    $("visualPlay").textContent = "Play retirement";
    $("visualPlayMobile").textContent = "Play";
  }

  function toggleVisualPlay() {
    if (visualPlayTimer) { stopVisualPlay(); return; }
    if (state.selectedCapitalAge >= 95) selectCapitalAge(activeVisualLedger, 60);
    $("visualPlay").setAttribute("aria-pressed", "true");
    $("visualPlay").textContent = "Pause";
    $("visualPlayMobile").textContent = "Pause";
    visualPlayTimer = setInterval(() => {
      if (state.selectedCapitalAge >= 95) { stopVisualPlay(); return; }
      selectCapitalAge(activeVisualLedger, state.selectedCapitalAge + 1);
    }, matchMedia("(prefers-reduced-motion: reduce)").matches ? 900 : 420);
  }

  function renderCapitalChart(rail, activeLedger) {
    const colors = chartTheme();
    const returns = [...new Set([0.04, state.realReturn, 0.065].map((value) => Number(value.toFixed(4))))].sort((a, b) => a - b);
    const colorPool = [colors.amber, colors.green, colors.blue];
    const ledgers = returns.map((realReturn) => operationalLedger(rail, state.spend, realReturn));
    if (charts.capital) charts.capital.destroy();
    charts.capital = new Chart($("capitalChart"), {
      type: "line",
      data: {
        labels: ledgers[0].map((row) => row.age),
        datasets: ledgers.map((ledger, index) => ({
          label: `${pct(returns[index])} real${returns[index] === state.realReturn ? " · active" : ""}`,
          data: ledger.map((row) => row.ending),
          borderColor: returns[index] === state.realReturn ? colors.green : colorPool[index],
          backgroundColor: returns[index] === state.realReturn ? colors.green : colorPool[index],
          borderWidth: returns[index] === state.realReturn ? 4 : 2,
          pointRadius: 0,
          tension: .16,
        })),
      },
      options: baseChartOptions((event, elements, chart) => {
        const index = chartIndex(chart, event, elements);
        selectCapitalAge(activeLedger, Number(chart.data.labels[index]));
      }),
    });
  }

  function renderCapitalReadout(row) {
    $("capitalAgeSelect").value = String(row.age);
    $("capitalAge").textContent = row.age;
    $("capitalPoolA").textContent = money0.format(row.poolA);
    $("capitalPoolC").textContent = money0.format(row.poolC);
    $("capitalTotal").textContent = money0.format(row.ending);
    $("capitalEstate").textContent = money0.format(row.ending + state.home);
  }

  function frontierPoints(rail) {
    const spends = [...new Set([state.spend, ...Array.from({ length: 13 }, (_, index) => 80_000 + index * 5_000)])].sort((a, b) => a - b);
    return spends.map((spend) => {
      const capital = endingAt(rail, spend, state.realReturn, state.targetAge);
      return { spend, draw: Math.max(0, spend - rail.netPension), capital, estate: capital + state.home };
    });
  }

  function renderFrontierChart(points) {
    const colors = chartTheme();
    if (charts.frontier) charts.frontier.destroy();
    charts.frontier = new Chart($("frontierChart"), {
      type: "line",
      data: {
        labels: points.map((point) => `$${point.spend / 1000}k`),
        datasets: [{
          label: `Gross estate at age ${state.targetAge}`,
          data: points.map((point) => point.estate),
          borderColor: colors.green,
          backgroundColor: points.map((point) => point.spend === state.spend ? colors.blue : colors.green),
          pointBorderColor: points.map((point) => point.spend === state.spend ? colors.blue : colors.green),
          pointRadius: points.map((point) => point.spend === state.spend ? 8 : 5),
          pointHoverRadius: 9,
          borderWidth: 3,
          tension: .16,
        }],
      },
      options: baseChartOptions((event, elements, chart) => {
        const index = chartIndex(chart, event, elements);
        state.spend = points[index].spend;
        $("spend").value = state.spend;
        renderAll();
      }),
    });
  }

  function renderMetrics(rail, targetRow) {
    $("metricPension").textContent = money0.format(rail.netPension);
    $("metricPensionPf").textContent = `[MODELLED] ${money2.format(rail.netPension / 26)} per fortnight · for life`;
    $("metricCapital60").textContent = money0.format(rail.capital);
    $("metricCapitalSource").textContent = `[MODELLED] ${money0.format(rail.lumpSum)} PSS lump + ${money0.format(rail.hostplus)} Hostplus`;
    $("metricCapitalLabel").textContent = `Investments at ${state.targetAge}`;
    $("metricCapital").textContent = money0.format(targetRow.ending);
    $("metricCapitalSub").textContent = `[MODELLED] ${pct(state.realReturn)} real · reconciled birthday-year planning ledger`;
    $("metricEstateLabel").textContent = `Gross estate at ${state.targetAge}`;
    $("metricEstate").textContent = money0.format(targetRow.ending + state.home);
    $("metricEstateSub").textContent = `[MODELLED] Includes ${money0.format(state.home)} assumed home · before costs and residual DBT`;
  }

  function renderArchitecture(rail) {
    $("flowLump").textContent = money0.format(rail.lumpSum);
    $("flowHostplus").textContent = money0.format(rail.hostplus);
    $("flowCapital").textContent = money0.format(rail.capital);
    $("poolAValue").textContent = money0.format(rail.poolA);
    $("poolCValue").textContent = money0.format(rail.poolC);
    $("poolABar").style.width = `${rail.poolA / rail.capital * 100}%`;
    $("poolCBar").style.width = `${rail.poolC / rail.capital * 100}%`;
    $("dbSpecial").textContent = money0.format(rail.dbSpecialValue);
    $("tbcPoolA").textContent = money0.format(rail.poolA);
    $("tbcDbBar").style.width = `${rail.dbSpecialValue / TBC * 100}%`;
    $("tbcAbpBar").style.width = `${rail.poolA / TBC * 100}%`;
    $("tbcBufferBar").style.width = `${TSB_BUFFER / TBC * 100}%`;
    $("tbcTotal").textContent = `${money0.format(rail.dbSpecialValue + rail.poolA)} total super-balance structure`;
  }

  function renderTradeTable(rail, points) {
    $("tradeCapitalHead").textContent = `Investments @${state.targetAge}`;
    $("tradeEstateHead").textContent = `Estate @${state.targetAge}`;
    $("tradeRows").innerHTML = points.filter((point) => point.spend >= 90_000 && point.spend <= 130_000 && point.spend % 10_000 === 0).map((point) => `
      <tr data-spend="${point.spend}" class="${point.spend === state.spend ? "active" : ""}" tabindex="0" aria-label="Use ${money0.format(point.spend)} spending">
        <td>${money0.format(point.spend)}</td><td>${money0.format(point.draw)}</td><td>${money0.format(point.capital)}</td><td>${money0.format(point.estate)}</td>
      </tr>`).join("");
    $("tradeRows").querySelectorAll("tr").forEach((row) => {
      const select = () => { state.spend = Number(row.dataset.spend); $("spend").value = state.spend; renderAll(); };
      row.addEventListener("click", select);
      row.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(); } });
    });

    const lowerSpend = Math.max(80_000, state.spend - 10_000);
    const current = endingAt(rail, state.spend, state.realReturn, state.targetAge);
    const lower = endingAt(rail, lowerSpend, state.realReturn, state.targetAge);
    const preservation = Math.max(0, lower - current);
    const years = Math.max(0, state.targetAge - 60);
    $("spendDelta").textContent = `${money0.format(preservation)} more investments at age ${state.targetAge}`;
    const yearText = years === 1 ? "1 full retirement year" : `${years} full retirement years`;
    $("spendDeltaDetail").textContent = years === 0
      ? "Launch snapshot only: no full retirement-year spending has occurred."
      : `Benefit: higher estate and investment capital. Cost: ${money0.format((state.spend - lowerSpend) * years)} less real consumption across ${yearText}.`;
  }

  function renderObjectives(rail, ledger) {
    const at75 = rowAt(ledger, 75);
    const at85 = rowAt(ledger, 85);
    const target = rowAt(ledger, state.targetAge);
    const coverage = rail.netPension / state.spend;
    const targetEstate = target.ending + state.home;
    const estateMargin = targetEstate - GROSS_ESTATE_FLOOR;
    const capitalRatio = target.ending / rail.capital;
    const capitalChange = capitalRatio - 1;
    const drag = ledger.filter((row) => row.age <= state.targetAge).reduce((sum, row) => sum + row.externalTaxDrag, 0);
    const objectives = [
      ["1 · Retirement income", money0.format(rail.netPension), coverage >= .7 ? "Strong floor" : "Protected floor", `${pct(coverage)} of selected spending is covered by indexed PSS.`],
      ["2 · Spending power", money0.format(state.spend), state.spend <= 110_000 ? "Balanced" : state.spend <= 120_000 ? "Lifestyle-led" : "High utility", `${money2.format(state.spend / 26)} per fortnight; gross salary equivalent ${money0.format(grossForNet(state.spend))}.`],
      ["3 · Capital preservation", `${capitalChange >= 0 ? "+" : ""}${pct(capitalChange)}`, capitalRatio >= 1 ? "Real growth" : capitalRatio >= .65 ? "Preserved" : "Drawdown", `${pct(capitalRatio)} of starting capital retained: ${money0.format(target.ending)} from ${money0.format(rail.capital)} at age ${state.targetAge} [MODELLED].`],
      ["4 · Age-75 wealth", money0.format(at75.ending), at75.ending >= 1_200_000 ? "Benchmark strong" : at75.ending >= 750_000 ? "Substantial" : "Lifestyle cost", `Investment-only capital; the home and pension replacement value are excluded.`],
      ["5 · Age-85 wealth", money0.format(at85.ending), at85.ending >= 750_000 ? "Substantial" : at85.ending >= 300_000 ? "Moderate" : "Guardrail", `Uses the same constant real spending and return assumptions through age 85.`],
      ["6 · Estate outcome", money0.format(targetEstate), estateMargin >= 500_000 ? "Strong margin" : estateMargin >= 0 ? "Floor retained" : "Below floor", `${estateMargin >= 0 ? money0.format(estateMargin) + " above" : money0.format(Math.abs(estateMargin)) + " below"} the $1.0m property-inclusive floor.`],
      ["7 · Tax efficiency", money0.format(drag), "Modelled wash", `Cumulative Pool C distribution drag [MODELLED] through age ${state.targetAge}; Rail ${rail.key} also uses the master-locked ${pct(rail.washTaxableShare, 2)} separate-interest wash convention. Provider execution remains to be confirmed.`],
      ["8 · Optionality", money0.format(target.ending), target.ending >= 750_000 ? "Flexible capital" : target.ending >= 300_000 ? "Meaningful" : "Narrowing", `Investment capital remains separate from the mortgage-free home and lifelong PSS floor. Pool C is invested, not cash; the active reserve target is ${state.liquidityMonths} months of the starting gap.`],
    ];
    $("objectiveGrid").innerHTML = objectives.map(([label, value, verdict, detail]) => `<article class="objective-card"><div><span>${label}</span><em>${verdict}</em></div><strong>${value}</strong><small>${detail}</small></article>`).join("");

    const orientation = state.spend <= 95_000 ? "estate-first" : state.spend <= 110_000 ? "balanced lifestyle and estate" : state.spend <= 125_000 ? "lifestyle-led" : "high-spending optionality";
    const lower = endingAt(rail, Math.max(80_000, state.spend - 10_000), state.realReturn, state.targetAge);
    $("priorityReading").textContent = `Rail ${state.rail} at ${money0.format(state.spend)} is ${orientation}.`;
    $("priorityTradeoff").textContent = `It preserves the indexed PSS floor and ${money0.format(target.ending)} of modelled investment capital, while costing ${money0.format(Math.max(0, lower - target.ending))} at age ${state.targetAge} versus spending $10,000 less.`;
  }

  function renderTax(rail, ledger) {
    const cumulativeDrag = ledger.filter((row) => row.age <= state.targetAge).reduce((sum, row) => sum + row.externalTaxDrag, 0);
    $("poolCDragTotal").textContent = `${money0.format(cumulativeDrag)} cumulative modelled drag through age ${state.targetAge}; actual tax depends on distributions, gains and implementation.`;
    $("washCyclesOut").textContent = state.washCycles;
    $("washCycles").value = state.washCycles;
    $("washTrack").style.width = `${state.washCycles / 7 * 100}%`;
    const taxableStart = rail.poolA * rail.washTaxableShare;
    const modelledDbtStart = taxableStart * .17;
    const taxableRemoved = Math.min(taxableStart, state.washCycles * WASH_AMOUNT * rail.washTaxableShare);
    const remainingDbt = (taxableStart - taxableRemoved) * .17;
    $("washStatus").textContent = `Rail ${rail.key} uses the master-locked separate-interest convention: up to seven $130,000 cycles from age 61, with six currently required to reach the $10,000 DBT target.`;
    $("washBadge").className = "badge modelled";
    $("washBadge").textContent = `Modelled Rail ${rail.key} convention`;
    $("washSavedLabel").textContent = "Modelled DBT remaining";
    $("washSaved").textContent = money2.format(remainingDbt);
    $("washSavedSub").textContent = `${money2.format(modelledDbtStart - remainingDbt)} modelled reduction after ${state.washCycles} cycle${state.washCycles === 1 ? "" : "s"}`;
    $("taxEvidence").innerHTML = `
      <div class="evidence-row"><div><b>Master-locked Pool A taxable-share convention</b><span class="badge modelled">MODELLED</span></div><p>${pct(rail.washTaxableShare, 2)} taxable-taxed, 29.03% tax-free and 0% untaxed; ${money0.format(taxableStart)} starting taxable component. ${rail.washEvidence}</p></div>
      ${rail.key === "B" ? `<div class="evidence-row"><div><b>July PSS lump components</b><span class="badge exact">EXACT</span></div><p>${money2.format(rail.lumpTaxFree)} tax-free and ${money2.format(rail.lumpTaxableTaxed)} taxable-taxed; taxable-untaxed is $0.</p></div>` : ""}
      <div class="evidence-row"><div><b>Illustrative DBT before washes</b><span class="badge modelled">MODELLED</span></div><p>${money2.format(modelledDbtStart)} at the 17% taxed-element planning rate for adult non-dependants.</p></div>
      <div class="evidence-row"><div><b>Provider execution check</b><span class="badge speculative">UNKNOWN</span></div><p>Confirm Hostplus can preserve the re-contributed NCC money as a separate pension interest; refresh actual components before every cycle.</p></div>`;
  }

  function renderGuardrails(rail, inspectionRow) {
    const coverage = rail.netPension / state.spend;
    const estate = inspectionRow.ending + state.home;
    const margin = estate - GROSS_ESTATE_FLOOR;
    $("guardrailIncome").textContent = `PSS covers ${pct(coverage)} of selected spending`;
    $("guardrailCapital").textContent = `${money0.format(inspectionRow.ending)} at inspected age ${state.inspectionAge} [MODELLED]`;
    $("guardrailEstate").textContent = margin >= 0 ? `${money0.format(margin)} above $1.0m gross floor at age ${state.inspectionAge}` : `${money0.format(Math.abs(margin))} below $1.0m gross floor at age ${state.inspectionAge}`;
  }

  function renderFrontierText(rail, points, targetRow) {
    const coverage = rail.netPension / state.spend;
    const estate = targetRow.ending + state.home;
    let verdict = "Balanced lifestyle and estate";
    if (state.spend <= 95_000) verdict = "Estate-maximisation profile";
    else if (state.spend <= 105_000) verdict = "Strong wealth / lifestyle compromise";
    else if (state.spend <= 115_000) verdict = "Balanced lifestyle and estate";
    else if (state.spend <= 125_000) verdict = "Lifestyle-led balance";
    else verdict = "High-spending optionality";
    $("frontierTitle").textContent = `Estate frontier at age ${state.targetAge}`;
    $("frontierSub").textContent = `${pct(state.realReturn)} real return · includes ${money0.format(state.home)} home`;
    $("frontierVerdict").textContent = verdict;
    $("frontierMargin").textContent = `PSS covers ${pct(coverage)} of spending; modelled estate is ${estate >= GROSS_ESTATE_FLOOR ? money0.format(estate - GROSS_ESTATE_FLOOR) + " above" : money0.format(GROSS_ESTATE_FLOOR - estate) + " below"} the $1.0m gross floor.`;
    renderTradeTable(rail, points);
  }

  function renderControls(rail) {
    $("railTitle").textContent = rail.title;
    $("railSourceBadge").textContent = state.rail === "B" ? "July iEstimator" : "March/V5 control";
    $("railSourceBadge").className = `badge ${state.rail === "B" ? "exact" : "modelled"}`;
    $("railPurpose").textContent = rail.purpose;
    $("railA").classList.toggle("active", state.rail === "A");
    $("railB").classList.toggle("active", state.rail === "B");
    $("railA").setAttribute("aria-selected", state.rail === "A");
    $("railB").setAttribute("aria-selected", state.rail === "B");
    $("spend").value = state.spend;
    $("return").value = state.realReturn * 100;
    $("targetAge").value = state.targetAge;
    $("home").value = state.home;
    $("spendOut").textContent = money0.format(state.spend);
    $("returnOut").textContent = pct(state.realReturn);
    $("ageOut").textContent = state.targetAge;
    $("homeOut").textContent = money0.format(state.home);
    $("cashflowContext").textContent = `Rail ${state.rail} · ${money0.format(state.spend)} spending · ${pct(state.realReturn)} real · ${state.taxYear} salary equivalent`;
    const startingGap = Math.max(0, state.spend - rail.netPension);
    const reserveTarget = startingGap * state.liquidityMonths / 12;
    const reserveGap = Math.max(0, reserveTarget - rail.poolC);
    $("basisReturn").textContent = `${pct(state.realReturn)} real p.a.`;
    $("basisReserve").textContent = `${state.liquidityMonths} months = ${money0.format(reserveTarget)}`;
    $("basisReserveDetail").textContent = `Pool C currently ${money0.format(rail.poolC)} and is invested, not cash.${reserveGap > 0 ? ` Policy gap ${money0.format(reserveGap)}.` : ""}`;
  }

  function renderAll() {
    const rail = currentRail();
    const ledger = operationalLedger(rail, state.spend, state.realReturn);
    const targetRow = rowAt(ledger, state.targetAge);
    const inspectionRow = rowAt(ledger, state.inspectionAge);
    state.selectedIncomeAge = clamp(state.selectedIncomeAge, 61, 95);
    state.selectedCapitalAge = clamp(state.selectedCapitalAge, 60, 95);
    const points = frontierPoints(rail);

    renderControls(rail);
    renderMetrics(rail, targetRow);
    renderArchitecture(rail);
    renderIncomeChart(ledger);
    renderSelectedCashflow(rowAt(ledger, state.selectedIncomeAge));
    renderCapitalChart(rail, ledger);
    renderCapitalReadout(rowAt(ledger, state.selectedCapitalAge));
    renderVisualStudio(ledger);
    renderFrontierChart(points);
    renderFrontierText(rail, points, targetRow);
    renderObjectives(rail, ledger);
    renderTax(rail, ledger);
    renderGuardrails(rail, inspectionRow);
    document.querySelectorAll("#timeline button").forEach((button) => {
      const active = Number(button.dataset.age) === state.inspectionAge;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    persistScenario();
  }

  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]').content = theme === "dark" ? "#03080f" : "#eef3fb";
    $("themeToggle").textContent = theme === "dark" ? "Light" : "Dark";
    $("themeToggle").setAttribute("aria-label", `Switch to ${theme === "dark" ? "light" : "dark"} theme`);
    try { localStorage.setItem("robinson-atlas-theme", theme); } catch { /* preference only */ }
    renderAll();
  }

  $("railA").addEventListener("click", () => { state.rail = "A"; state.washCycles = 6; renderAll(); });
  $("railB").addEventListener("click", () => { state.rail = "B"; state.washCycles = 6; renderAll(); });
  $("spend").addEventListener("input", (event) => { state.spend = Number(event.target.value); renderAll(); });
  $("return").addEventListener("input", (event) => { state.realReturn = Number(event.target.value) / 100; renderAll(); });
  $("targetAge").addEventListener("input", (event) => { state.targetAge = Number(event.target.value); state.selectedCapitalAge = state.targetAge; state.inspectionAge = state.targetAge; renderAll(); });
  $("home").addEventListener("input", (event) => { state.home = Number(event.target.value); renderAll(); });
  $("incomeAgeSelect").addEventListener("change", (event) => {
    state.selectedIncomeAge = Number(event.target.value);
    renderSelectedCashflow(rowAt(operationalLedger(currentRail(), state.spend, state.realReturn), state.selectedIncomeAge));
  });
  $("capitalAgeSelect").addEventListener("change", (event) => {
    selectCapitalAge(operationalLedger(currentRail(), state.spend, state.realReturn), Number(event.target.value));
  });
  $("visualAgeRange").addEventListener("input", (event) => selectCapitalAge(activeVisualLedger, Number(event.target.value)));
  $("visualMilestones").querySelectorAll("button").forEach((button) => button.addEventListener("click", () => selectCapitalAge(activeVisualLedger, Number(button.dataset.visualAge))));
  $("visualModeTabs").querySelectorAll("button").forEach((button) => button.addEventListener("click", () => {
    state.visualMode = button.dataset.visualMode;
    stopVisualPlay();
    renderAll();
  }));
  $("visualDimensionToggle").addEventListener("click", () => { state.visualPerspective = !state.visualPerspective; renderVisualStudio(activeVisualLedger); });
  $("visualCompareRail").addEventListener("click", () => { state.compareRail = !state.compareRail; renderVisualStudio(activeVisualLedger); });
  $("visualFocusToggle").addEventListener("click", () => {
    const active = document.body.classList.toggle("visual-focus-open");
    $("visualFocusToggle").classList.toggle("active", active);
    $("visualFocusToggle").setAttribute("aria-pressed", String(active));
    $("visualFocusToggle").textContent = active ? "Close focus" : "Focus view";
    setTimeout(() => renderVisualStudio(activeVisualLedger), 40);
  });
  $("visualPlay").addEventListener("click", toggleVisualPlay);
  $("visualPlayMobile").addEventListener("click", toggleVisualPlay);
  $("visualCanvas").addEventListener("pointerdown", (event) => {
    if (!visualGeometry || visualGeometry.mode === "static") return;
    visualPointerDown = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    selectCapitalAge(activeVisualLedger, visualAgeFromPoint(event));
  });
  $("visualCanvas").addEventListener("pointermove", (event) => {
    renderVisualHover(event);
    if (visualPointerDown) selectCapitalAge(activeVisualLedger, visualAgeFromPoint(event));
  });
  $("visualCanvas").addEventListener("pointerup", () => { visualPointerDown = false; });
  $("visualCanvas").addEventListener("pointercancel", () => { visualPointerDown = false; });
  $("visualCanvas").addEventListener("pointerleave", () => { visualPointerDown = false; $("visualHover").hidden = true; });
  $("visualCanvas").addEventListener("keydown", (event) => {
    if (["ArrowLeft", "ArrowDown", "ArrowRight", "ArrowUp", "Home", "End"].includes(event.key)) event.preventDefault();
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") selectCapitalAge(activeVisualLedger, state.selectedCapitalAge - 1);
    if (event.key === "ArrowRight" || event.key === "ArrowUp") selectCapitalAge(activeVisualLedger, state.selectedCapitalAge + 1);
    if (event.key === "Home") selectCapitalAge(activeVisualLedger, 60);
    if (event.key === "End") selectCapitalAge(activeVisualLedger, 95);
  });
  let visualResizeTimer;
  window.addEventListener("resize", () => { clearTimeout(visualResizeTimer); visualResizeTimer = setTimeout(() => { if (activeVisualLedger.length) renderVisualStudio(activeVisualLedger); }, 100); });
  $("washCycles").addEventListener("input", (event) => { state.washCycles = Number(event.target.value); renderTax(currentRail(), operationalLedger(currentRail(), state.spend, state.realReturn)); });
  $("resetScenario").addEventListener("click", () => {
    stopVisualPlay();
    Object.assign(state, { rail: "B", spend: 110_000, realReturn: .05, targetAge: 75, home: 500_000, taxYear: "2026-27", liquidityMonths: 12, simulationSeed: 20260814, selectedIncomeAge: 61, selectedCapitalAge: 75, inspectionAge: 75, washCycles: 6, visualMode: "horizon", visualPerspective: true, compareRail: false });
    renderAll();
    showToast("Rail B central baseline restored.");
  });
  $("themeToggle").addEventListener("click", () => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));
  $("menuToggle").addEventListener("click", () => {
    const open = $("mobileNav").classList.toggle("open");
    $("menuToggle").setAttribute("aria-expanded", open);
    $("menuToggle").textContent = open ? "Close" : "Menu";
  });
  $("mobileNav").querySelectorAll("a").forEach((link) => link.addEventListener("click", () => {
    $("mobileNav").classList.remove("open");
    $("menuToggle").setAttribute("aria-expanded", "false");
    $("menuToggle").textContent = "Menu";
  }));
  $("timeline").querySelectorAll("button").forEach((button) => button.addEventListener("click", () => {
    state.inspectionAge = clamp(Number(button.dataset.age), 60, 95);
    state.selectedCapitalAge = state.inspectionAge;
    renderAll();
    document.getElementById("lifecycle").scrollIntoView({ behavior: "smooth", block: "start" });
  }));
  $("copyScenario").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      showToast("Scenario link copied.");
    } catch {
      showToast("Copy was unavailable; use the browser address bar.");
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && document.body.classList.contains("visual-focus-open")) {
      document.body.classList.remove("visual-focus-open");
      $("visualFocusToggle").classList.remove("active");
      $("visualFocusToggle").setAttribute("aria-pressed", "false");
      $("visualFocusToggle").textContent = "Focus view";
      setTimeout(() => renderVisualStudio(activeVisualLedger), 40);
      return;
    }
    if ((event.key === "r" || event.key === "R") && !/input|textarea|select/i.test(document.activeElement.tagName)) {
      state.rail = state.rail === "A" ? "B" : "A";
      state.washCycles = 6;
      renderAll();
    }
  });

  const initialTheme = (() => {
    try { return localStorage.getItem("robinson-atlas-theme") || "light"; } catch { return "light"; }
  })();
  document.documentElement.dataset.theme = initialTheme === "dark" ? "dark" : "light";
  $("themeToggle").textContent = initialTheme === "dark" ? "Light" : "Dark";
  $("incomeAgeSelect").innerHTML = Array.from({ length: 35 }, (_, index) => 61 + index).map((age) => `<option value="${age}">Year ${age - 60} · age ${age - 1}→${age}</option>`).join("");
  $("capitalAgeSelect").innerHTML = Array.from({ length: 36 }, (_, index) => 60 + index).map((age) => `<option value="${age}">Age ${age}</option>`).join("");
  state.washCycles = 6;
  renderAll();
})();
