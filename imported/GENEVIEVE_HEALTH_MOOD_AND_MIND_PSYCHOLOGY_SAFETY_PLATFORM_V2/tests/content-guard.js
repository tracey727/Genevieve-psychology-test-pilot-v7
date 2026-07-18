'use strict';
const fs=require('fs');const path=require('path');
const root=path.join(__dirname,'..');
const files=['app.js','index.html','README.md','START_HERE.txt','config/mood_mind_domain_package.json'];
const forbidden=[/hospital/i,/aged care/i,/resident rounds?/i,/medication rounds?/i,/kennels?/i,/catter(y|ies)/i,/animal welfare/i];
for(const file of files){const text=fs.readFileSync(path.join(root,file),'utf8');for(const pattern of forbidden){if(pattern.test(text))throw new Error(`${file} contains removed non-psychology term: ${pattern}`);}}
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
for(const required of ['Provisional psychologist supervision','WorkCover','Professional indemnity','Psychosocial','Reception support centre','Immediate Safety Concern','Client continuity register']){if(!app.includes(required))throw new Error(`Missing required psychology content: ${required}`);}
console.log('PASS: psychology-only content guard and required-module checks');
