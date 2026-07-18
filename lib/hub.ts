import { env } from "cloudflare:workers";

export type HubRole =
  | "director"
  | "board"
  | "clinical_lead"
  | "psychologist"
  | "provisional"
  | "reception"
  | "practice_manager"
  | "auditor";

export type HubActor = {
  email: string;
  displayName: string;
  role: HubRole;
  permissions: Record<string, boolean>;
  demo: boolean;
};

const DEMO_USERS: Record<string, HubActor> = {
  director: { email: "irene@fictional.demo", displayName: "Irene", role: "director", permissions: { all: true }, demo: true },
  psychologist: { email: "avery@fictional.demo", displayName: "Dr Avery", role: "psychologist", permissions: { messages: true, tasks: true, support: true }, demo: true },
  provisional: { email: "sam@fictional.demo", displayName: "Sam", role: "provisional", permissions: { messages: true, tasks: true, support: true }, demo: true },
  reception: { email: "mia@fictional.demo", displayName: "Mia", role: "reception", permissions: { messages: true, tasks: true, support: true }, demo: true },
};

const DEFAULT_PERMISSIONS: Record<HubRole, Record<string, boolean>> = {
  director: { all: true, manageStaff: true, viewAllMessages: true, assignWork: true, governance: true },
  board: { viewAllMessages: true, assignWork: true, governance: true, audit: true },
  clinical_lead: { messages: true, tasks: true, support: true, clinicalOversight: true },
  psychologist: { messages: true, tasks: true, support: true, continuity: true },
  provisional: { messages: true, tasks: true, support: true, supervision: true },
  reception: { messages: true, tasks: true, support: true, receptionOnly: true },
  practice_manager: { messages: true, tasks: true, support: true, operations: true },
  auditor: { audit: true, readOnly: true },
};

export function db(): D1Database {
  if (!env.DB) throw new Error("D1 binding DB is unavailable");
  return env.DB;
}

export async function ensureHubSchema() {
  const d1 = db();
  await d1.batch([
    d1.prepare(`CREATE TABLE IF NOT EXISTS hub_users (
      id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL,
      role TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', permissions TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL, created_by TEXT, last_seen_at TEXT
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS hub_messages (
      id TEXT PRIMARY KEY, thread_id TEXT NOT NULL, sender_email TEXT NOT NULL,
      sender_name TEXT NOT NULL, sender_role TEXT NOT NULL, recipient_email TEXT,
      recipient_role TEXT, subject TEXT NOT NULL, body TEXT NOT NULL, category TEXT NOT NULL,
      priority TEXT NOT NULL, created_at TEXT NOT NULL, read_at TEXT, acknowledged_at TEXT, reply_to TEXT
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS hub_assignments (
      id TEXT PRIMARY KEY, assigned_by_email TEXT NOT NULL, assigned_by_name TEXT NOT NULL,
      assigned_to_email TEXT NOT NULL, title TEXT NOT NULL, instructions TEXT NOT NULL,
      category TEXT NOT NULL, priority TEXT NOT NULL, due_at TEXT, status TEXT NOT NULL,
      response TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS hub_audit_events (
      id TEXT PRIMARY KEY, actor_email TEXT NOT NULL, actor_role TEXT NOT NULL,
      action TEXT NOT NULL, target_type TEXT NOT NULL, target_id TEXT, detail TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS staff_work_profiles (
      email TEXT PRIMARY KEY, max_daily_hours TEXT NOT NULL DEFAULT '8',
      max_daily_sessions TEXT NOT NULL DEFAULT '6', max_high_support_sessions TEXT NOT NULL DEFAULT '2',
      lunch_after_minutes TEXT NOT NULL DEFAULT '240', transition_buffer_minutes TEXT NOT NULL DEFAULT '20',
      age_pattern TEXT NOT NULL DEFAULT 'mixed_with_buffers', child_days TEXT NOT NULL DEFAULT '[]',
      adult_days TEXT NOT NULL DEFAULT '[]', preferences_confirmed_at TEXT, approved_by_email TEXT,
      updated_at TEXT NOT NULL
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS schedule_blocks (
      id TEXT PRIMARY KEY, staff_email TEXT NOT NULL, starts_at TEXT NOT NULL,
      duration_minutes TEXT NOT NULL, client_code TEXT NOT NULL, age_band TEXT NOT NULL,
      support_intensity TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'scheduled', created_at TEXT NOT NULL
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS safety_alerts (
      id TEXT PRIMARY KEY, staff_email TEXT NOT NULL, alert_type TEXT NOT NULL,
      severity TEXT NOT NULL, status TEXT NOT NULL, detail TEXT NOT NULL, action_taken TEXT,
      created_at TEXT NOT NULL, escalated_at TEXT, acknowledged_at TEXT, acknowledged_by TEXT,
      actioned_at TEXT, actioned_by TEXT, supervisor_signoff_at TEXT, supervisor_signoff_by TEXT,
      closed_at TEXT, closed_by TEXT
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS shift_checkins (
      id TEXT PRIMARY KEY, staff_email TEXT NOT NULL, shift_started_at TEXT NOT NULL,
      shift_ended_at TEXT, lunch_due_at TEXT NOT NULL, lunch_started_at TEXT, lunch_finished_at TEXT,
      break_state TEXT NOT NULL, workload_check TEXT, support_requested TEXT NOT NULL DEFAULT '0',
      updated_at TEXT NOT NULL
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS reception_queue (
      id TEXT PRIMARY KEY, assigned_to_email TEXT, client_code TEXT NOT NULL, item_type TEXT NOT NULL,
      detail TEXT NOT NULL, priority TEXT NOT NULL, due_at TEXT, status TEXT NOT NULL,
      escalated_to_email TEXT, outcome TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS practice_memory (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL, memory_type TEXT NOT NULL,
      scope TEXT NOT NULL, owner_email TEXT NOT NULL, owner_role TEXT NOT NULL, status TEXT NOT NULL,
      status_before_delete TEXT, source TEXT NOT NULL, tags TEXT NOT NULL DEFAULT '',
      version TEXT NOT NULL DEFAULT '1', use_count TEXT NOT NULL DEFAULT '0',
      helpful_count TEXT NOT NULL DEFAULT '0', review_count TEXT NOT NULL DEFAULT '0',
      last_used_at TEXT, approved_at TEXT, approved_by TEXT, created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL, deleted_at TEXT, deleted_by TEXT, delete_reason TEXT
    )`),
    d1.prepare("CREATE INDEX IF NOT EXISTS hub_messages_recipient_idx ON hub_messages(recipient_email, recipient_role, created_at)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS hub_assignments_staff_idx ON hub_assignments(assigned_to_email, status, due_at)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS safety_alerts_staff_idx ON safety_alerts(staff_email, status, severity)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS schedule_blocks_staff_idx ON schedule_blocks(staff_email, starts_at)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS reception_queue_status_idx ON reception_queue(status, priority, due_at)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS practice_memory_scope_idx ON practice_memory(scope, status, deleted_at, updated_at)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS practice_memory_owner_idx ON practice_memory(owner_email, deleted_at, updated_at)"),
  ]);
}

