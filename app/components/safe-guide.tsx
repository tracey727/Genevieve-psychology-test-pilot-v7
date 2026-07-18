"use client";

import { useState } from "react";

type Props={audience:"director"|"staff"|"reception";onNavigate?:(view:string)=>void};

const guidance={
  director:[
    ["Break alert is overdue","Open Safety Alerts, confirm the real action taken, then complete supervisor sign-off. Do not close it merely because a message was sent.","alerts"],
    ["Workload looks unsafe","Open Workload Protection. Review hours, high-support load, age transitions, buffers and coverage with the worker.","workload"],
    ["A lesson needs approval","Open Memory & Learning. Review the operational lesson, revise it if needed, then approve it for the correct role. Feedback never rewrites guidance automatically.","memory"],
    ["Reception escalated contact","Open Staff Communications or Reception Base and allocate an authorised human owner.","messages"],
  ],
  staff:[
    ["I need a break or lunch","Open My Safety, start the break if coverage is in place, or request help. The alert stays open until authorised sign-off.","safety"],
    ["My workload feels high","Record a private workload check-in and request support. This is not a performance score.","safety"],
    ["I want the program to remember this","Open Memory. Save a private working preference or propose an operational lesson for Irene to review.","memory"],
    ["I need coverage","Send Irene an operational coverage request without client-identifiable or clinical details.","compose"],
  ],
  reception:[
    ["A caller sounds distressed","Use the approved transfer script and escalate to an authorised clinician. Reception does not make a clinical assessment.","queue"],
    ["I need a break or debrief","Open My Safety and request coverage, a protected break or a debrief.","safety"],
    ["I want reception to remember this","Open Memory. Keep a reminder private or propose an operational improvement for Irene to approve.","memory"],
    ["A callback is unanswered","Keep it open, record the attempt and escalate when the approved threshold is reached.","queue"],
  ],
} as const;

export function SafeGuide({audience,onNavigate}:Props){
  const [open,setOpen]=useState(false),[answer,setAnswer]=useState("");
  return <div className={`safe-guide ${open?"open":""}`}>
    <button className="guide-launch" aria-expanded={open} onClick={()=>setOpen(!open)}><span>G</span><b>Safety Guide</b></button>
    {open&&<section className="guide-panel" aria-label="GENEVIEVE operational safety guide"><div className="guide-head"><div><b>GENEVIEVE Safety Guide</b><small>Operational guidance only</small></div><button aria-label="Close safety guide" onClick={()=>setOpen(false)}>×</button></div><p className="guide-boundary">No diagnosis, clinical risk scoring or automatic external contact.</p><div className="guide-options">{guidance[audience].map(([question,response])=><button key={question} onClick={()=>setAnswer(response)}>{question}</button>)}</div>{answer&&<div className="guide-answer"><p>{answer}</p>{guidance[audience].find(item=>item[1]===answer)?.[2]&&<button onClick={()=>{const target=guidance[audience].find(item=>item[1]===answer)?.[2];if(target&&onNavigate)onNavigate(target)}}>Open the right page</button>}</div>}</section>}
  </div>
}
