import { photos, services, industries } from "@/lib/content";

export const dynamic = "force-dynamic";

export async function GET() {
  const urls: Record<string, string> = { ...photos };
  services.forEach((s) => (urls[s.slug] = s.image));
  industries.forEach((i) => (urls[i.slug] = i.image));
  const out: Record<string, string> = {};
  await Promise.all(
    Object.entries(urls).map(async ([k, u]) => {
      const r = await fetch(u.replace("w=1800", "w=220").replace("q=80", "q=40"));
      out[k] = Buffer.from(await r.arrayBuffer()).toString("base64");
    }),
  );
  return Response.json(out);
}
