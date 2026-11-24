"use client";

import { useActionState, useState } from "react";
import { saveDeposit, savePersonal, saveW4, signDocument, submitDocs, type ObState } from "./actions";

const STATES = "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(" ");
const Err = ({ s }: { s: ObState }) => (s.error ? <p className="form-status err" role="alert">{s.error}</p> : null);
const H = ({ t }: { t: string }) => <p className="hr-section-label" style={{ margin: "6px 0 0" }}>{t}</p>;
const Hint = ({ t }: { t: string }) => <span className="field-hint"> ({t})</span>;

export type PersonalDefaults = Partial<Record<string, string>> & { ssnLast4?: string };

export function PersonalForm({ d, statuses }: { d: PersonalDefaults; statuses: { value: string; label: string }[] }) {
  const [s, action, pending] = useActionState(savePersonal, {} as ObState);
  const [status, setStatus] = useState(d.workStatus ?? "");
  const needsNumber = status && status !== "citizen";
  return (
    <form action={action} className="form-card ob-form">
      <H t="Personal details" />
      <div className="form-grid">
        <label className="field">First name<input name="firstName" defaultValue={d.firstName} required autoComplete="given-name" /></label>
        <label className="field">M.I.<Hint t="optional" /><input name="middleInitial" defaultValue={d.middleInitial} maxLength={1} style={{ maxWidth: 90 }} /></label>
        <label className="field">Last name<input name="lastName" defaultValue={d.lastName} required autoComplete="family-name" /></label>
      </div>
      <div className="form-grid">
        <label className="field">Street address<input name="street" defaultValue={d.street} required autoComplete="address-line1" /></label>
        <label className="field">Apt #<Hint t="optional" /><input name="apt" defaultValue={d.apt} autoComplete="address-line2" /></label>
      </div>
      <div className="form-grid details-grid">
        <label className="field">City<input name="city" defaultValue={d.city} required autoComplete="address-level2" /></label>
        <label className="field">State
          <select name="state" defaultValue={d.state ?? ""} required><option value="" disabled>Choose…</option>{STATES.map((x) => <option key={x}>{x}</option>)}</select>
        </label>
        <label className="field">ZIP<input name="zip" defaultValue={d.zip} inputMode="numeric" required maxLength={10} /></label>
      </div>
      <div className="form-grid">
        <label className="field">SSN{d.ssnLast4 && <Hint t={`saved: ending ${d.ssnLast4}; re-enter to save changes`} />}<input name="ssn" inputMode="numeric" autoComplete="off" placeholder="123-45-6789" required maxLength={11} /></label>
        <label className="field">Date of birth<input name="dob" type="date" defaultValue={d.dob} required /></label>
      </div>
      <H t="Work authorization" />
      <div className="form-grid">
        <label className="field">Working status
          <select name="workStatus" value={status} onChange={(e) => setStatus(e.target.value)} required>
            <option value="" disabled>Choose…</option>
            {statuses.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
          </select>
        </label>
        {needsNumber && <label className="field">OPT / EAD / visa #<input name="statusNumber" defaultValue={d.statusNumber} /></label>}
        {needsNumber && <label className="field">Status expiry date<input name="statusExpires" type="date" defaultValue={d.statusExpires} /></label>}
      </div>
      <H t="Contact" />
      <div className="form-grid">
        <label className="field">Cell phone<input name="cellPhone" type="tel" defaultValue={d.cellPhone} required /></label>
        <label className="field">Home phone<Hint t="optional" /><input name="homePhone" type="tel" defaultValue={d.homePhone} /></label>
        <label className="field">Personal email<input name="personalEmail" type="email" defaultValue={d.personalEmail} /></label>
      </div>
      <H t="Employee work info" />
      <label className="field">Work full address<Hint t="client office, or 'Remote' and your city" /><input name="workAddress" defaultValue={d.workAddress} required /></label>
      <div className="form-grid">
        <label className="field">Work phone<Hint t="optional" /><input name="workPhone" type="tel" defaultValue={d.workPhone} /></label>
        <label className="field">Work email<Hint t="optional" /><input name="workEmail" type="email" defaultValue={d.workEmail} /></label>
      </div>
      <Err s={s} />
      <button className="btn btn-primary" disabled={pending} style={{ alignSelf: "flex-start" }}>{pending ? "Saving…" : "Save and continue"}</button>
    </form>
  );
}

export function W4Form({ name, d }: { name: string; d?: { filingStatus?: string; multipleJobs?: boolean; children?: number; others?: number; otherIncome?: number; deductions?: number; extraWithholding?: number; exempt?: boolean } }) {
  const [s, action, pending] = useActionState(saveW4, {} as ObState);
  return (
    <form action={action} className="form-card ob-form">
      <H t="Step 1(c): Filing status" />
      <div className="i9-stack" style={{ gap: 8 }}>
        {[["single", "Single or Married filing separately"], ["married_joint", "Married filing jointly or Qualifying widow(er)"], ["head", "Head of household"]].map(([v, l]) => (
          <label key={v} className="i9-check"><input type="radio" name="filingStatus" value={v} defaultChecked={d?.filingStatus === v} required /> {l}</label>
        ))}
      </div>
      <H t="Step 2: Multiple jobs or spouse works" />
      <label className="i9-check"><input type="checkbox" name="multipleJobs" defaultChecked={d?.multipleJobs} /> Tick only if there are exactly two jobs in total (you and your spouse, or two jobs for you) with similar pay (Step 2c)</label>
      <H t="Step 3: Dependents (if total income is $200,000 or less, $400,000 if married filing jointly)" />
      <div className="form-grid">
        <label className="field">Qualifying children under 17<Hint t="× $2,000" /><input name="children" type="number" min={0} max={20} defaultValue={d?.children ?? 0} /></label>
        <label className="field">Other dependents<Hint t="× $500" /><input name="others" type="number" min={0} max={20} defaultValue={d?.others ?? 0} /></label>
      </div>
      <H t="Step 4 (optional): Other adjustments" />
      <div className="form-grid">
        <label className="field">4(a) Other income (not from jobs), per year ($)<input name="otherIncome" inputMode="decimal" defaultValue={d?.otherIncome || ""} placeholder="0" /></label>
        <label className="field">4(b) Deductions, per year ($)<input name="deductions" inputMode="decimal" defaultValue={d?.deductions || ""} placeholder="0" /></label>
        <label className="field">4(c) Extra withholding, per pay period ($)<input name="extraWithholding" inputMode="decimal" defaultValue={d?.extraWithholding || ""} placeholder="0" /></label>
      </div>
      <label className="i9-check"><input type="checkbox" name="exempt" defaultChecked={d?.exempt} /> I claim exemption from withholding (only if you had no tax liability last year and expect none this year)</label>
      <div className="ob-sign">
        <H t="Step 5: Sign" />
        <p className="muted i9-small" style={{ margin: 0 }}>Under penalties of perjury, I declare that this certificate, to the best of my knowledge and belief, is true, correct, and complete.</p>
        <label className="field">Type your full name to sign<input name="signedName" placeholder={name} required autoComplete="off" /></label>
        <label className="i9-check"><input type="checkbox" name="agree" required /> I agree to sign this Form W-4 electronically.</label>
      </div>
      <Err s={s} />
      <button className="btn btn-primary" disabled={pending} style={{ alignSelf: "flex-start" }}>{pending ? "Signing…" : "Sign Form W-4"}</button>
    </form>
  );
}

export function DepositForm({ name, d }: { name: string; d?: { bankName?: string; bankState?: string; accountType?: string } }) {
  const [s, action, pending] = useActionState(saveDeposit, {} as ObState);
  return (
    <form action={action} className="form-card ob-form">
      <p className="text" style={{ margin: 0 }}>
        I hereby authorize Stagity Solutions LLC to initiate automatic deposits to my account at the financial institution named below. I also authorize Stagity Solutions LLC to
        make withdrawals from this account if a credit entry is made in error. Further, I agree not to hold Stagity Solutions LLC responsible for any delay or loss of funds due to
        incorrect or incomplete information supplied by me or by my financial institution or due to an error on the part of my financial institution in depositing funds to my
        account. This agreement will remain in effect until Stagity Solutions LLC receives a written notice of cancellation from me or my financial institution, or until I submit a
        new direct deposit form to the Payroll Department.
      </p>
      <H t="Account information" />
      <div className="form-grid">
        <label className="field">Name of financial institution<input name="bankName" defaultValue={d?.bankName} placeholder="e.g. Chase Bank" required /></label>
        <label className="field">State<Hint t="where you opened the account" /><input name="bankState" defaultValue={d?.bankState} placeholder="e.g. Texas" required /></label>
      </div>
      <div className="form-grid">
        <label className="field">Routing number<Hint t="9 digits" /><input name="routing" inputMode="numeric" maxLength={9} required autoComplete="off" /></label>
        <label className="field">Account number<input name="account" inputMode="numeric" maxLength={17} required autoComplete="off" /></label>
        <label className="field">Confirm account number<input name="accountConfirm" inputMode="numeric" maxLength={17} required autoComplete="off" /></label>
      </div>
      <div className="i9-stack" style={{ gap: 8 }}>
        <label className="i9-check"><input type="radio" name="accountType" value="checking" defaultChecked={d?.accountType !== "savings"} /> Checking</label>
        <label className="i9-check"><input type="radio" name="accountType" value="savings" defaultChecked={d?.accountType === "savings"} /> Savings</label>
      </div>
      <p className="muted i9-small" style={{ margin: 0 }}>Also upload a <strong>voided check</strong> (or a bank letter) on the Documents step.</p>
      <div className="ob-sign">
        <label className="field">Authorized signature: type your full name<input name="signedName" placeholder={name} required autoComplete="off" /></label>
        <label className="i9-check"><input type="checkbox" name="agree" required /> I agree to sign this Direct Deposit Agreement electronically.</label>
      </div>
      <Err s={s} />
      <button className="btn btn-primary" disabled={pending} style={{ alignSelf: "flex-start" }}>{pending ? "Signing…" : "Sign agreement"}</button>
    </form>
  );
}

export function SubmitDocsButton({ ready }: { ready: boolean }) {
  const [s, action, pending] = useActionState(submitDocs, {} as ObState);
  return (
    <form action={action} className="i9-stack" style={{ gap: 8 }}>
      <Err s={s} />
      <button className="btn btn-primary" disabled={pending} style={{ alignSelf: "flex-start" }}>{pending ? "Submitting…" : ready ? "Submit documents" : "Submit documents"}</button>
    </form>
  );
}

export function SignForm({ id, name }: { id: string; name: string }) {
  const [s, action, pending] = useActionState(signDocument, {} as ObState);
  return (
    <form action={action} className="ob-sign">
      <input type="hidden" name="id" value={id} />
      <label className="field">Type your full name to sign<input name="signedName" placeholder={name} required autoComplete="off" /></label>
      <label className="i9-check"><input type="checkbox" name="agree" required /> I have read this document and agree to sign it electronically.</label>
      <Err s={s} />
      <button className="btn btn-primary" disabled={pending} style={{ alignSelf: "flex-start" }}>{pending ? "Signing…" : "Sign document"}</button>
    </form>
  );
}
