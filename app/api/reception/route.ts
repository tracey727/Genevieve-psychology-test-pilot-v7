import { audit, db, errorResponse, isOversight, requireHubActor, safeText } from "@/lib/hub";

export const dynamic = "force-dynamic";

const allowedRoles = ["director","board","practice_manager","reception","clinical_lead"];

export async function GET(request:Request){
  try{
    const actor=await requireHubActor(request);
    if(!allowedRoles.includes(actor.role)) return Response.json({error:"Reception information is outside this role’s authorised view."},{status:403});
    if(actor.demo) await seedReception();
    const result=isOversight(actor)||actor.role==="practice_manager"||actor.role==="clinical_lead"
      ?await db().prepare("SELECT * FROM reception_queue ORDER BY CASE priority WHEN 'red' THEN 0 WHEN 'amber' THEN 1 ELSE 2 END,due_at LIMIT 100").all()
      :await db().prepare("SELECT * FROM reception_queue WHERE assigned_to_email IS NULL OR assigned_to_email=? ORDER BY CASE priority WHEN 'red' THEN 0 WHEN 'amber' THEN 1 ELSE 2 END,due_at LIMIT 60").bind(actor.email).all();
    return Response.json({items:result.results||[],scripts:approvedScripts()});
  }catch(error){return errorResponse(error)}
}

export async function POST(request:Request){
  try{
    const actor=await requireHubActor(request);
    if(!allowedRoles.includes(actor.role))return Response.json({error:"This role cannot create reception work."},{status:403});
    const body=await request.json() as Record<string,unknown>,now=new Date().toISOString();
    const clientCode=safeText(body.clientCode,12).replace(/[^A-Za-z0-9.-]/g,"");
    const itemType=safeText(body.itemType,30),detail=safeText(body.detail,500),priority=safeText(body.priority,20);
    if(!clientCode||!detail||!["callback","message","transfer","intake","missed_contact"].includes(itemType)||!["normal","amber","red"].includes(priority))return Response.json({error:"Complete the coded reception fields."},{status:400});
    const id=crypto.randomUUID();
    await db().prepare("INSERT INTO reception_queue (id,assigned_to_email,client_code,item_type,detail,priority,due_at,status,escalated_to_email,outcome,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(id,actor.role==="reception"?actor.email:safeText(body.assignedToEmail,180)||null,clientCode,itemType,detail,priority,safeText(body.dueAt,50)||null,"open",null,null,now,now).run();
    await audit(actor,"reception_item_created","reception",id,`${itemType} for coded record ${clientCode}`);
    return Response.json({ok:true,id});
  }catch(error){return errorResponse(error)}
}

export async function PATCH(request:Request){
  try{
    const actor=await requireHubActor(request);
    if(!allowedRoles.includes(actor.role))return Response.json({error:"This role cannot update reception work."},{status:403});
    const body=await request.json() as Record<string,unknown>,id=safeText(body.id,80),action=safeText(body.action,30),now=new Date().toISOString();
    const item=await db().prepare("SELECT * FROM reception_queue WHERE id=?").bind(id).first<Record<string,string|null>>();
    if(!item)return Response.json({error:"Reception item not found."},{status:404});
    const own=!item.assigned_to_email||item.assigned_to_email===actor.email;
    if(!own&&!isOversight(actor)&&actor.role!=="practice_manager"&&actor.role!=="clinical_lead")return Response.json({error:"This item belongs to another authorised worker."},{status:403});
    if(action==="accept")await db().prepare("UPDATE reception_queue SET assigned_to_email=?,status='accepted',updated_at=? WHERE id=?").bind(actor.email,now,id).run();
    else if(action==="complete"){
      const outcome=safeText(body.outcome,500);if(!outcome)return Response.json({error:"Record the operational outcome before completion."},{status:400});
      await db().prepare("UPDATE reception_queue SET status='completed',outcome=?,updated_at=? WHERE id=?").bind(outcome,now,id).run();
    }else if(action==="escalate"){
      const note=safeText(body.outcome,500)||"Reception requested authorised human review.";
      await db().prepare("UPDATE reception_queue SET status='escalated',escalated_to_email='director',outcome=?,priority='red',updated_at=? WHERE id=?").bind(note,now,id).run();
      const messageId=crypto.randomUUID();
      await db().prepare("INSERT INTO hub_messages (id,thread_id,sender_email,sender_name,sender_role,recipient_email,recipient_role,subject,body,category,priority,created_at,read_at,acknowledged_at,reply_to) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .bind(messageId,messageId,actor.email,actor.displayName,actor.role,null,"director",`Reception escalation — ${item.client_code}`,note,"reception","red",now,null,null,null).run();
    }else return Response.json({error:"Choose a valid reception action."},{status:400});
    await audit(actor,`reception_${action}`,"reception",id,item.detail||"Reception item updated");
    return Response.json({ok:true,at:now});
  }catch(error){return errorResponse(error)}
}

function approvedScripts(){return[
  {name:"Clinician unavailable",text:"The clinician is unavailable. I can record the minimum information needed and arrange an authorised callback."},
  {name:"Concerning contact",text:"I am going to connect you with an authorised clinician or the practice’s approved emergency pathway. Reception does not make a clinical assessment."},
  {name:"Voicemail privacy",text:"Before leaving a message, confirm the approved contact channel and whether details may be left."},
  {name:"Immediate emergency",text:"If immediate emergency assistance is required, call 000. This program does not contact emergency services automatically."},
]}

async function seedReception(){const d1=db(),now=new Date(),date=now.toISOString().slice(0,10),rows=[
  ["callback","F-R1","Callback requested; approved channel confirmed.","normal",45],
  ["transfer","F-R2","Distressed caller requires transfer to authorised psychologist.","red",5],
  ["missed_contact","F-R3","Second unanswered contact; owner and next action required.","amber",20],
];for(let i=0;i<rows.length;i++){const [type,code,detail,priority,minutes]=rows[i];await d1.prepare("INSERT OR IGNORE INTO reception_queue (id,assigned_to_email,client_code,item_type,detail,priority,due_at,status,escalated_to_email,outcome,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").bind(`demo-reception-${date}-${i}`,null,code,type,detail,priority,new Date(now.getTime()+Number(minutes)*60000).toISOString(),"open",null,null,now.toISOString(),now.toISOString()).run();}}
