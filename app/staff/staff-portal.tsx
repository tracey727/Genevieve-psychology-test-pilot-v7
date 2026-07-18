"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { hubFetch, label } from "@/app/lib/client-api";
import { usePersistentView } from "@/app/lib/use-persistent-view";
import { SafeGuide } from "@/app/components/safe-guide";
import { MemoryCentre } from "@/app/components/memory-centre";

type Actor = { email:string; displayName:string; role:string; permissions:Record<string,boolean>; demo:boolean };
type Message = Record<string,string|null>;
type Assignment = Record<string,string|null>;
type InstallPrompt = Event & { prompt: () => Promise<void> };

const roleNeeds: Record<string, {title:string; modules:string[]; boundary:string}> = {
  psychologist: { title:"Clinical Psychologist", modules:["My appointments","My continuity actions","Messages with Irene","Breaks & support","Emergency cover"], boundary:"Coded client references and your own operational responsibilities only." },
  clinical_lead: { title:"Clinical Lead", modules:["Supervision oversight","Assigned continuity","Messages with Irene","Staff escalation","Emergency cover"], boundary:"Only authorised oversight records; no unrestricted personal staff information." },
  provisional: { title:"Provisional Psychologist", modules:["My appointments","My supervision actions","Messages with Irene","Scope & escalation","Breaks & support"], boundary:"Your work, supervision requirements and authorised support pathway only." },
  reception: { title:"Reception", modules:["My callback queue","Approved scripts","Messages with Irene","Transfer requests","Breaks & support"], boundary:"Scheduling and contact operations only—no therapy notes or clinical judgement." },
  practice_manager: { title:"Practice Manager", modules:["Staffing actions","Reception queue","Messages with Irene","Opening & closure","WHS actions"], boundary:"Practice operations only; clinical decisions stay with authorised clinicians." },
  auditor: { title:"Read-only Auditor", modules:["Authorised audit evidence","Access history"], boundary:"Read-only approved evidence; no staff communications or clinical records." },
};

