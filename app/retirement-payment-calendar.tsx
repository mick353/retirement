"use client";

import { useState, type FormEvent } from "react";
import {
  CASH_BRIDGE_EVENT_LABELS, PLANNED_RETIREMENT_DATE, readCashBridgeSettings, retirementCashBridge, retirementPaymentCalendar,
  type CashBridgeEvent, type CashBridgeSettings, type RetirementCalendarInputs,
} from "./retirement-core";

export type CalendarSettings = Omit<RetirementCalendarInputs, "annualLivingCosts" | "netPensionPerFortnight"> & {
  cashBridge?: CashBridgeSettings;
  useModelledCalendar?: true;
};

export function readCalendarSettings(value: unknown): CalendarSettings | null {
  if (!value || typeof value !== "object") return null;
  const entry = value as Partial<CalendarSettings>;
  if (typeof entry.retirementDate !== "string" || typeof entry.abpStart !== "string"
    || typeof entry.abpOpening !== "number" || typeof entry.abpAge !== "number" || typeof entry.nextJulyAge !== "number"
    || (entry.nextJulyBalance !== null && typeof entry.nextJulyBalance !== "number")
    || (entry.firstPssPayday !== null && typeof entry.firstPssPayday !== "string")) return null;
  const settings: CalendarSettings = {
    retirementDate: entry.retirementDate, abpStart: entry.abpStart, abpOpening: entry.abpOpening, abpAge: entry.abpAge,
    nextJulyBalance: entry.nextJulyBalance, nextJulyAge: entry.nextJulyAge, firstPssPayday: entry.firstPssPayday,
  };
  try {
    retirementPaymentCalendar({ ...settings, annualLivingCosts: 0, netPensionPerFortnight: 0 });
    if (entry.cashBridge !== undefined) settings.cashBridge = readCashBridgeSettings(entry.cashBridge);
    if (entry.useModelledCalendar === true) settings.useModelledCalendar = true;
    return settings;
  } catch {
    return null;
  }
}

const dateFormat = new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const dateLabel = (value: string) => dateFormat.format(new Date(`${value}T00:00:00Z`));
const dollars = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
const cashDollars = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: 2 });

