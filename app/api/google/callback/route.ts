import { cookies } from "next/headers";
import { audit, requireHr, siteOrigin } from "@/lib/i9/server";
import { createRootFolder, saveOAuthConn } from "@/lib/gdrive";
import { checkState, googleRedirectUri } from "@/lib/google-oauth";

export const dynamic = "force-dynamic";

const back = (msg: string) => Response.redirect(`${siteOrigin()}/hr/onboarding?drive=${encodeURIComponent(msg)}`, 302);

/** Google sends HR back here after signing in: store the (encrypted) refresh token and create the root folder. */
export async function GET(req: Request) {
  const hr = await requireHr();
  const url = new URL(req.url);
  const state = url.searchParams.get("state");
  const jar = await cookies();
  const saved = jar.get("gdrive_state")?.value;
  jar.delete({ name: "gdrive_state", path: "/api/google" });
  if (url.searchParams.get("error")) return back("cancelled");
  if (!checkState(state) || state !== saved) return back("expired");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: url.searchParams.get("code") ?? "", client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!, client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
      redirect_uri: googleRedirectUri(), grant_type: "authorization_code",
    }),
  });
  if (!res.ok) { console.error("Google token exchange failed", res.status, await res.text()); return back("failed"); }
  const j = (await res.json()) as { access_token: string; refresh_token?: string; id_token?: string; scope?: string };
  if (!j.refresh_token) return back("norefresh");
  if (!j.scope?.includes("drive.file")) return back("noscope");
  let email = "";
  try { email = JSON.parse(Buffer.from((j.id_token ?? "").split(".")[1] ?? "", "base64url").toString()).email ?? ""; } catch { /* ignore */ }
  const rootId = await createRootFolder(j.access_token);
  if (!rootId) return back("failed");
  await saveOAuthConn({ refreshToken: j.refresh_token, email, rootId }, hr);
  await audit(null, `hr:${hr}`, "google_drive_connected", { email });
  return back("connected");
}
