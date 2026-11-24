import { requireHr } from "@/lib/i9/server";
import { buildOfferPdf, companySignatureImage, companySigner, fillTemplate, offerTemplate, type Offer } from "@/lib/onboarding/offer";
import { todayCT } from "@/lib/portal/dates";

export const dynamic = "force-dynamic";

/** Sample offer letter from the current template, with example details and both signatures. */
export async function GET() {
  await requireHr();
  const [tpl, signer] = await Promise.all([offerTemplate(), companySigner()]);
  const sample = {
    offer_date: todayCT(), job_title: "Senior Java Developer", start_date: todayCT(), employment_type: "Full-time W-2", pay_type: "hourly", pay_amount: 55,
    pay_schedule: "Monthly, on the 20th of each month for the previous month", work_location: "Remote (Dallas, TX)", client_name: "Example Client Inc.",
    job_description: "Design, build and maintain enterprise Java applications for our client.",
    job_duties: "- Build and maintain Java / Spring Boot microservices\n- Write unit and integration tests\n- Participate in code reviews and agile ceremonies",
    extra_terms: "",
  } as unknown as Offer;
  const body = fillTemplate(tpl, sample, { first_name: "Alex", last_name: "Sample", address: "123 Main St, Dallas, TX 75201" });
  const now = new Date().toISOString();
  const pdf = await buildOfferPdf(body, { name: "Alex Sample", signedAt: now }, { name: signer.name || "Your Name", title: signer.title, signedAt: now, image: await companySignatureImage(signer.imagePath) });
  return new Response(Buffer.from(pdf), { headers: { "content-type": "application/pdf", "content-disposition": 'inline; filename="sample-offer-letter.pdf"', "cache-control": "no-store" } });
}
