import { audit, canCloseSafety, db, errorResponse, isOversight, requireHubActor, safeText, type HubActor } from "@/lib/hub";

export const dynamic = "force-dynamic";

type Row = Record<string, string | null>;

export async function GET(request: Request) {
  try {
    const actor = await requireHubActor(request);
    if (actor.demo) await seedDemoSafety();
    await evaluateSafety(actor);
    const d1 = db();
    const oversight = isOversight(actor) || actor.role === "clinical_lead";
    const alerts = oversight
      ? await d1.prepare("SELECT * FROM safety_alerts WHERE status <> 'closed' ORDER BY CASE severity WHEN 'red' THEN 0 WHEN 'amber' THEN 1 ELSE 2 END, created_at DESC LIMIT 100").all()
      : await d1.prepare("SELECT * FROM safety_alerts WHERE staff_email = ? AND status <> 'closed' ORDER BY created_at DESC LIMIT 50").bind(actor.email).all();
    const shifts = oversight
      ? await d1.prepare("SELECT * FROM shift_checkins WHERE shift_ended_at IS NULL ORDER BY shift_started_at").all()
      : await d1.prepare("SELECT * FROM shift_checkins WHERE staff_email = ? AND shift_ended_at IS NULL ORDER BY shift_started_at DESC LIMIT 1").bind(actor.email).all();
    const schedules = oversight
      ? await d1.prepare("SELECT * FROM schedule_blocks WHERE date(starts_at) = date('now') ORDER BY starts_at").all()
      : await d1.prepare("SELECT * FROM schedule_blocks WHERE staff_email = ? AND date(starts_at) = date('now') ORDER BY starts_at").bind(actor.email).all();
    const profiles = oversight
      ? await d1.prepare("SELECT * FROM staff_work_profiles ORDER BY email").all()
      : await d1.prepare("SELECT * FROM staff_work_profiles WHERE email = ? LIMIT 1").bind(actor.email).all();
    return Response.json({ alerts: alerts.results || [], shifts: shifts.results || [], schedules: schedules.results || [], profiles: profiles.results || [], canClose: canCloseSafety(actor) });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const actor = await requireHubActor(request);
    const body = await request.json() as Record<string, unknown>;
    const action = safeText(body.action, 40);
    const d1 = db();
    const now = new Date();

    if (action === "start_shift") {
      const active = await d1.prepare("SELECT id FROM shift_checkins WHERE staff_email = ? AND shift_ended_at IS NULL LIMIT 1").bind(actor.email).first();
      if (active) return Response.json({ error: "A shift is already active." }, { status: 400 });
      const profile = await workProfile(actor.email);
      const lunchDue = new Date(now.getTime() + Number(profile.lunch_after_minutes || 240) * 60000).toISOString();
      const id = crypto.randomUUID();
      await d1.prepare(`INSERT INTO shift_checkins
        (id,staff_email,shift_started_at,shift_ended_at,lunch_due_at,lunch_started_at,lunch_finished_at,break_state,workload_check,support_requested,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(id, actor.email, now.toISOString(), null, lunchDue, null, null, "working", "steady", "0", now.toISOString()).run();
      await audit(actor, "shift_started", "shift", id, "Staff shift and lunch timer started");
      return Response.json({ ok: true, id, lunchDueAt: lunchDue });
    }

    const shift = await activeShift(actor.email);
    if (["start_lunch","finish_lunch","end_shift","check_in"].includes(action) && !shift) return Response.json({ error: "Start the shift first." }, { status: 400 });

    if (action === "start_lunch") {
      await d1.prepare("UPDATE shift_checkins SET lunch_started_at = ?, break_state = 'lunch', updated_at = ? WHERE id = ?").bind(now.toISOString(), now.toISOString(), shift!.id).run();
      await actionOpenAlert(actor, "Lunch break started; coverage and timing recorded.");
    } else if (action === "finish_lunch") {
      await d1.prepare("UPDATE shift_checkins SET lunch_finished_at = ?, break_state = 'working', updated_at = ? WHERE id = ?").bind(now.toISOString(), now.toISOString(), shift!.id).run();
      await actionOpenAlert(actor, "Lunch break completed and work resumed.");
    } else if (action === "end_shift") {
      await d1.prepare("UPDATE shift_checkins SET shift_ended_at = ?, break_state = 'ended', updated_at = ? WHERE id = ?").bind(now.toISOString(), now.toISOString(), shift!.id).run();
    } else if (action === "check_in") {
      const check = safeText(body.workloadCheck, 20);
      if (!["steady","stretching","high"].includes(check)) return Response.json({ error: "Choose a valid workload check-in." }, { status: 400 });
      const support = body.supportRequested === true ? "1" : "0";
      await d1.prepare("UPDATE shift_checkins SET workload_check = ?, support_requested = ?, updated_at = ? WHERE id = ?").bind(check, support, now.toISOString(), shift!.id).run();
      if (check === "high" || support === "1") await upsertAlert(actor.email, "staff_support", "red", "Staff requested human support or reported a high workload state.");
    } else if (action === "save_preferences") {
      const agePattern = safeText(body.agePattern, 40);
      if (!["mixed_with_buffers","children_days","adult_days","custom"].includes(agePattern)) return Response.json({ error: "Choose a valid age-mix preference." }, { status: 400 });
      const buffer = Math.min(60, Math.max(10, Number(body.transitionBufferMinutes || 20)));
      const childDays = JSON.stringify(Array.isArray(body.childDays) ? body.childDays.slice(0, 7) : []);
      const adultDays = JSON.stringify(Array.isArray(body.adultDays) ? body.adultDays.slice(0, 7) : []);
      await d1.prepare(`INSERT INTO staff_work_profiles
        (email,max_daily_hours,max_daily_sessions,max_high_support_sessions,lunch_after_minutes,transition_buffer_minutes,age_pattern,child_days,adult_days,preferences_confirmed_at,approved_by_email,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(email) DO UPDATE SET transition_buffer_minutes=excluded.transition_buffer_minutes,
          age_pattern=excluded.age_pattern, child_days=excluded.child_days, adult_days=excluded.adult_days,
          preferences_confirmed_at=NULL, approved_by_email=NULL, updated_at=excluded.updated_at`)
        .bind(actor.email,"8","6","2","240",String(buffer),agePattern,childDays,adultDays,null,null,now.toISOString()).run();
      await upsertAlert(actor.email, "profile_review", "amber", "Worker scheduling preferences require supervisor review and confirmation.");
    } else if (action === "approve_profile") {
      if (!canCloseSafety(actor)) return Response.json({ error: "Supervisor or authorised safety sign-off is required." }, { status: 403 });
      const staffEmail = safeText(body.staffEmail, 180).toLowerCase();
      await d1.prepare("UPDATE staff_work_profiles SET preferences_confirmed_at = ?, approved_by_email = ?, updated_at = ? WHERE email = ?").bind(now.toISOString(), actor.email, now.toISOString(), staffEmail).run();
    } else if (action === "set_limits") {
      if (!canCloseSafety(actor)) return Response.json({ error: "Only a supervisor or authorised person may set workload limits." }, { status: 403 });
      const staffEmail = safeText(body.staffEmail, 180).toLowerCase();
      const values = [body.maxDailyHours, body.maxDailySessions, body.maxHighSupportSessions, body.lunchAfterMinutes].map(Number);
      if (values.some(value => !Number.isFinite(value) || value < 1)) return Response.json({ error: "Enter valid workload limits." }, { status: 400 });
      await d1.prepare(`INSERT INTO staff_work_profiles
        (email,max_daily_hours,max_daily_sessions,max_high_support_sessions,lunch_after_minutes,transition_buffer_minutes,age_pattern,child_days,adult_days,preferences_confirmed_at,approved_by_email,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(email) DO UPDATE SET max_daily_hours=excluded.max_daily_hours,
          max_daily_sessions=excluded.max_daily_sessions,max_high_support_sessions=excluded.max_high_support_sessions,
          lunch_after_minutes=excluded.lunch_after_minutes,approved_by_email=excluded.approved_by_email,
          preferences_confirmed_at=excluded.preferences_confirmed_at,updated_at=excluded.updated_at`)
        .bind(staffEmail,String(values[0]),String(values[1]),String(values[2]),String(values[3]),"20","mixed_with_buffers","[]","[]",now.toISOString(),actor.email,now.toISOString()).run();
    } else if (action === "add_schedule") {
      if (!["director","board","practice_manager","reception"].includes(actor.role)) return Response.json({ error: "This role cannot add schedule records." }, { status: 403 });
      const staffEmail = safeText(body.staffEmail, 180).toLowerCase();
      const clientCode = safeText(body.clientCode, 12).replace(/[^A-Za-z0-9.-]/g, "");
      const ageBand = safeText(body.ageBand, 20);
      const intensity = safeText(body.supportIntensity, 20);
      const startsAt = safeText(body.startsAt, 50);
      if (!staffEmail || !clientCode || !["child","adolescent","adult","family"].includes(ageBand) || !["routine","high"].includes(intensity) || !startsAt) return Response.json({ error: "Complete the coded schedule fields." }, { status: 400 });
      await d1.prepare("INSERT INTO schedule_blocks (id,staff_email,starts_at,duration_minutes,client_code,age_band,support_intensity,status,created_at) VALUES (?,?,?,?,?,?,?,?,?)")
        .bind(crypto.randomUUID(),staffEmail,startsAt,String(Math.min(180,Math.max(15,Number(body.durationMinutes||50)))),clientCode,ageBand,intensity,"scheduled",now.toISOString()).run();
    } else return Response.json({ error: "Unsupported safety action." }, { status: 400 });

    await audit(actor, `safety_${action}`, "safety", shift?.id || actor.email, "Operational staff-safety action recorded");
    await evaluateSafety(actor);
    return Response.json({ ok: true, at: now.toISOString() });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request) {
  try {
    const actor = await requireHubActor(request);
    const body = await request.json() as Record<string, unknown>;
    const id = safeText(body.id, 80);
    const action = safeText(body.action, 30);
    const alert = await db().prepare("SELECT * FROM safety_alerts WHERE id = ?").bind(id).first<Row>();
    if (!alert) return Response.json({ error: "Safety alert not found." }, { status: 404 });
    const own = alert.staff_email === actor.email;
    const now = new Date().toISOString();
    if (action === "acknowledge" && (own || canCloseSafety(actor))) {
      await db().prepare("UPDATE safety_alerts SET acknowledged_at = ?, acknowledged_by = ?, status = CASE WHEN status='active' THEN 'acknowledged' ELSE status END WHERE id = ?").bind(now,actor.email,id).run();
    } else if (action === "record_action" && (own || canCloseSafety(actor))) {
      const detail = safeText(body.actionTaken, 500);
      if (!detail) return Response.json({ error: "Record the action that was actually taken." }, { status: 400 });
      await db().prepare("UPDATE safety_alerts SET action_taken = ?, actioned_at = ?, actioned_by = ?, status = 'actioned' WHERE id = ?").bind(detail,now,actor.email,id).run();
    } else if (action === "signoff_close") {
      if (!canCloseSafety(actor)) return Response.json({ error: "Only a supervisor or authorised safety person may deactivate this alert." }, { status: 403 });
      if (!alert.action_taken || !alert.actioned_at) return Response.json({ error: "The alert cannot close until the completed action is recorded." }, { status: 400 });
      await db().prepare("UPDATE safety_alerts SET supervisor_signoff_at = ?, supervisor_signoff_by = ?, closed_at = ?, closed_by = ?, status = 'closed' WHERE id = ?").bind(now,actor.email,now,actor.email,id).run();
    } else return Response.json({ error: "This account cannot perform that alert action." }, { status: 403 });
    await audit(actor, `alert_${action}`, "safety_alert", id, alert.detail || "Safety alert updated");
    return Response.json({ ok: true, at: now });
  } catch (error) { return errorResponse(error); }
}

async function evaluateSafety(actor: HubActor) {
  const d1 = db();
  const oversight = isOversight(actor) || actor.role === "clinical_lead";
  const shifts = oversight
    ? await d1.prepare("SELECT * FROM shift_checkins WHERE shift_ended_at IS NULL").all<Row>()
    : await d1.prepare("SELECT * FROM shift_checkins WHERE staff_email = ? AND shift_ended_at IS NULL").bind(actor.email).all<Row>();
  const now = Date.now();
  for (const shift of shifts.results || []) {
    const profile = await workProfile(shift.staff_email!);
    const lunchDue = new Date(shift.lunch_due_at!).getTime();
    if (!shift.lunch_started_at && now >= lunchDue - 3600000) {
      const overdue = now - lunchDue;
      const severity = overdue >= 900000 ? "red" : "amber";
      const detail = overdue >= 900000 ? "Lunch break is overdue by more than 15 minutes and has escalated to Irene/supervisor." : overdue >= 0 ? "Lunch break is due now and requires protected coverage." : "Lunch break is due within one hour; confirm coverage and timing.";
      await upsertAlert(shift.staff_email!, "lunch_break", severity, detail, overdue >= 900000);
    }
    const hours = (now - new Date(shift.shift_started_at!).getTime()) / 3600000;
    if (hours > Number(profile.max_daily_hours || 8)) await upsertAlert(shift.staff_email!, "hours_limit", "red", `Active hours exceed the approved ${profile.max_daily_hours}-hour limit; supervisor review and workload action required.`, true);
    if (shift.workload_check === "high" || shift.support_requested === "1") await upsertAlert(shift.staff_email!, "staff_support", "red", "Staff workload check-in requires prompt human support and documented action.", true);
  }

  const staffEmails = oversight
    ? (await d1.prepare("SELECT DISTINCT staff_email FROM schedule_blocks WHERE date(starts_at)=date('now')").all<{staff_email:string}>()).results?.map(x=>x.staff_email) || []
    : [actor.email];
  for (const email of staffEmails) {
    const schedule = (await d1.prepare("SELECT * FROM schedule_blocks WHERE staff_email = ? AND date(starts_at)=date('now') ORDER BY starts_at").bind(email).all<Row>()).results || [];
    const profile = await workProfile(email);
    if (schedule.length > Number(profile.max_daily_sessions || 6)) await upsertAlert(email,"session_load","red",`Scheduled sessions exceed the approved daily limit of ${profile.max_daily_sessions}.`,true);
    const high = schedule.filter(item=>item.support_intensity==="high").length;
    if (high > Number(profile.max_high_support_sessions || 2)) await upsertAlert(email,"high_support_load","red",`High-support sessions exceed the approved daily limit of ${profile.max_high_support_sessions}; rebalance or add recovery time.`,true);
    for (let index=1;index<schedule.length;index++) {
      const previous=schedule[index-1], current=schedule[index];
      const previousGroup=["child","adolescent"].includes(previous.age_band||"")?"young":"adult";
      const currentGroup=["child","adolescent"].includes(current.age_band||"")?"young":"adult";
      const previousEnd=new Date(previous.starts_at!).getTime()+Number(previous.duration_minutes||50)*60000;
      const gap=(new Date(current.starts_at!).getTime()-previousEnd)/60000;
      if(previousGroup!==currentGroup&&gap<Number(profile.transition_buffer_minutes||20)) await upsertAlert(email,"age_transition","amber",`Adult/child age-group transition has only ${Math.max(0,Math.round(gap))} minutes; approved buffer is ${profile.transition_buffer_minutes} minutes.`);
    }
  }
}

async function workProfile(email: string) {
  const existing = await db().prepare("SELECT * FROM staff_work_profiles WHERE email = ?").bind(email).first<Row>();
  if (existing) return existing;
  const now = new Date().toISOString();
  await db().prepare("INSERT OR IGNORE INTO staff_work_profiles (email,max_daily_hours,max_daily_sessions,max_high_support_sessions,lunch_after_minutes,transition_buffer_minutes,age_pattern,child_days,adult_days,preferences_confirmed_at,approved_by_email,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind(email,"8","6","2","240","20","mixed_with_buffers","[]","[]",null,null,now).run();
  return (await db().prepare("SELECT * FROM staff_work_profiles WHERE email = ?").bind(email).first<Row>())!;
}

async function activeShift(email: string) { return db().prepare("SELECT * FROM shift_checkins WHERE staff_email = ? AND shift_ended_at IS NULL ORDER BY shift_started_at DESC LIMIT 1").bind(email).first<Row>(); }

async function upsertAlert(email:string,type:string,severity:string,detail:string,escalate=false){
  const d1=db(); const existing=await d1.prepare("SELECT id,severity,status FROM safety_alerts WHERE staff_email=? AND alert_type=? AND status<>'closed' LIMIT 1").bind(email,type).first<Row>(); const now=new Date().toISOString();
  if(existing){await d1.prepare("UPDATE safety_alerts SET severity=?,detail=?,escalated_at=CASE WHEN ?='1' THEN COALESCE(escalated_at,?) ELSE escalated_at END,status=CASE WHEN ?='1' THEN 'escalated' ELSE status END WHERE id=?").bind(severity,detail,escalate?"1":"0",now,escalate?"1":"0",existing.id).run();return existing.id;}
  const id=crypto.randomUUID();await d1.prepare("INSERT INTO safety_alerts (id,staff_email,alert_type,severity,status,detail,action_taken,created_at,escalated_at,acknowledged_at,acknowledged_by,actioned_at,actioned_by,supervisor_signoff_at,supervisor_signoff_by,closed_at,closed_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(id,email,type,severity,escalate?"escalated":"active",detail,null,now,escalate?now:null,null,null,null,null,null,null,null,null).run();return id;
}

async function actionOpenAlert(actor:HubActor,detail:string){
  const open=await db().prepare("SELECT id FROM safety_alerts WHERE staff_email=? AND alert_type='lunch_break' AND status<>'closed' LIMIT 1").bind(actor.email).first<Row>();
  if(open) await db().prepare("UPDATE safety_alerts SET action_taken=?,actioned_at=?,actioned_by=?,status='actioned' WHERE id=?").bind(detail,new Date().toISOString(),actor.email,open.id).run();
}

async function seedDemoSafety(){
  const d1=db(), now=new Date(), date=now.toISOString().slice(0,10);
  const staff=[
    ["avery@fictional.demo","Dr Avery",225,["adult","child","adult"],["high","routine","high"]],
    ["sam@fictional.demo","Sam",195,["child","child","adolescent"],["routine","high","routine"]],
    ["mia@fictional.demo","Mia",245,[],[]],
  ] as const;
  for(const [email,,minutes,ages,intensities] of staff){
    await workProfile(email); const shiftId=`demo-shift-${email}-${date}`; const start=new Date(now.getTime()-minutes*60000); const due=new Date(start.getTime()+240*60000);
    await d1.prepare("INSERT OR IGNORE INTO shift_checkins (id,staff_email,shift_started_at,shift_ended_at,lunch_due_at,lunch_started_at,lunch_finished_at,break_state,workload_check,support_requested,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind(shiftId,email,start.toISOString(),null,due.toISOString(),null,null,"working",email.includes("avery")?"stretching":"steady","0",now.toISOString()).run();
    for(let i=0;i<ages.length;i++){const begins=new Date(start.getTime()+(i*60+20)*60000);await d1.prepare("INSERT OR IGNORE INTO schedule_blocks (id,staff_email,starts_at,duration_minutes,client_code,age_band,support_intensity,status,created_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(`demo-block-${email}-${date}-${i}`,email,begins.toISOString(),"50",`F${i+1}.${email[0].toUpperCase()}`,ages[i],intensities[i],"scheduled",now.toISOString()).run();}
  }
}
