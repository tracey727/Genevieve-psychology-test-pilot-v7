'use strict';
const Core=require('../core.js');
const elements=new Map();
function element(id=''){
  if(elements.has(id))return elements.get(id);
  const el={id,innerHTML:'',textContent:'',value:'director',hidden:true,dataset:{},checked:false,disabled:false,
    classList:{add(){},remove(){},toggle(){},contains(){return false;}},
    addEventListener(){},focus(){},closest(){return null;},appendChild(){},remove(){},click(){},
    setAttribute(){},querySelector(){return element('nested')},querySelectorAll(){return []},reportValidity(){return true;}};
  elements.set(id,el);return el;
}
global.window=global;global.window.GenevieveCore=Core;global.window.print=()=>{};
global.document={getElementById:element,addEventListener(){},createElement:()=>element('created_'+Math.random()),head:element('head'),body:element('body'),activeElement:element('active')};
global.localStorage={getItem(){return null;},setItem(){}};global.sessionStorage={getItem(){return null;},setItem(){}};
Object.defineProperty(global,'navigator',{value:{},configurable:true});Object.defineProperty(global,'location',{value:{protocol:'file:'},configurable:true});
global.confirm=()=>true;global.prompt=()=>null;global.alert=()=>{};global.setInterval=()=>0;global.setTimeout=()=>0;global.clearTimeout=()=>{};
global.URL={createObjectURL(){return 'blob:'},revokeObjectURL(){}};global.Blob=function(){};
require('../app.js');
const html=elements.get('page').innerHTML;
if(!html.includes('Psychology practice operational state'))throw new Error('Dashboard did not render psychology practice state');
if(!html.includes('Provisional'))throw new Error('Dashboard did not include psychology workforce/supervision content');
console.log('PASS: application initialises and renders the psychology dashboard');