function isDemoHost(request: Request) {
  const host = new URL(request.url).hostname;
  return host === "terminal.local" || host === "localhost" || host === "127.0.0.1";
}

function decodeName(value: string | null, encoding: string | null) {
  if (!value || encoding !== "percent-encoded-utf-8") return null;
  try { return decodeURIComponent(value); } catch { return null; }
}

export async function requireHubActor(request: Request): Promise<HubActor> {
  await ensureHubSchema();

  if (isDemoHost(request)) {
    const demoKey = request.headers.get("x-genevieve-demo-user") || "director";
    if (DEMO_USERS[demoKey]) return DEMO_USERS[demoKey];
  }

  const email = request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase();
  if (!email) throw new HubError(401, "Sign in with ChatGPT to continue.");

  const fullName = decodeName(
    request.headers.get("oai-authenticated-user-full-name"),
    request.headers.get("oai-authenticated-user-full-name-encoding"),
  );
  const d1 = db();
  const existing = await d1.prepare("SELECT * FROM hub_users WHERE email = ? LIMIT 1").bind(email).first<Record<string, string>>();
  if (existing) {
    if (existing.status !== "active" && existing.status !== "invited") throw new HubError(403, "This staff access has been paused by Irene.");
    await d1.prepare("UPDATE hub_users SET status = 'active', last_seen_at = ? WHERE email = ?").bind(new Date().toISOString(), email).run();
    const actor: HubActor = {
      email,
      displayName: existing.display_name || fullName || email,
      role: existing.role as HubRole,
      permissions: { ...DEFAULT_PERMISSIONS[existing.role as HubRole], ...safeJson(existing.permissions) },
      demo: false,
    };
    const demoKey = request.headers.get("x-genevieve-demo-user") || "";
    if (actor.role === "director" && demoKey && DEMO_USERS[demoKey]) return DEMO_USERS[demoKey];
    return actor;
  }

  const directors = await d1.prepare("SELECT COUNT(*) AS count FROM hub_users WHERE role = 'director' AND status = 'active'").first<{ count: number }>();
  if (Number(directors?.count || 0) === 0) {
    const now = new Date().toISOString();
    await d1.prepare(`INSERT INTO hub_users
      (id,email,display_name,role,status,permissions,created_at,created_by,last_seen_at)
      VALUES (?,?,?,?,?,?,?,?,?)`)
      .bind(crypto.randomUUID(), email, fullName || "Irene", "director", "active", JSON.stringify(DEFAULT_PERMISSIONS.director), now, email, now).run();
    const actor: HubActor = { email, displayName: fullName || "Irene", role: "director", permissions: DEFAULT_PERMISSIONS.director, demo: false };
    const demoKey = request.headers.get("x-genevieve-demo-user") || "";
    return demoKey && DEMO_USERS[demoKey] ? DEMO_USERS[demoKey] : actor;
  }
  throw new HubError(403, "Irene has not yet authorised this account.");
}

export function isOversight(actor: HubActor) {
  return actor.role === "director" || actor.role === "board";
}

export function canCloseSafety(actor: HubActor) {
  return isOversight(actor) || actor.role === "clinical_lead" || actor.permissions.safetySignoff === true;
}

export async function audit(actor: HubActor, action: string, targetType: string, targetId: string | null, detail: string) {
  await db().prepare(`INSERT INTO hub_audit_events
    (id,actor_email,actor_role,action,target_type,target_id,detail,created_at)
    VALUES (?,?,?,?,?,?,?,?)`)
    .bind(crypto.randomUUID(), actor.email, actor.role, action, targetType, targetId, detail.slice(0, 500), new Date().toISOString()).run();
}

export class HubError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function errorResponse(error: unknown) {
  if (error instanceof HubError) return Response.json({ error: error.message }, { status: error.status });
  console.error(error);
  return Response.json({ error: "The secure connection could not be completed." }, { status: 500 });
}

export function safeText(value: unknown, max = 1000) {
  return String(value ?? "").trim().slice(0, max);
}

export function rolePermissions(role: HubRole) { return DEFAULT_PERMISSIONS[role] || {}; }

function safeJson(value: string) {
  try { return JSON.parse(value || "{}"); } catch { return {}; }
}
