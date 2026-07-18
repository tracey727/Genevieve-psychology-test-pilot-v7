'use strict';
const fs=require('fs');const path=require('path');
const root=path.join(__dirname,'..');
const files=['app.js','index.html','README.md','START_HERE.txt','config/mood_mind_domain_package.json'];
const forbidden=[/hospital (ward|round|patient|care|medication)/i,/aged care/i,/resident rounds?/i,/medication rounds?/i,/kennels?/i,/catter(y|ies)/i,/animal welfare/i];
for(const file of files){const text=fs.readFileSync(path.join(root,file),'utf8');for(const pattern of forbidden){if(pattern.test(text))throw new Error(`${file} contains removed non-psychology term: ${pattern}`);}}
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
for(const required of ['Provisional psychologist supervision','WorkCover','Professional indemnity','Psychosocial','Reception support centre','Immediate Safety Concern','Client continuity register','Activate Emergency Cover','First backup','Second backup','Irene’s Director Control Desk','Documents & Forms','support alert','DOCUMENT_LIBRARY']){if(!app.includes(required))throw new Error(`Missing required psychology content: ${required}`);}
for(const requiredFile of ['documents/GENEVIEVE_App_Formal_Letter_to_Irene_Proposed_Duties.docx','documents/GENEVIEVE_HEALTH_Mental_Health_Practice_Support_Proposal_for_Irene_WITH_LOCKED_LOGO.pdf','documents/IRENE_ROLE_AND_PERMISSION_MATRIX.md','documents/BRAND_AND_COLOUR_CONTROL.md']){if(!fs.existsSync(path.join(root,requiredFile)))throw new Error(`Missing Irene file: ${requiredFile}`);}
console.log('PASS: psychology-only content guard, Irene file centre and required-module checks');
