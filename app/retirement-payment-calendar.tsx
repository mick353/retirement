"use client";

import { useState, type FormEvent } from "react";
import { PLANNED_RETIREMENT_DATE, retirementPaymentCalendar, type RetirementCalendarInputs } from "./retirement-core";

export type CalendarSettings = Omit<RetirementCalendarInputs, "annualLivingCosts" | "netPensionPerFortnight">;

export function readCalendarSettings(value: unknown): CalendarSettings | null {
  if (!value || typeof value !== "object") return null;
  const entry = value as Partial<CalendarSettings>;
  if (typeof entry.retirementDate !== "string" || typeof entry.abpStart !== "string"
    || typeof entry.abpOpening !== "number" || typeof entry.abpAge !== "number" || typeof entry.nextJulyAge !== "number"
    || (entry.nextJulyBalance !== null && typeof entry.nextJulyBalance !== "number")
    || (entry.firstPssPayday !== null && typeof entry.firstPssPayday !== "string")) return null;
  const settings = {
    retirementDate: entry.retirementDate, abpStart: entry.abpStart, abpOpening: entry.abpOpening, abpAge: entry.abpAge,
    nextJulyBalance: entry.nextJulyBalance, nextJulyAge: entry.nextJulyAge, firstPssPayday: entry.firstPssPayday,
  };
  try {
    retirementPaymentCalendar({ ...settings, annualLivingCosts: 0, netPensionPerFortnight: 0 });
    return settings;
  } catch {
    return null;
  }
}

const dateFormat = new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const dateLabel = (value: string) => dateFormat.format(new Date(`${value}T00:00:00Z`));
const dollars = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });

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
  const inputs: CalendarSettings = settings ?? {
    retirementDate: PLANNED_RETIREMENT_DATE, abpStart: PLANNED_RETIREMENT_DATE, abpOpening: openingPoolA, abpAge: 60,
    nextJulyBalance: null, nextJulyAge: 60, firstPssPayday: null,
  };
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
    <p>{settings ? "Using your entered calendar figures." : "Using the modelled retirement date and opening Pool A."} This calendar applies the minimum draw rules in force on 1 July 2026. The birthday-year planning ledger has a separate first-year minimum of <strong>{dollars.format(planningMinimum)}</strong>.</p>
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
        <div className="calendar-actions"><button className="primary" type="submit">Update calendar</button>{settings && <button className="secondary" type="button" onClick={() => { onChange(null); setError(""); }}>Use modelled dates</button>}</div>
      </form>
      {error && <p role="alert">{error}</p>}
    </details>
    <div className="calendar-sources">
      <a href="https://www.legislation.gov.au/F1996B00580/2026-07-01/2026-07-01/text/original/epub/OEBPS/document_2/document_2.html" target="_blank" rel="noreferrer">Schedule 7 as at 1 July 2026</a>
      <a href="https://www.csc.gov.au/defined-benefit-members/receiving-a-pension/payday" target="_blank" rel="noreferrer">CSC pension pay calendar</a>
    </div>
  </details>;
}
