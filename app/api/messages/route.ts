import { audit, db, errorResponse, isOversight, requireHubActor, safeText } from "@/lib/hub";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const actor = await requireHubActor(request);
    const d1 = db();
    const result = isOversight(actor)
      ? await d1.prepare("SELECT * FROM hub_messages ORDER BY created_at DESC LIMIT 100").all()
      : await d1.prepare(`SELECT * FROM hub_messages
          WHERE sender_email = ? OR recipient_email = ? OR recipient_role = ? OR recipient_role = 'all_staff'
          ORDER BY created_at DESC LIMIT 60`)
          .bind(actor.email, actor.email, actor.role).all();
    return Response.json({ messages: result.results || [] });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const actor = await requireHubActor(request);
    if (actor.permissions.readOnly) return Response.json({ error: "This role is read-only." }, { status: 403 });
    const body = await request.json() as Record<string, unknown>;
    const subject = safeText(body.subject, 120);
    const message = safeText(body.body, 1200);
    if (!subject || !message) return Response.json({ error: "Subject and message are required." }, { status: 400 });

    const oversight = isOversight(actor);
    const recipientEmail = oversight ? safeText(body.recipientEmail, 180).toLowerCase() || null : null;
    const recipientRole = oversight ? safeText(body.recipientRole, 40) || null : "director";
    if (oversight && !recipientEmail && !recipientRole) return Response.json({ error: "Choose a staff member or role." }, { status: 400 });

    const id = crypto.randomUUID();
    const threadId = safeText(body.threadId, 80) || id;
    const now = new Date().toISOString();
    await db().prepare(`INSERT INTO hub_messages
      (id,thread_id,sender_email,sender_name,sender_role,recipient_email,recipient_role,subject,body,category,priority,created_at,read_at,acknowledged_at,reply_to)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(id, threadId, actor.email, actor.displayName, actor.role, recipientEmail, recipientRole,
        subject, message, safeText(body.category, 40) || "operational", safeText(body.priority, 20) || "normal",
        now, null, null, safeText(body.replyTo, 80) || null).run();
    await audit(actor, "message_sent", "message", id, `Operational message: ${subject}`);
    return Response.json({ ok: true, id, threadId, createdAt: now });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request) {
  try {
    const actor = await requireHubActor(request);
    const body = await request.json() as Record<string, unknown>;
    const id = safeText(body.id, 80);
    const item = await db().prepare("SELECT * FROM hub_messages WHERE id = ?").bind(id).first<Record<string, string>>();
    if (!item) return Response.json({ error: "Message not found." }, { status: 404 });
    const allowed = isOversight(actor) || item.recipient_email === actor.email || item.recipient_role === actor.role || item.recipient_role === "all_staff";
    if (!allowed) return Response.json({ error: "This message is outside your authorised view." }, { status: 403 });
    const now = new Date().toISOString();
    const action = safeText(body.action, 30);
    if (action === "acknowledge") await db().prepare("UPDATE hub_messages SET acknowledged_at = COALESCE(acknowledged_at, ?), read_at = COALESCE(read_at, ?) WHERE id = ?").bind(now, now, id).run();
    else await db().prepare("UPDATE hub_messages SET read_at = COALESCE(read_at, ?) WHERE id = ?").bind(now, id).run();
    await audit(actor, action === "acknowledge" ? "message_acknowledged" : "message_read", "message", id, item.subject);
    return Response.json({ ok: true, at: now });
  } catch (error) { return errorResponse(error); }
}