export function StaffPortal() {
  const [actor,setActor]=useState<Actor|null>(null), [messages,setMessages]=useState<Message[]>([]), [assignments,setAssignments]=useState<Assignment[]>([]);
  const [safety,setSafety]=useState<{alerts:Message[];shifts:Message[];schedules:Message[];profiles:Message[]}>({alerts:[],shifts:[],schedules:[],profiles:[]});
  const [tab,setTab]=usePersistentView("staff","home");
  const [error,setError]=useState(""), [notice,setNotice]=useState(""), [loading,setLoading]=useState(true);
  const [installEvent,setInstallEvent]=useState<InstallPrompt|null>(null);

  const load=useCallback(async()=>{
    try {
      const [session,messageData,assignmentData,safetyData]=await Promise.all([
        hubFetch("/api/session",{},"psychologist"), hubFetch("/api/messages",{},"psychologist"), hubFetch("/api/assignments",{},"psychologist"),hubFetch("/api/safety",{},"psychologist")
      ]);
      setActor(session.actor); setMessages(messageData.messages); setAssignments(assignmentData.assignments);setSafety(safetyData); setError("");
    } catch(e){ setError(e instanceof Error?e.message:"Unable to connect"); }
    finally{ setLoading(false); }
  },[]);

  useEffect(()=>{ const initial=setTimeout(()=>void load(),0); const timer=setInterval(()=>void load(),8000); return()=>{clearTimeout(initial);clearInterval(timer)}; },[load]);
  useEffect(()=>{ const handler=(event:Event)=>{event.preventDefault();setInstallEvent(event as InstallPrompt)}; window.addEventListener("beforeinstallprompt",handler); navigator.serviceWorker?.register("/staff-sw.js"); return()=>window.removeEventListener("beforeinstallprompt",handler); },[]);

  const needs=roleNeeds[actor?.role||"psychologist"]||roleNeeds.psychologist;
  const unread=messages.filter(m=>!m.read_at && m.sender_email!==actor?.email).length;
  const openTasks=assignments.filter(a=>!["completed","declined"].includes(a.status||"")).length;
  const firstName=(actor?.displayName||"Staff").split(" ")[0];

  async function sendMessage(event:FormEvent<HTMLFormElement>){
    event.preventDefault(); const form=new FormData(event.currentTarget);
    try{await hubFetch("/api/messages",{method:"POST",body:JSON.stringify({subject:form.get("subject"),body:form.get("body"),category:form.get("category"),priority:form.get("priority")})},"psychologist"); event.currentTarget.reset(); setNotice("Sent securely to Irene’s dashboard."); await load();}
    catch(e){setError(e instanceof Error?e.message:"Message not sent");}
  }
  async function updateTask(id:string,status:string){
    try{await hubFetch("/api/assignments",{method:"PATCH",body:JSON.stringify({id,status,response:status==="needs_help"?"Please contact me through the secure hub.":""})},"psychologist");setNotice(`Task ${label(status)}.`);await load();}catch(e){setError(e instanceof Error?e.message:"Update failed")}
  }
  async function acknowledge(id:string){try{await hubFetch("/api/messages",{method:"PATCH",body:JSON.stringify({id,action:"acknowledge"})},"psychologist");await load();}catch(e){setError(e instanceof Error?e.message:"Update failed")}}
  async function safetyAction(action:string,payload:Record<string,unknown>={}){try{await hubFetch("/api/safety",{method:"POST",body:JSON.stringify({action,...payload})},"psychologist");setNotice("Safety action recorded. Supervisor sign-off remains required before an alert can close.");await load()}catch(e){setError(e instanceof Error?e.message:"Safety action failed")}}
  async function alertAction(id:string,action:string,actionTaken=""){try{await hubFetch("/api/safety",{method:"PATCH",body:JSON.stringify({id,action,actionTaken})},"psychologist");setNotice("Alert updated; only an authorised supervisor can deactivate it.");await load()}catch(e){setError(e instanceof Error?e.message:"Alert update failed")}}

  if(loading) return <div className="loading-screen">Connecting to Irene’s safety hub…</div>;
  if(!actor) return <AccessScreen error={error}/>;

  return <main className="phone-app">
    <header className="mobile-top">
      <Link href="/" className="mini-brand"><img src="/demo/assets/icon-192.png" alt="GENEVIEVE App"/><span><b>GENEVIEVE</b><small>STAFF SAFETY</small></span></Link>
      <button className="round-user" title={`${actor.displayName} — open profile`} onClick={()=>setTab("profile")}>{firstName.slice(0,2).toUpperCase()}</button>
    </header>
    <div className="fiction-banner"><b>FICTIONAL DATA DEMO</b><span>No names, therapy notes, health records or identifiable client details.</span></div>
    <section className="phone-content">
      {error&&<div className="alert error">{error}</div>}{notice&&<div className="alert success" onClick={()=>setNotice("")}>{notice}</div>}
      {tab==="home"&&<>
        <div className="staff-welcome"><span>{needs.title}</span><h1>Hello, {firstName}</h1><p>Your private operational view is connected to Irene’s dashboard.</p></div>
        <div className="privacy-boundary"><b>Your access boundary</b><p>{needs.boundary}</p></div>
        <div className="phone-stats"><button onClick={()=>setTab("tasks")}><b>{openTasks}</b><span>My open tasks</span></button><button onClick={()=>setTab("messages")}><b>{unread}</b><span>Unread messages</span></button><button onClick={()=>setTab("safety")}><b>{safety.alerts.length}</b><span>My safety alerts</span></button></div>
        <section className="mobile-card"><div className="card-title"><h2>What applies to me</h2><small>Role-filtered</small></div><div className="module-list">{needs.modules.map(item=><div key={item}><span>✓</span>{item}</div>)}</div></section>
        <section className="mobile-card urgent-card"><span className="eyebrow">Quick contact</span><h2>Contact Irene’s dashboard</h2><p>Send an operational update, coverage question, support request or acknowledgement.</p><button className="gold-button" onClick={()=>setTab("compose")}>New secure message</button></section>
      </>}
      {tab==="tasks"&&<section className="mobile-card page-card"><div className="card-title"><h1>My tasks</h1><small>{openTasks} open</small></div>{assignments.length===0?<Empty text="No work has been assigned to you."/>:<div className="feed">{assignments.map(item=><article key={item.id||""} className={`feed-item ${item.priority}`}><div><span className="pill">{label(item.category||"operational")}</span><time>{item.due_at?new Date(item.due_at).toLocaleString("en-AU"):"No due time"}</time></div><h3>{item.title}</h3><p>{item.instructions}</p><small>Status: {label(item.status||"")}</small>{!["completed","declined"].includes(item.status||"")&&<div className="action-row"><button onClick={()=>updateTask(item.id||"","accepted")}>Accept</button><button onClick={()=>updateTask(item.id||"","completed")}>Complete</button><button onClick={()=>updateTask(item.id||"","needs_help")}>Need help</button></div>}</article>)}</div>}</section>}
      {tab==="messages"&&<section className="mobile-card page-card"><div className="card-title"><h1>Messages</h1><button onClick={()=>setTab("compose")}>New</button></div>{messages.length===0?<Empty text="No secure messages yet."/>:<div className="feed">{messages.map(item=><article key={item.id||""} className="feed-item"><div><span className="pill">{item.sender_email===actor.email?"Sent":"From "+item.sender_name}</span><time>{new Date(item.created_at||"").toLocaleString("en-AU")}</time></div><h3>{item.subject}</h3><p>{item.body}</p>{item.sender_email!==actor.email&&!item.acknowledged_at&&<button className="ack-button" onClick={()=>acknowledge(item.id||"")}>Acknowledge</button>}{item.acknowledged_at&&<small>✓ Acknowledged</small>}</article>)}</div>}</section>}
      {tab==="compose"&&<section className="mobile-card page-card"><div className="card-title"><h1>Message Irene</h1><button onClick={()=>setTab("messages")}>Cancel</button></div><form className="stack-form" onSubmit={sendMessage}><label>Type<select name="category"><option value="operational">Operational update</option><option value="coverage">Coverage request</option><option value="support">Staff support</option><option value="safety">Safety concern</option><option value="handover">Handover</option></select></label><label>Priority<select name="priority"><option value="normal">Normal</option><option value="amber">Needs attention</option><option value="red">Urgent human review</option></select></label><label>Subject<input name="subject" maxLength={120} required placeholder="Short operational subject"/></label><label>Message<textarea name="body" maxLength={1200} required rows={6} placeholder="No private clinical or client-identifiable details."/></label><button className="gold-button" type="submit">Send to Irene’s dashboard</button></form></section>}
      {tab==="safety"&&<section className="mobile-card page-card"><div className="card-title"><h1>My Safety</h1><small>Human-reviewed</small></div><p className="lead">Lunch, hours, emotional workload, high-support sessions and adult/child transitions are visible without becoming a performance score.</p><div className="safety-action-grid">{safety.shifts.length===0?<button onClick={()=>safetyAction("start_shift")}><b>Start shift</b><span>Begin hours and lunch protection</span></button>:<><button onClick={()=>safetyAction("start_lunch")}><b>Start lunch</b><span>Record protected break</span></button><button onClick={()=>safetyAction("finish_lunch")}><b>Finish lunch</b><span>Return after recovery time</span></button></>}<button onClick={()=>safetyAction("check_in",{workloadCheck:"high",supportRequested:true})}><b>Request support</b><span>Private high-workload check-in</span></button><button onClick={()=>setTab("compose")}><b>Request coverage</b><span>Message Irene’s dashboard</span></button></div>{safety.alerts.length?<div className="alert-stack">{safety.alerts.map(alert=><article key={alert.id||""} className={`safety-alert ${alert.severity}`}><div><span className="pill">{label(alert.alert_type||"")}</span><b>{label(alert.status||"")}</b></div><p>{alert.detail}</p>{!alert.acknowledged_at&&<button onClick={()=>alertAction(alert.id||"","acknowledge")}>Acknowledge</button>} {!alert.actioned_at&&<button onClick={()=>alertAction(alert.id||"","record_action","I have requested coverage or taken the protected action shown in the workflow.")}>Record action taken</button>}<small>Only Irene, a supervisor or an authorised safety person can close this alert after the action is recorded.</small></article>)}</div>:<Empty text="No open safety alerts."/>}<h2 className="subheading">Today’s age and support mix</h2>{safety.schedules.length?<div className="schedule-strip">{safety.schedules.map(item=><div key={item.id||""}><time>{new Date(item.starts_at||"").toLocaleTimeString("en-AU",{hour:"2-digit",minute:"2-digit"})}</time><b>{label(item.age_band||"")}</b><span>{label(item.support_intensity||"")} support · coded {item.client_code}</span></div>)}</div>:<Empty text="No coded schedule blocks loaded."/>}<form className="stack-form" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);safetyAction("save_preferences",{agePattern:f.get("agePattern"),transitionBufferMinutes:f.get("transitionBufferMinutes")})}}><h2 className="subheading">My scheduling preference</h2><label>Preferred age pattern<select name="agePattern"><option value="mixed_with_buffers">Mixed ages with transition buffers</option><option value="children_days">Children-focused days</option><option value="adult_days">Adult-focused days</option><option value="custom">Custom pattern agreed with supervisor</option></select></label><label>Minimum adult/child transition buffer<select name="transitionBufferMinutes"><option value="15">15 minutes</option><option value="20">20 minutes</option><option value="30">30 minutes</option><option value="45">45 minutes</option></select></label><button className="gold-button">Send preference for supervisor approval</button></form><div className="emergency-note"><b>Immediate emergency</b><p>This app does not contact emergency services. Call 000 when urgent emergency assistance is needed.</p></div></section>}
      {tab==="memory"&&<MemoryCentre audience="staff"/>}
      {tab==="profile"&&<section className="mobile-card page-card"><h1>My access</h1><dl className="profile-list"><div><dt>Name</dt><dd>{actor.displayName}</dd></div><div><dt>Role</dt><dd>{needs.title}</dd></div><div><dt>Sign-in</dt><dd>{actor.demo?"Fictional demo identity":actor.email}</dd></div><div><dt>Privacy</dt><dd>{needs.boundary}</dd></div></dl>{installEvent?<button className="gold-button" onClick={()=>installEvent.prompt()}>Install on this phone</button>:<p className="install-help">On iPhone: Share → Add to Home Screen. On Android: browser menu → Install app.</p>}<a className="signout-link" href="/signout-with-chatgpt?return_to=/">Sign out</a></section>}
    </section>
    <nav className="mobile-nav"><button className={tab==="home"?"active":""} onClick={()=>setTab("home")}><span>⌂</span>Home</button><button className={tab==="tasks"?"active":""} onClick={()=>setTab("tasks")}><span>✓</span>Tasks</button><button className={tab==="messages"?"active":""} onClick={()=>setTab("messages")}><span>✉</span>Messages{unread>0&&<i>{unread}</i>}</button><button className={tab==="safety"?"active":""} onClick={()=>setTab("safety")}><span>♡</span>My Safety</button><button className={tab==="memory"?"active":""} onClick={()=>setTab("memory")}><span>◈</span>Memory</button></nav>
    <SafeGuide audience="staff" onNavigate={target=>setTab(target==="support"?"safety":target)}/>
  </main>;
}

function Empty({text}:{text:string}){return <div className="empty-state"><span>✓</span><p>{text}</p></div>}
function AccessScreen({error}:{error:string}){return <main className="access-screen"><img src="/demo/assets/icon-512.png" alt="GENEVIEVE App"/><h1>Staff access</h1><p>{error||"Sign in to continue."}</p><a className="gold-button" href="/signin-with-chatgpt?return_to=/staff">Sign in with ChatGPT</a><small>Irene must authorise the same email address before staff information is shown.</small></main>}
