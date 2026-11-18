"use client";

import { useActionState } from "react";
import { saveDetails, type FormState } from "../actions";

const STATES = "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(" ");

type D = {
  phone: string; address1: string; address2: string; city: string; state: string; zip: string;
  emergencyName: string; emergencyRelationship: string; emergencyPhone: string;
};

export default function DetailsForm({ d, first }: { d: D; first: boolean }) {
  const [s, action, pending] = useActionState(saveDetails, {} as FormState);
  return (
    <form action={action} className="form-card i9-stack" style={{ gap: 18 }}>
      <p className="hr-section-label" style={{ margin: 0 }}>Your contact details</p>
      <label className="field">Mobile phone<input name="phone" type="tel" autoComplete="tel" defaultValue={d.phone} placeholder="(555) 123-4567" required /></label>
      <label className="field">Home address<input name="address1" autoComplete="address-line1" defaultValue={d.address1} placeholder="Street address" required /></label>
      <label className="field">Apartment, suite, etc. <span className="field-hint">(optional)</span><input name="address2" autoComplete="address-line2" defaultValue={d.address2} /></label>
      <div className="form-grid details-grid">
        <label className="field">City<input name="city" autoComplete="address-level2" defaultValue={d.city} required /></label>
        <label className="field">State
          <select name="state" autoComplete="address-level1" defaultValue={d.state || ""} required>
            <option value="" disabled>Choose…</option>
            {STATES.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </label>
        <label className="field">ZIP code<input name="zip" inputMode="numeric" autoComplete="postal-code" defaultValue={d.zip} maxLength={10} required /></label>
      </div>

      <p className="hr-section-label" style={{ margin: "6px 0 0" }}>Emergency contact</p>
      <p className="muted i9-small" style={{ marginTop: -10 }}>Someone we can call if there&apos;s an emergency.</p>
      <div className="form-grid">
        <label className="field">Full name<input name="emergencyName" autoComplete="off" defaultValue={d.emergencyName} required /></label>
        <label className="field">Relationship<input name="emergencyRelationship" autoComplete="off" defaultValue={d.emergencyRelationship} placeholder="e.g. Spouse, Parent, Friend" required /></label>
        <label className="field">Phone<input name="emergencyPhone" type="tel" autoComplete="off" defaultValue={d.emergencyPhone} placeholder="(555) 123-4567" required /></label>
      </div>

      {s.error && <p className="form-status err" role="alert">{s.error}</p>}
      {s.message && <p className="form-status ok" role="status">{s.message}</p>}
      <button className="btn btn-primary" disabled={pending} style={{ alignSelf: "flex-start" }}>{pending ? "Saving…" : first ? "Save and continue" : "Save changes"}</button>
      <p className="muted i9-small">Only Stagity Solutions HR can see these details.</p>
    </form>
  );
}
