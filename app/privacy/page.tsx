import type { Metadata } from "next";
import { company } from "@/lib/content";

export const metadata: Metadata = {
  title: "Privacy policy",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <section className="container section" style={{ paddingTop: 96 }}>
      <div className="prose">
        <p className="eyebrow">Legal</p>
        <h1 className="display-md" style={{ color: "var(--ink)" }}>
          Privacy policy
        </h1>
        <p>
          This policy explains how {company.legalName} (&quot;we&quot;, &quot;us&quot;) handles information collected
          through this website.
        </p>
        <h2>Information we collect</h2>
        <p>
          When you use our contact form, we collect the details you provide — such as your name, email address, company,
          phone number and message — so we can respond to your enquiry.
        </p>
        <h2>How we use it</h2>
        <p>
          We use this information only to reply to you and to provide the services you ask about. We do not sell your
          personal information.
        </p>
        <h2>Storage and security</h2>
        <p>
          Form submissions are stored securely with our service providers and kept only as long as needed for business
          purposes.
        </p>
        <h2>Your choices</h2>
        <p>
          To ask us to access, correct or delete your information, email{" "}
          <a href={`mailto:${company.email}`}>{company.email}</a>.
        </p>
        <h2>Contact</h2>
        <p>
          {company.legalName}, {company.addressLine1}, {company.addressLine2}. Phone {company.phone}.
        </p>
      </div>
    </section>
  );
}
