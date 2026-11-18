import { caseForToken, i9Configured } from "@/lib/i9/server";
import { company } from "@/lib/content";
import Section1Form from "./Section1Form";

function Message({ title, body }: { title: string; body: string }) {
  return (
    <section className="container hero" style={{ maxWidth: 720 }}>
      <p className="eyebrow">Form I-9</p>
      <h1 className="h2">{title}</h1>
      <p className="lead">{body}</p>
    </section>
  );
}

export default async function EmployeeI9({ params }: { params: Promise<{ token: string }> }) {
  if (!i9Configured().ok) return <Message title="Not available" body={`Please contact ${company.email}.`} />;
  const { token } = await params;
  const c = await caseForToken(token);
  if (!c) {
    return <Message title="This link isn't active" body={`It may have been used already or replaced by a newer link. If you still need to complete your Form I-9, email ${company.email}.`} />;
  }
  if (c.expired) return <Message title="This link has expired" body={`Please email ${company.email} and HR will send you a new one.`} />;
  if (c.status !== "invited") return <Message title="Already completed" body="Thank you. HR will contact you to schedule the video call." />;

  return (
    <section className="container i9-page" style={{ maxWidth: 880 }}>
      <div>
        <p className="eyebrow">Form I-9 · Employment Eligibility Verification</p>
        <h1 className="h2">Welcome, {c.employee_first_name}</h1>
        <p className="lead" style={{ marginTop: 16 }}>
          Complete Section 1 and upload your documents{c.first_day ? ` by ${c.first_day}` : ""}. Your information is encrypted and only
          {" "}{company.name} HR can see it.
        </p>
      </div>
      <Section1Form token={token} firstName={c.employee_first_name} lastName={c.employee_last_name} email={c.employee_email} />
    </section>
  );
}
