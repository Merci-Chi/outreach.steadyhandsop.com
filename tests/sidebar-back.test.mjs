import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=(await readFile(new URL('../sidebar.js',import.meta.url),'utf8')).split('// Inbound reception')[0];
function setup({path='call.html',active=false,allow=true,mobile=true}={}){
 const elements=[],classes=new Set(),stored=new Map(),prompts=[];
 const element=()=>{const node={attributes:{},listeners:{},setAttribute(k,v){this.attributes[k]=v},removeAttribute(k){delete this.attributes[k]},addEventListener(k,fn){(this.listeners[k]??=[]).push(fn)},click(){for(const fn of this.listeners.click||[])fn()},focus(){},querySelector(){return collapse},querySelectorAll(){return []}};elements.push(node);return node;};
 const collapse=element(),header={insertBefore(node){header.toggle=node}},app={querySelector:()=>header},location={pathname:'/'+path,search:'?crm_id=lead%2Fone',href:''};
 const document={readyState:'complete',querySelector:s=>s==='.app'?app:null,createElement:element,getElementById:()=>({dataset:{callState:active?'active':'idle'}}),addEventListener(){},documentElement:{classList:{add(){}}},body:{prepend(){},classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x),toggle:x=>classes.has(x)?classes.delete(x):classes.add(x)}}};
 vm.runInNewContext(source,{document,location,URLSearchParams,encodeURIComponent,matchMedia:q=>({matches:q.includes('max-width')?mobile:!mobile,addEventListener(){}}),window:{confirm:text=>(prompts.push(text),allow)},sessionStorage:{setItem:(k,v)=>stored.set(k,v)}});
 return {toggle:header.toggle,classes,location,stored,prompts};
}
test('call header uses a back arrow and returns to the same Outreach lead',()=>{
 const s=setup();assert.match(s.toggle.className,/sh-sidebar-toggle sh-outreach-back/);assert.match(s.toggle.innerHTML,/arrow-left/);assert.equal(s.toggle.attributes['aria-label'],'Back to Outreach');assert.equal(s.toggle.attributes['aria-controls'],undefined);
 s.toggle.click();assert.equal(s.location.href,'index.html?crm_id=lead%2Fone');assert.equal(s.stored.get('steadyhands-selected-outreach-crm-id'),'lead/one');assert.equal(s.classes.has('sh-menu-open'),false);
});
test('back arrow preserves active-call confirmation and can cancel navigation',()=>{
 const s=setup({active:true,allow:false});s.toggle.click();assert.equal(s.prompts.length,1);assert.equal(s.location.href,'');assert.equal(s.stored.size,0);
});
test('other mobile pages retain their hamburger menu',()=>{
 const s=setup({path:'sales.html'});assert.match(s.toggle.innerHTML,/data-lucide="menu"/);s.toggle.click();assert(s.classes.has('sh-menu-open'));s.toggle.click();assert.equal(s.classes.has('sh-menu-open'),false);
});
test('call page loads one sidebar initializer and removes the old standalone Back button',async()=>{
 const html=await readFile(new URL('../call.html',import.meta.url),'utf8');assert.equal((html.match(/src="sidebar.js\?/g)||[]).length,1);assert.doesNotMatch(html,/class="call-back-btn"/);
});
