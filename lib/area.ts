/** Which part of the site a path belongs to: the public website, the employee portal, or the admin (HR) portal. */
export type Area = "public" | "employee" | "admin";

export function areaFor(pathname: string | null): Area {
  const p = pathname ?? "/";
  if (p.startsWith("/hr") && !p.startsWith("/hr/login")) return "admin";
  if (p.startsWith("/portal") && !p.startsWith("/portal/login") && !p.startsWith("/portal/forgot")) return "employee";
  return "public";
}