function CashBridge({ inputs, annualBudget, onSave }: {
  inputs: CalendarSettings;
  annualBudget: number;
  onSave: (next?: CashBridgeSettings) => void;
}) {
  const [error, setError] = useState("");
  const [events, setEvents] = useState(() => inputs.cashBridge?.events ?? []);
  const [showDaily, setShowDaily] = useState(false);
  const result = inputs.cashBridge && retirementCashBridge(inputs.retirementDate, annualBudget, inputs.cashBridge);
  const apply = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      onSave(readCashBridgeSettings({ startingCash: Number(data.get("startingCash")), days: Number(data.get("days")), events }));
      setError("");
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Check the dated amounts.");
    }
  };
  const changeEvent = (index: number, change: Partial<CashBridgeEvent>) => {
    setEvents(previous => previous.map((event, i) => i === index ? { ...event, ...change } : event));
  };
  const visibleRows = result?.rows.filter((row, index) => showDaily || index === 0 || row.date === result.end
    || row.events.length > 0 || row.date === result.lowest.date || row.date === result.firstNegative);
  const movements = result?.rows.flatMap(row => row.events) ?? [];
  return <section className="calendar-period cash-bridge" aria-labelledby="cash-bridge-heading">
    <h4 id="cash-bridge-heading">Cash until the first pension payments</h4>
    <p>Start with cash in the bank on {dateLabel(inputs.retirementDate)}. Daily living costs come from the active {dollars.format(annualBudget)} annual budget. Add bank deposits on the dates you expect them, and enter bills here only if they are extra to that budget.</p>
    {result && <>
      <dl className="cash-bridge-totals">
        <div><dt>Lowest cash balance</dt><dd id="cash-bridge-lowest">{cashDollars.format(result.lowest.balance)} on {dateLabel(result.lowest.date)}{result.lowest.atOpening ? " at opening" : " at day end"}</dd></div>
        <div><dt>First day ending short of cash</dt><dd>{result.firstNegative ? dateLabel(result.firstNegative) : "None in this window"}</dd></div>
        <div><dt>Cash on {dateLabel(result.end)}</dt><dd>{cashDollars.format(result.rows[result.rows.length - 1].balance)}</dd></div>
      </dl>
      <div className="table-wrap" role="region" aria-label="Running cash balance" tabIndex={0}>
        <table><thead><tr><th scope="col">Date</th><th scope="col">Cash in</th><th scope="col">Living costs</th><th scope="col">Extra bills</th><th scope="col">Closing cash</th></tr></thead>
          <tbody>{visibleRows?.map(row => <tr key={row.date}>
            <th scope="row">{dateLabel(row.date)}{row.events.length > 0 && <small className="ledger-period">{row.events.map(event => CASH_BRIDGE_EVENT_LABELS[event.kind]).join(" · ")}</small>}</th>
            <td>{cashDollars.format(row.deposits)}</td><td>{cashDollars.format(row.dailyCosts)}</td><td>{cashDollars.format(row.bills)}</td><td>{cashDollars.format(row.balance)}</td>
          </tr>)}</tbody>
        </table>
      </div>
      {result.rows.length > (visibleRows?.length ?? 0) || showDaily
        ? <button type="button" className="secondary" onClick={() => setShowDaily(value => !value)}>{showDaily ? "Show key dates" : "Show every day"}</button> : null}
      {result.outsideWindow.length > 0 && <p>{result.outsideWindow.length} dated movements fall outside this window. Adjust the dates or the window to include them.</p>}
    </>}
    <p className="cash-bridge-payment-status">
      {!movements.some(event => event.kind === "pss") && `No dated PSS deposit entered in this window. ${inputs.firstPssPayday ? `The calendar starts its estimated PSS schedule on ${dateLabel(inputs.firstPssPayday)}. ` : "The calendar's first PSS payday is also unset. "}`}
      {!movements.some(event => event.kind === "abp") && "No dated ABP deposit entered in this window. "}
      The balance uses entered deposits. The ABP minimum above is a yearly amount.
    </p>
    <form onSubmit={apply}>
      <div className="cash-bridge-fields">
        <label>Starting cash ($)<input name="startingCash" type="number" min="0" step="0.01" inputMode="decimal" required defaultValue={inputs.cashBridge?.startingCash} /></label>
        <label>Days from retirement<input name="days" type="number" min="1" max="366" required defaultValue={inputs.cashBridge?.days ?? 90} /></label>
      </div>
      {events.map((row, index) => <fieldset className="cash-bridge-fields" key={index}>
        <legend>Cash movement {index + 1}</legend>
        <label>Type<select value={row.kind} onChange={event => changeEvent(index, { kind: event.target.value as CashBridgeEvent["kind"] })}>
          {Object.entries(CASH_BRIDGE_EVENT_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select></label>
        <label>Date<input type="date" required value={row.date} onChange={event => changeEvent(index, { date: event.target.value })} /></label>
        <label>Amount ($)<input type="number" min="0.01" step="0.01" inputMode="decimal" required value={row.amount || ""} onChange={event => changeEvent(index, { amount: Number(event.target.value) })} /></label>
        <button type="button" className="secondary" aria-label={`Remove cash movement ${index + 1}`} onClick={() => setEvents(previous => previous.filter((_, i) => index !== i))}>Remove</button>
      </fieldset>)}
      <div className="calendar-actions">
        <button className="secondary" type="button" disabled={events.length >= 100} onClick={() => setEvents(previous => [...previous, {
          kind: previous.length === 0 ? "pss" : "abp", date: previous.length === 0 ? inputs.firstPssPayday ?? "" : "", amount: 0,
        }])}>Add dated movement</button>
        <button className="primary" type="submit">Calculate cash balance</button>
        {inputs.cashBridge && <button className="secondary" type="button" onClick={() => onSave()}>Clear cash estimate</button>}
      </div>
      {error && <p role="alert">{error}</p>}
    </form>
  </section>;
}

export default function RetirementPaymentCalendar({
  settings, openingPoolA, annualBudget, netPension, planningMinimum, onChange,
}: {
  settings: CalendarSettings | null;
  openingPoolA: number;
  annualBudget: number;
  netPension: number;
  planningMinimum: number;
  onChange: (settings: CalendarSettings | null) => void;
}) {
  const [error, setError] = useState("");
  const modelled: CalendarSettings = {
    retirementDate: PLANNED_RETIREMENT_DATE, abpStart: PLANNED_RETIREMENT_DATE, abpOpening: openingPoolA, abpAge: 60,
    nextJulyBalance: null, nextJulyAge: 60, firstPssPayday: null,
  };
  const useModelled = !settings || settings.useModelledCalendar;
  const inputs = useModelled ? { ...modelled, cashBridge: settings?.cashBridge } : settings;
  const amounts = { annualLivingCosts: annualBudget, netPensionPerFortnight: netPension / 26 };
  const periods = retirementPaymentCalendar({ ...inputs, ...amounts });
  const apply = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const number = (name: string) => Number(data.get(name));
    const next = {
      retirementDate: String(data.get("retirementDate")), abpStart: String(data.get("abpStart")),
      abpOpening: number("abpOpening"), abpAge: number("abpAge"), nextJulyAge: number("nextJulyAge"),
      nextJulyBalance: data.get("nextJulyBalance") === "" ? null : number("nextJulyBalance"),
      firstPssPayday: String(data.get("firstPssPayday") || "") || null,
      cashBridge: inputs.cashBridge,
    };
    try {
      retirementPaymentCalendar({ ...next, ...amounts });
      onChange(next);
      setError("");
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Check the dates and amounts.");
    }
  };

  return <details className="note dated-payment">
    <summary>First retirement year and fund payment dates</summary>
    <p>{useModelled ? "Using the modelled retirement date and opening Pool A." : "Using your entered calendar figures."} This calendar applies the minimum draw rules in force on 1 July 2026. The birthday-year planning ledger has a separate first-year minimum of <strong>{dollars.format(planningMinimum)}</strong>.</p>
    <div className="payment-calendar-periods">
      {periods.map((period, index) => <article className="calendar-period" key={period.from}>
        <h4>{dateLabel(period.from)} to {dateLabel(period.to)}</h4>
        <p>{period.days} of {period.yearDays} financial-year days</p>
        <dl>
          <div><dt>Planned living costs</dt><dd>{dollars.format(period.livingCosts)}</dd></div>
          <div><dt>Estimated PSS bank payments</dt><dd>{period.estimatedPssPayments === null ? "Enter the first payday" : dollars.format(period.estimatedPssPayments)}</dd></div>
          <div><dt>{index === 0 && period.days < period.yearDays ? "Partial financial-year minimum" : "ABP financial-year minimum"}</dt><dd>{period.abpMinimum !== null ? dollars.format(period.abpMinimum) : period.abpBasis === "starts-later" ? "ABP starts later" : "Enter 1 July balance"}</dd></div>
        </dl>
        {!!period.pssDates?.length && <details><summary>{period.pssDates.length} estimated PSS paydays</summary>
          <ul className="payment-dates">{period.pssDates.map(date => <li key={date}>{dateLabel(date)}</li>)}</ul>
        </details>}
      </article>)}
    </div>
    <p>Living costs are spread by calendar day. Enter the first PSS payday from CSC to see dates at two-week intervals. Payment totals use annual net PSS divided by 26. First payments and holiday dates can differ. The ABP minimum uses the balance and age at commencement, then the 1 July balance and age for the following year.</p>
    <details className="payment-calendar-inputs">
      <summary>Enter dates and balances for this calendar</summary>
      <form key={JSON.stringify(inputs)} onSubmit={apply}>
        <label>Retirement date<input name="retirementDate" type="date" required defaultValue={inputs.retirementDate} /></label>
        <label>ABP start date<input name="abpStart" type="date" required defaultValue={inputs.abpStart} /></label>
        <label>ABP opening balance ($)<input name="abpOpening" type="number" inputMode="decimal" min="0" step="0.01" required defaultValue={inputs.abpOpening} /></label>
        <label>Age at ABP start<input name="abpAge" type="number" min="0" max="120" required defaultValue={inputs.abpAge} /></label>
        <label>Balance at next 1 July ($)<input name="nextJulyBalance" type="number" inputMode="decimal" min="0" step="0.01" defaultValue={inputs.nextJulyBalance ?? ""} placeholder="Optional" /></label>
        <label>Age at next 1 July<input name="nextJulyAge" type="number" min="0" max="120" required defaultValue={inputs.nextJulyAge} /></label>
        <label>First PSS payday (optional)<input name="firstPssPayday" type="date" defaultValue={inputs.firstPssPayday ?? ""} /></label>
        <div className="calendar-actions"><button className="primary" type="submit">Update calendar</button>{!useModelled && <button className="secondary" type="button" onClick={() => { onChange(inputs.cashBridge ? { ...modelled, useModelledCalendar: true, cashBridge: inputs.cashBridge } : null); setError(""); }}>Use modelled dates</button>}</div>
      </form>
      {error && <p role="alert">{error}</p>}
    </details>
    <CashBridge key={JSON.stringify(inputs.cashBridge)} inputs={inputs} annualBudget={annualBudget}
      onSave={cashBridge => onChange(useModelled && !cashBridge ? null : { ...inputs, ...(useModelled ? { useModelledCalendar: true } : {}), cashBridge })} />
    <div className="calendar-sources">
      <a href="https://www.legislation.gov.au/F1996B00580/2026-07-01/2026-07-01/text/original/epub/OEBPS/document_2/document_2.html" target="_blank" rel="noreferrer">Schedule 7 as at 1 July 2026</a>
      <a href="https://www.csc.gov.au/defined-benefit-members/receiving-a-pension/payday" target="_blank" rel="noreferrer">CSC pension pay calendar</a>
    </div>
  </details>;
}
