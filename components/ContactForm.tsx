"use client";

import { useActionState } from "react";
import { submitContact, type ContactState } from "@/app/contact/actions";
import { services } from "@/lib/content";

const initial: ContactState = { status: "idle" };

export default function ContactForm() {
  const [state, action, pending] = useActionState(submitContact, initial);

  if (state.status === "ok") {
    return (
      <div className="form-card" role="status">
        <h2 style={{ fontSize: 28, letterSpacing: "-0.02em" }}>Message sent</h2>
        <p className="text">{state.message ?? "Thanks — we'll be in touch soon."}</p>
      </div>
    );
  }

  return (
    <form action={action} className="form-card" style={{ position: "relative" }} noValidate={false}>
      <div className="form-grid">
        <label className="field">
          Full name
          <input name="name" type="text" autoComplete="name" required placeholder="Jane Cooper" />
        </label>
        <label className="field">
          Work email
          <input name="email" type="email" autoComplete="email" required placeholder="jane@company.com" />
        </label>
        <label className="field">
          Company
          <input name="company" type="text" autoComplete="organization" placeholder="Company name" />
        </label>
        <label className="field">
          Phone (optional)
          <input name="phone" type="tel" autoComplete="tel" placeholder="+1 (555) 000-0000" />
        </label>
      </div>
      <label className="field">
        I&apos;m interested in
        <select name="interest" defaultValue="">
          <option value="" disabled>
            Choose a service
          </option>
          {services.map((s) => (
            <option key={s.slug} value={s.title}>
              {s.title}
            </option>
          ))}
          <option value="Careers">Careers</option>
          <option value="Something else">Something else</option>
        </select>
      </label>
      <label className="field">
        How can we help?
        <textarea name="message" rows={5} required placeholder="A few lines about your project, timeline or question" />
      </label>
      <div className="hp" aria-hidden="true">
        <label>
          Website
          <input name="website" type="text" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      {state.status === "error" && (
        <p className="form-status err" role="alert">
          {state.message}
        </p>
      )}
      <button type="submit" className="btn btn-primary" style={{ alignSelf: "flex-start" }} disabled={pending}>
        {pending ? "Sending…" : "Send message"}
      </button>
      <p className="muted" style={{ fontSize: 13.5 }}>
        By sending this form you agree to our <a href="/privacy">privacy policy</a>.
      </p>
    </form>
  );
}
