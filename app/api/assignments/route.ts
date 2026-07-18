import { audit, db, errorResponse, isOversight, requireHubActor, safeText } from "@/lib/hub";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const actor = await requireHubActor(request);
    const result = isOversight(actor)
      ? await db().prepare("SELECT * FROM hub_assignments ORDER BY created_at DESC LIMIT 100").all()
      : await db().prepare("SELECT * FROM hub_assignments WHERE assigned_to_email = ? ORDER BY created_at DESC LIMIT 60").bind(actor.email).all();
    return Response.json({ assignments: result.results || [] });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const actor = await requireHubActor(request);
    if (!isOversight(actor)) return Response.json({ error: "Only Irene or an authorised board role may assign work." }, { status: 403 });
    const body = await request.json() as Record<string, unknown>;
    const assignedTo = safeText(body.assignedToEmail, 180).toLowerCase();
    const title = safeText(body.title, 120);
    const instructions = safeText(body.instructions, 1000);
    if (!assignedTo || !title || !instructions) return Response.json({ error: "Staff member, title and instructions are required." }, { status: 400 });
    const target = await db().prepare("SELECT email FROM hub_users WHERE email = ? AND status IN ('active','invited')").bind(assignedTo).first();
    if (!target && !actor.demo) return Response.json({ error: "That staff member is not currently authorised." }, { status: 400 });
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await db().prepare(`INSERT INTO hub_assignments
      (id,assigned_by_email,assigned_by_name,assigned_to_email,title,instructions,category,priority,due_at,status,response,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(id, actor.email, actor.displayName, assignedTo, title, instructions,
        safeText(body.category, 40) || "operational", safeText(body.priority, 20) || "normal",
        safeText(body.dueAt, 50) || null, "assigned", null, now, now).run();
    await audit(actor, "assignment_created", "assignment", id, title);
    return Response.json({ ok: true, id, createdAt: now });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request) {
  try {
    const actor = await requireHubActor(request);
    const body = await request.json() as Record<string, unknown>;
    const id = safeText(body.id, 80);
    const item = await db().prepare("SELECT * FROM hub_assignments WHERE id = ?").bind(id).first<Record<string, string>>();
    if (!item) return Response.json({ error: "Assignment not found." }, { status: 404 });
    if (!isOversight(actor) && item.assigned_to_email !== actor.email) return Response.json({ error: "This assignment belongs to another staff member." }, { status: 403 });
    const allowed = ["accepted", "declined", "in_progress", "completed", "needs_help"];
    const status = safeText(body.status, 30);
    if (!allowed.includes(status)) return Response.json({ error: "Choose a valid response." }, { status: 400 });
    const response = safeText(body.response, 700) || null;
    const now = new Date().toISOString();
    await db().prepare("UPDATE hub_assignments SET status = ?, response = ?, updated_at = ? WHERE id = ?").bind(status, response, now, id).run();
    await audit(actor, "assignment_updated", "assignment", id, `${item.title}: ${status}`);
    return Response.json({ ok: true, updatedAt: now });
  } catch (error) { return errorResponse(error); }
}
