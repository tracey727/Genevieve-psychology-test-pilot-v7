import { audit, db, errorResponse, isOversight, requireHubActor, safeText, type HubActor } from "@/lib/hub";

export const dynamic = "force-dynamic";

type Row=Record<string,string|null>;
const types=["policy","preference","lesson","script","workflow","handover"];
const scopes=["director","all_staff","psychology","reception","private"];

function roleScope(actor:HubActor){return ["reception","practice_manager"].includes(actor.role)?"reception":"psychology"}
function canGovern(actor:HubActor){return isOversight(actor)}
function canEdit(actor:HubActor,row:Row){return canGovern(actor)||row.owner_email===actor.email&&(row.scope==="private"||row.status==="proposed"||row.status_before_delete==="proposed")}
function canView(actor:HubActor,row:Row){return canGovern(actor)||row.owner_email===actor.email||row.status==="approved"&&["all_staff",roleScope(actor)].includes(row.scope||"")}

export async function GET(request:Request){
  try{
    const actor=await requireHubActor(request);
    if(actor.demo||canGovern(actor))await seedDemoMemory();
    const includeDeleted=new URL(request.url).searchParams.get("deleted")==="1"&&canGovern(actor);
    const d1=db();let result;
    if(canGovern(actor)){
      result=includeDeleted
        ?await d1.prepare("SELECT * FROM practice_memory ORDER BY deleted_at IS NULL DESC, CASE status WHEN 'proposed' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, updated_at DESC LIMIT 200").all()
        :await d1.prepare("SELECT * FROM practice_memory WHERE deleted_at IS NULL ORDER BY CASE status WHEN 'proposed' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, updated_at DESC LIMIT 150").all();
    }else{
      const scope=roleScope(actor);
      result=await d1.prepare(`SELECT * FROM practice_memory WHERE deleted_at IS NULL AND
        (owner_email=? OR (status='approved' AND scope IN ('all_staff',?)))
        ORDER BY CASE WHEN owner_email=? THEN 0 ELSE 1 END,updated_at DESC LIMIT 100`).bind(actor.email,scope,actor.email).all();
    }
    const items=(result.results||[]) as Row[];
    return Response.json({items,canGovern:canGovern(actor),actor:{email:actor.email,role:actor.role,displayName:actor.displayName,demo:actor.demo},stats:{active:items.filter(x=>!x.deleted_at).length,proposed:items.filter(x=>x.status==="proposed"&&!x.deleted_at).length,review:items.reduce((n,x)=>n+Number(x.review_count||0),0),deleted:items.filter(x=>Boolean(x.deleted_at)).length}})
  }catch(error){return errorResponse(error)}
}

