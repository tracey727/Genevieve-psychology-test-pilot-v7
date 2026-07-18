import { audit, db, errorResponse, isOversight, requireHubActor, rolePermissions, safeText, type HubRole } from "@/lib/hub";

export const dynamic = "force-dynamic";
const ROLES: HubRole[] = ["board","clinical_lead","psychologist","provisional","reception","practice_manager","auditor"];

export async function GET(request: Request) {
  try {
    const actor = await requireHubActor(request);
    if (!isOversight(actor)) return Response.json({ staff: [{ email: actor.email, display_name: actor.displayName, role: actor.role, status: "active" }] });
    const result = await db().prepare("SELECT id,email,display_name,role,status,permissions,created_at,last_seen_at FROM hub_users ORDER BY display_name").all();
    return Response.json({ staff: result.results || [] });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const actor = await requireHubActor(request);
    if (actor.role !== "director") return Response.json({ error: "Only Irene may authorise a new account." }, { status: 403 });
    const body = await request.json() as Record<string, unknown>;
    const email = safeText(body.email, 180).toLowerCase();
    const displayName = safeText(body.displayName, 100);
    const role = safeText(body.role, 30) as HubRole;
    if (!email.includes("@") || !displayName || !ROLES.includes(role)) return Response.json({ error: "Enter a valid name, sign-in email and role." }, { status: 400 });
    const now = new Date().toISOString();
    await db().prepare(`INSERT INTO hub_users
      (id,email,display_name,role,status,permissions,created_at,created_by,last_seen_at)
      VALUES (?,?,?,?,?,?,?,?,?)
      ON CONFLICT(email) DO UPDATE SET display_name=excluded.display_name, role=excluded.role,
      status='invited', permissions=excluded.permissions`)
      .bind(crypto.randomUUID(), email, displayName, role, "invited", JSON.stringify(rolePermissions(role)), now, actor.email, null).run();
    await audit(actor, "staff_authorised", "user", email, `${displayName} authorised as ${role}`);
    return Response.json({ ok: true, email, role });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request) {
  try {
    const actor = await requireHubActor(request);
    if (actor.role !== "director") return Response.json({ error: "Only Irene may change staff access." }, { status: 403 });
    const body = await request.json() as Record<string, unknown>;
    const email = safeText(body.email, 180).toLowerCase();
    const status = safeText(body.status, 20);
    if (!email || !["active","paused","revoked"].includes(status)) return Response.json({ error: "Choose a valid staff account and status." }, { status: 400 });
    await db().prepare("UPDATE hub_users SET status = ? WHERE email = ? AND role <> 'director'").bind(status, email).run();
    await audit(actor, "staff_access_changed", "user", email, `Access changed to ${status}`);
    return Response.json({ ok: true });
  } catch (error) { return errorResponse(error); }
}
