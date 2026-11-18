import type { Metadata } from "next";
import { requirePerson } from "@/lib/portal/server";
import DetailsForm from "./DetailsForm";

export const metadata: Metadata = { title: "Your details", robots: { index: false, follow: false } };

/** Phone, home address and emergency contact. Required once after first sign-in; editable later from the menu. */
export default async function Details() {
  const p = await requirePerson({ allowIncomplete: true });
  const first = !p.profile_completed_at;
  return (
    <section className="container i9-page" style={{ maxWidth: 640 }}>
      <div>
        <p className="eyebrow">{first ? "Last step" : "Employee portal"}</p>
        <h1 className="h2">{first ? `Almost done, ${p.first_name}` : "Your details"}</h1>
        <p className="lead" style={{ marginTop: 10 }}>
          {first ? "Please add your contact details and an emergency contact. You only need to do this once." : "Keep your contact details and emergency contact up to date."}
        </p>
      </div>
      <DetailsForm
        first={first}
        d={{
          phone: p.phone ?? "", address1: p.address_line1 ?? "", address2: p.address_line2 ?? "", city: p.city ?? "", state: p.state ?? "", zip: p.zip ?? "",
          emergencyName: p.emergency_name ?? "", emergencyRelationship: p.emergency_relationship ?? "", emergencyPhone: p.emergency_phone ?? "",
        }}
      />
    </section>
  );
}