export async function POST(request:Request){
  try{
    const actor=await requireHubActor(request),body=await request.json() as Record<string,unknown>;
    const title=safeText(body.title,120),content=safeText(body.content,1400),memoryType=safeText(body.memoryType,30),requestedScope=safeText(body.scope,30),tags=safeText(body.tags,180);
    if(!title||!content||!types.includes(memoryType))return Response.json({error:"Complete the memory title, type and operational content."},{status:400});
    let scope=scopes.includes(requestedScope)?requestedScope:"private";
    if(!canGovern(actor)&&!["private",roleScope(actor)].includes(scope))scope=roleScope(actor);
    const privateEntry=scope==="private",status=privateEntry?"active":canGovern(actor)?"approved":"proposed",now=new Date().toISOString(),id=crypto.randomUUID();
    await db().prepare(`INSERT INTO practice_memory
      (id,title,content,memory_type,scope,owner_email,owner_role,status,status_before_delete,source,tags,version,use_count,helpful_count,review_count,last_used_at,approved_at,approved_by,created_at,updated_at,deleted_at,deleted_by,delete_reason)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(id,title,content,memoryType,scope,actor.email,actor.role,status,null,"manual",tags,"1","0","0","0",null,status==="approved"?now:null,status==="approved"?actor.email:null,now,now,null,null,null).run();
    await audit(actor,"memory_created","practice_memory",id,`${memoryType}: ${title}`);
    return Response.json({ok:true,id,status});
  }catch(error){return errorResponse(error)}
}

export async function PATCH(request:Request){
  try{
    const actor=await requireHubActor(request),body=await request.json() as Record<string,unknown>,id=safeText(body.id,80),action=safeText(body.action,30),now=new Date().toISOString(),d1=db();
    const row=await d1.prepare("SELECT * FROM practice_memory WHERE id=?").bind(id).first<Row>();
    if(!row)return Response.json({error:"Memory item not found."},{status:404});
    if(action==="feedback"){
      if(!canView(actor,row))return Response.json({error:"This memory is outside this account’s role access."},{status:403});
      if(row.deleted_at)return Response.json({error:"Restore this memory before adding feedback."},{status:400});
      const feedback=safeText(body.feedback,30);
      if(feedback==="used")await d1.prepare("UPDATE practice_memory SET use_count=CAST(use_count AS INTEGER)+1,last_used_at=?,updated_at=? WHERE id=?").bind(now,now,id).run();
      else if(feedback==="helpful")await d1.prepare("UPDATE practice_memory SET helpful_count=CAST(helpful_count AS INTEGER)+1,updated_at=? WHERE id=?").bind(now,id).run();
      else if(feedback==="needs_review")await d1.prepare("UPDATE practice_memory SET review_count=CAST(review_count AS INTEGER)+1,updated_at=? WHERE id=?").bind(now,id).run();
      else return Response.json({error:"Choose a valid learning response."},{status:400});
      await audit(actor,`memory_feedback_${feedback}`,"practice_memory",id,row.title||"Memory feedback");
    }else if(action==="approve"){
      if(!canGovern(actor))return Response.json({error:"Only Irene or an approved governance role can approve practice learning."},{status:403});
      if(row.deleted_at)return Response.json({error:"Restore this item before approval."},{status:400});
      if(row.status!=="proposed")return Response.json({error:"Only a learning proposal can be approved."},{status:400});
      await d1.prepare("UPDATE practice_memory SET status='approved',approved_at=?,approved_by=?,review_count='0',updated_at=? WHERE id=?").bind(now,actor.email,now,id).run();
      await audit(actor,"memory_approved","practice_memory",id,row.title||"Practice learning approved");
    }else if(action==="update"){
      if(!canEdit(actor,row)||row.deleted_at)return Response.json({error:"This account cannot revise that memory."},{status:403});
      const title=safeText(body.title,120),content=safeText(body.content,1400),tags=safeText(body.tags,180);
      if(!title||!content)return Response.json({error:"Title and operational content are required."},{status:400});
      const status=canGovern(actor)?row.status:row.scope==="private"?"active":"proposed";
      await d1.prepare("UPDATE practice_memory SET title=?,content=?,tags=?,version=CAST(version AS INTEGER)+1,status=?,approved_at=CASE WHEN ?='approved' THEN approved_at ELSE NULL END,approved_by=CASE WHEN ?='approved' THEN approved_by ELSE NULL END,updated_at=? WHERE id=?").bind(title,content,tags,status,status,status,now,id).run();
      await audit(actor,"memory_revised","practice_memory",id,title);
    }else if(action==="archive"){
      if(!canEdit(actor,row)||row.deleted_at)return Response.json({error:"This account cannot archive that memory."},{status:403});
      const reason=safeText(body.reason,300);if(reason.length<3)return Response.json({error:"Record why this memory is being archived."},{status:400});
      await d1.prepare("UPDATE practice_memory SET status_before_delete=status,status='archived',deleted_at=?,deleted_by=?,delete_reason=?,updated_at=? WHERE id=?").bind(now,actor.email,reason,now,id).run();
      await audit(actor,"memory_archived","practice_memory",id,`${row.title}: ${reason}`);
    }else if(action==="restore"){
      if(!row.deleted_at||!canEdit(actor,row))return Response.json({error:"This account cannot restore that memory."},{status:403});
      const restored=canGovern(actor)?row.status_before_delete||"approved":row.scope==="private"?"active":"proposed";
      await d1.prepare("UPDATE practice_memory SET status=?,status_before_delete=NULL,deleted_at=NULL,deleted_by=NULL,delete_reason=NULL,updated_at=? WHERE id=?").bind(restored,now,id).run();
      await audit(actor,"memory_restored","practice_memory",id,row.title||"Memory restored");
    }else if(action==="purge"){
      if(actor.role!=="director")return Response.json({error:"Only Irene’s director account can permanently purge an archived memory."},{status:403});
      if(!row.deleted_at)return Response.json({error:"Archive the memory before permanent purge."},{status:400});
      const reason=safeText(body.reason,300),confirmTitle=safeText(body.confirmTitle,120);
      if(reason.length<3||confirmTitle!==row.title)return Response.json({error:"Enter the exact title and a purge reason."},{status:400});
      await audit(actor,"memory_permanently_purged","practice_memory",id,`${row.title}: ${reason}`);
      await d1.prepare("DELETE FROM practice_memory WHERE id=?").bind(id).run();
    }else return Response.json({error:"Choose a valid memory action."},{status:400});
    return Response.json({ok:true,at:now});
  }catch(error){return errorResponse(error)}
}

async function seedDemoMemory(){
  const d1=db(),alreadySeeded=await d1.prepare("SELECT id FROM hub_audit_events WHERE id='demo-memory-seed-marker' LIMIT 1").first();
  if(alreadySeeded)return;
  const now=new Date().toISOString(),rows=[
    ["demo-memory-lunch","Lunch alert response rule","A lunch alert stays visible until coverage is arranged, the break action is recorded and an authorised supervisor signs off.","policy","all_staff","irene@fictional.demo","director","approved","safety, lunch, sign-off","0","0"],
    ["demo-memory-transition","Adult and child transition reset","Keep the worker’s agreed recovery buffer when moving between adult and child or adolescent sessions; rebalance the day when the buffer cannot be protected.","workflow","psychology","irene@fictional.demo","director","approved","workload, age mix, buffer","3","0"],
    ["demo-memory-reception","Distressed contact transfer","Reception uses the approved words, keeps minimum coded information and transfers judgement to an authorised clinician or approved emergency pathway.","script","reception","irene@fictional.demo","director","approved","reception, transfer, privacy","2","0"],
    ["demo-memory-unresolved","Unresolved work remains visible","A message, callback, handover or safety matter is not treated as completed merely because it was sent. Ownership, action and outcome must be recorded.","policy","all_staff","irene@fictional.demo","director","approved","continuity, ownership, closure","4","0"],
    ["demo-memory-learning-1","Add a five-minute reception reset after distressed calls","Fictional reception feedback: a brief protected reset and supervisor check-in improved concentration before the next contact.","lesson","reception","mia@fictional.demo","reception","proposed","reception, recovery, feedback","1","1"],
    ["demo-memory-learning-2","Children-focused mornings reduce switching fatigue","Fictional clinician feedback: grouping child sessions in the morning reduced repeated adult/child transitions while preserving agreed buffers.","lesson","psychology","avery@fictional.demo","psychologist","proposed","psychology, schedule, feedback","2","1"],
    ["demo-memory-private-avery","My preferred transition reset","Before switching age groups: close the coded task, reset materials, take the agreed buffer and confirm readiness without recording clinical content.","preference","private","avery@fictional.demo","psychologist","active","private, preference","1","0"],
    ["demo-memory-private-mia","My reception handover reminder","Before lunch or shift end: confirm the coded queue owner, due time and escalation status; do not copy clinical detail.","handover","private","mia@fictional.demo","reception","active","private, handover","1","0"],
  ];
  for(const row of rows){
    const [id,title,content,type,scope,owner,role,status,tags,helpful,review]=row;
    await d1.prepare(`INSERT OR IGNORE INTO practice_memory
      (id,title,content,memory_type,scope,owner_email,owner_role,status,status_before_delete,source,tags,version,use_count,helpful_count,review_count,last_used_at,approved_at,approved_by,created_at,updated_at,deleted_at,deleted_by,delete_reason)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(id,title,content,type,scope,owner,role,status,null,"demo",tags,"1","0",helpful,review,null,status==="approved"?now:null,status==="approved"?"irene@fictional.demo":null,now,now,null,null,null).run();
  }
  await d1.prepare(`INSERT OR IGNORE INTO hub_audit_events
    (id,actor_email,actor_role,action,target_type,target_id,detail,created_at)
    VALUES ('demo-memory-seed-marker','irene@fictional.demo','director','memory_demo_seeded','practice_memory','demo-seed','Fictional operational memory seeded once',?)`).bind(now).run();
}
