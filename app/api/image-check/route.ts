import { photos, services, industries } from "@/lib/content";

export const dynamic = "force-dynamic";

export async function GET() {
  const urls: Record<string, string> = { ...photos };
  services.forEach((s) => (urls[s.slug] = s.image));
  industries.forEach((i) => (urls[i.slug] = i.image));
  const results = await Promise.all(
    Object.entries(urls).map(async ([k, u]) => {
      try {
        const r = await fetch(u, { method: "HEAD" });
        return [k, r.status, r.headers.get("content-type")];
      } catch (e) {
        return [k, "ERR", String(e)];
      }
    }),
  );
  return Response.json(results);
}
