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
    timeMachine: false,
  };

  let charts = { income: null, capital: null, landscape: null, frontier: null };
  let activeLandscapeLedger = [];
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

  function renderTimeMachineCanvas(ledger) {
    const canvas = $("timeMachineCanvas");
    if (!canvas || !state.timeMachine || !ledger || !ledger.length) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(320, Math.round(rect.width));
    const height = Math.max(260, Math.round(rect.height));
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const context = canvas.getContext("2d");
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);

    const colors = chartTheme();
    const style = getComputedStyle(document.documentElement);
    const panel = style.getPropertyValue("--panel").trim();
    const pad = { l: 58, r: 40, t: 38, b: 48 };
    const depth = { x: Math.min(26, width * .035), y: -Math.min(18, height * .05) };
    const maximum = Math.max(...ledger.map((row) => row.ending), 1) * 1.08;
    const plotWidth = width - pad.l - pad.r;
    const plotHeight = height - pad.t - pad.b;
    const x = (index) => pad.l + index / Math.max(1, ledger.length - 1) * plotWidth;
    const y = (value) => pad.t + (1 - value / maximum) * plotHeight;
    const selectedIndex = clamp(state.selectedCapitalAge - 60, 0, ledger.length - 1);
    const selected = ledger[selectedIndex];

    context.fillStyle = panel;
    context.fillRect(0, 0, width, height);
    context.strokeStyle = withAlpha(colors.line, .72);
    context.lineWidth = 1;
    for (let gridTick = 0; gridTick <= 4; gridTick += 1) {
      const yy = pad.t + gridTick / 4 * plotHeight;
      context.beginPath();
      context.moveTo(pad.l, yy);
      context.lineTo(width - pad.r, yy);
      context.stroke();
      context.fillStyle = colors.text;
      context.font = "700 10px system-ui, sans-serif";
      context.textAlign = "right";
      context.fillText(compact(maximum * (1 - gridTick / 4)), pad.l - 8, yy + 3);
    }

    context.fillStyle = withAlpha(colors.blue, .055);
    context.beginPath();
    context.moveTo(pad.l, height - pad.b);
    context.lineTo(width - pad.r, height - pad.b);
    context.lineTo(width - pad.r + depth.x, height - pad.b + depth.y);
    context.lineTo(pad.l + depth.x, height - pad.b + depth.y);
    context.closePath();
    context.fill();

    const drawLayer = (lower, upper, fill, stroke) => {
      context.beginPath();
      upper.forEach((value, index) => index ? context.lineTo(x(index), y(value)) : context.moveTo(x(index), y(value)));
      for (let index = lower.length - 1; index >= 0; index -= 1) context.lineTo(x(index), y(lower[index]));
      context.closePath();
      context.fillStyle = fill;
      context.fill();
      context.strokeStyle = stroke;
      context.lineWidth = 2.4;
      context.stroke();

      context.beginPath();
      upper.forEach((value, index) => index ? context.lineTo(x(index) + depth.x, y(value) + depth.y) : context.moveTo(x(index) + depth.x, y(value) + depth.y));
      context.strokeStyle = withAlpha(stroke, .62);
      context.lineWidth = 1.5;
      context.stroke();
      [[0], [upper.length - 1]].forEach(([index]) => {
        context.beginPath();
        context.moveTo(x(index), y(upper[index]));
        context.lineTo(x(index) + depth.x, y(upper[index]) + depth.y);
        context.stroke();
      });
    };

    const zeroes = ledger.map(() => 0);
    const poolC = ledger.map((row) => row.poolC);
    const ending = ledger.map((row) => row.ending);
    drawLayer(zeroes, poolC, withAlpha(colors.violet, .38), colors.violet);
    drawLayer(poolC, ending, withAlpha(colors.blue, .40), colors.blue);

    const planeX = x(selectedIndex);
    context.fillStyle = withAlpha(colors.green, .14);
    context.fillRect(planeX - 2, pad.t, 4, plotHeight);
    context.setLineDash([5, 5]);
    context.strokeStyle = colors.green;
    context.lineWidth = 1.5;
    context.beginPath();
    context.moveTo(planeX, pad.t);
    context.lineTo(planeX, height - pad.b);
    context.stroke();
    context.setLineDash([]);
    ledger.forEach((row, index) => {
      if (row.age % 5 !== 0 && index !== selectedIndex && row.age !== 95) return;
      context.beginPath();
      context.arc(x(index), y(row.ending), index === selectedIndex ? 6 : 3.5, 0, Math.PI * 2);
      context.fillStyle = index === selectedIndex ? colors.green : colors.blue;
      context.fill();
      context.strokeStyle = panel;
      context.lineWidth = 2;
      context.stroke();
      context.fillStyle = colors.text;
      context.font = "700 10px system-ui, sans-serif";
      context.textAlign = "center";
      context.fillText(String(row.age), x(index), height - 18);
    });

    context.fillStyle = colors.green;
    context.font = "900 10px system-ui, sans-serif";
    context.textAlign = selectedIndex > ledger.length - 7 ? "right" : "left";
    context.fillText(`AGE ${selected.age}`, selectedIndex > ledger.length - 7 ? planeX - 9 : planeX + 9, pad.t + 13);
    context.fillStyle = style.getPropertyValue("--text").trim();
    context.font = "800 15px system-ui, sans-serif";
    context.fillText(`${money0.format(selected.ending)} investments`, selectedIndex > ledger.length - 7 ? planeX - 9 : planeX + 9, pad.t + 33);
    context.fillStyle = colors.text;
    context.font = "700 10px system-ui, sans-serif";
    context.fillText(`Pool A ${money0.format(selected.poolA)} · Pool C ${money0.format(selected.poolC)}`, selectedIndex > ledger.length - 7 ? planeX - 9 : planeX + 9, pad.t + 49);
    canvas.dataset.plotLeft = String(pad.l);
    canvas.dataset.plotWidth = String(plotWidth);
  }

  function renderLandscapeMode() {
    const active = Boolean(state.timeMachine);
    $("capitalLandscape").classList.toggle("time-machine", active);
    $("timeMachineToggle").setAttribute("aria-pressed", String(active));
    $("timeMachineToggle").textContent = active ? "Exit Time Machine" : "Enter Time Machine";
    $("timeMachineNote").textContent = active
      ? `Time Machine is active: click a capital point to bring that year forward in depth. It uses the same active ${pct(state.realReturn)} real-return ledger.`
      : `Landscape mode shows the full path using the active ${pct(state.realReturn)} real-return ledger. Activate Time Machine for a depth view with a selected-age plane and clickable points.`;
    renderTimeMachineCanvas(activeLandscapeLedger);
  }

  function renderCapitalLandscapeReadout(row) {
    const rail = currentRail();
    const total = Math.max(1, row.ending);
    const isOpening = row.age === 60;
    $("landscapeAgeRange").value = String(row.age);
    $("landscapeAgeOut").textContent = `Age ${row.age}`;
    $("landscapeMoment").textContent = isOpening ? "Retirement-day opening" : `Age ${row.age - 1}→${row.age}`;
    $("landscapeStageValue").textContent = money0.format(row.ending);
    $("landscapeStageCopy").textContent = isOpening ? "Opening investment capital" : "Total investment capital at year end";
    $("landscapeSummary").textContent = `Pool A and Pool C are layered from the active annual ledger at ${pct(state.realReturn)} real return p.a. after inflation. Income stays out of this capital-composition scale.`;
    $("landscapeTitle").textContent = isOpening ? "Age 60 · opening position" : `Age ${row.age} · end of planning year ${row.age - 60}`;
    $("landscapeNarrative").textContent = isOpening
      ? "Capital is measured on retirement day before annual pension, spending or drawdown is applied."
      : `The indexed PSS floor is ${money0.format(rail.netPension)}. The ledger draws ${money0.format(row.draw)} from Pool A and ends this year with the capital mix shown.`;
    $("landscapePoolA").textContent = money0.format(row.poolA);
    $("landscapePoolAShare").textContent = `${pct(row.poolA / total)} of investments`;
    $("landscapePoolC").textContent = money0.format(row.poolC);
    $("landscapePoolCShare").textContent = `${pct(row.poolC / total)} of investments · invested reserve`;
    $("landscapeDraw").textContent = isOpening ? money0.format(Math.max(0, state.spend - rail.netPension)) : money0.format(row.draw);
    $("landscapeDrawDetail").textContent = isOpening ? "Starting annual portfolio gap" : row.reinvestment > 0 ? `${money0.format(row.reinvestment)} mandatory-draw surplus reinvested` : "Planning portfolio draw in this year";
    $("landscapeReturn").textContent = `${pct(state.realReturn)} real p.a.`;
    $("landscapeReturnDetail").textContent = "After inflation · live scenario";
    document.querySelectorAll("#landscapeMilestones button").forEach((button) => {
      const active = Number(button.dataset.landscapeAge) === row.age;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function selectCapitalAge(ledger, age) {
    state.selectedCapitalAge = clamp(Number(age), 60, 95);
    const row = rowAt(ledger, state.selectedCapitalAge);
    renderCapitalReadout(row);
    renderCapitalLandscapeReadout(row);
    renderTimeMachineCanvas(ledger);
  }

  function renderCapitalLandscape(ledger) {
    activeLandscapeLedger = ledger;
    const colors = chartTheme();
    if (charts.landscape) charts.landscape.destroy();
    const options = baseChartOptions((event, elements, chart) => {
      const index = chartIndex(chart, event, elements);
      selectCapitalAge(ledger, Number(chart.data.labels[index]));
    });
    options.scales.y.stacked = true;
    options.scales.x.stacked = true;
    charts.landscape = new Chart($("capitalLandscapeChart"), {
      type: "line",
      data: {
        labels: ledger.map((row) => row.age),
        datasets: [
          { label: "Pool A", data: ledger.map((row) => row.poolA), borderColor: colors.blue, backgroundColor: withAlpha(colors.blue, .34), fill: true, stack: "capital", borderWidth: 3, pointRadius: 0, tension: .16 },
          { label: "Pool C invested reserve", data: ledger.map((row) => row.poolC), borderColor: colors.green, backgroundColor: withAlpha(colors.green, .30), fill: true, stack: "capital", borderWidth: 3, pointRadius: 0, tension: .16 },
        ],
      },
      options,
    });
    renderLandscapeMode();
    renderTimeMachineCanvas(ledger);
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
    renderCapitalLandscape(ledger);
    selectCapitalAge(ledger, state.selectedCapitalAge);
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
  $("landscapeAgeRange").addEventListener("input", (event) => {
    selectCapitalAge(operationalLedger(currentRail(), state.spend, state.realReturn), Number(event.target.value));
  });
  $("landscapeMilestones").querySelectorAll("button").forEach((button) => button.addEventListener("click", () => {
    selectCapitalAge(operationalLedger(currentRail(), state.spend, state.realReturn), Number(button.dataset.landscapeAge));
  }));
  $("timeMachineToggle").addEventListener("click", () => {
    state.timeMachine = !state.timeMachine;
    renderLandscapeMode();
  });
  $("timeMachineCanvas").addEventListener("click", (event) => {
    if (!activeLandscapeLedger.length) return;
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const chartX = (event.clientX - rect.left) / Math.max(1, rect.width) * canvas.width / Math.min(window.devicePixelRatio || 1, 2);
    const index = clamp(Math.round((chartX - Number(canvas.dataset.plotLeft || 0)) / Math.max(1, Number(canvas.dataset.plotWidth || 1)) * (activeLandscapeLedger.length - 1)), 0, activeLandscapeLedger.length - 1);
    selectCapitalAge(activeLandscapeLedger, activeLandscapeLedger[index].age);
  });
  window.addEventListener("resize", () => {
    if (activeLandscapeLedger.length && state.timeMachine) renderTimeMachineCanvas(activeLandscapeLedger);
  });
  $("washCycles").addEventListener("input", (event) => { state.washCycles = Number(event.target.value); renderTax(currentRail(), operationalLedger(currentRail(), state.spend, state.realReturn)); });
  $("resetScenario").addEventListener("click", () => {
    Object.assign(state, { rail: "B", spend: 110_000, realReturn: .05, targetAge: 75, home: 500_000, taxYear: "2026-27", liquidityMonths: 12, simulationSeed: 20260814, selectedIncomeAge: 61, selectedCapitalAge: 75, inspectionAge: 75, washCycles: 6, timeMachine: false });
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
