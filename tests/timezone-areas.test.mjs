import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const window={};const context=vm.createContext({window,Intl,Date});
vm.runInContext(read('actions/timezone-areas.js'),context);
vm.runInContext(read('actions/timezone-picker.js'),context);
const picker=window.SteadyHandsTimezonePicker,countries=picker.catalog('UTC');
const country=id=>countries.find(c=>c.id===id);
const area=(id,label)=>[...country(id).areas.values()].find(a=>a.label===label);
test('Egypt exposes every governorate, with shared Cairo clock rules kept as separate areas',()=>{
 assert(country('EG').areas.size>=27);
 for(const name of ['Cairo','Alexandria','Giza','Aswan','Luxor','North Sinai','South Sinai']){
  assert(area('EG',name),name);assert(area('EG',name).zones.some(z=>z.id==='Africa/Cairo'));
 }
});
test('states, provinces and regions are present worldwide, not just for the United States',()=>{
 for(const [id,name] of [['CA','Ontario'],['CA','Quebec'],['GB','Scotland'],['GB','Wales'],['IN','Maharashtra'],['IN','Ladakh'],['AU','Queensland'],['JP','Tokyo'],['BR','São Paulo'],['DE','Bavaria'],['ZA','Gauteng']])assert(area(id,name),id+': '+name);
 assert(country('US').areas.has('California'));assert.equal(country('US').areas.size,51);
 assert.equal(countries.length,248);assert(countries.every(c=>c.continent&&c.areas.size));
});
test('every available geographic subdivision has usable zones; no areas vanish when clocks match',()=>{
 let matched=0;
 for(const [code,label] of window.SteadyHandsTimezoneAreas.regions){
  const c=country(code.split('.')[0]);if(!c)continue;
  const a=[...c.areas.values()].find(a=>a.label===label);assert(a,code);
  assert(a.zones.length,code);for(const z of a.zones)assert.doesNotThrow(()=>new Intl.DateTimeFormat('en',{timeZone:z.id}));matched++;
 }
 assert(matched>3700);
});
test('multi-timezone provinces retain the choices their populated places use',()=>{
 const ontario=area('CA','Ontario');assert(ontario.zones.some(z=>z.id==='America/Toronto'));assert(ontario.zones.some(z=>z.id==='America/Winnipeg'));
 assert(country('US').areas.get('Arizona').zones.some(z=>z.id==='America/Phoenix'));
 assert(country('US').areas.get('Arizona').zones.some(z=>z.id==='America/Denver'));
});
test('legacy saved areas and IANA aliases remain usable',()=>{
 assert(country('EG').areas.has('Cairo'));
 for(const [zone,id] of [['Asia/Katmandu','NP'],['Asia/Kolkata','IN'],['Europe/Kyiv','UA'],['America/Indianapolis','US']])assert.equal(picker.locate(countries,zone).country,id);
});
test('Outreach legacy action entry points no longer embed questionnaires',()=>{
 for(const path of ['action-needed.html','alreadyoncommission.html','currentlyonhourlywage.html']){
  const html=read(path);assert(!html.includes('actions/js.js'));assert(html.includes('action-needed.js'));
 }
});

test('area-step buttons remain separate and searchable, then require explicit timezone confirmation',()=>{
 let nodes=[],selected;
 const decode=s=>s.replaceAll('&amp;','&').replaceAll('&#39;',"'").replaceAll('&quot;','"');
 const host={set innerHTML(value){
  this.html=value;nodes=[];
  for(const match of value.matchAll(/<button([^>]*)>([\s\S]*?)<\/button>/g)){
   const attrs=match[1];const events={};
   nodes.push({attrs,events,hidden:false,textContent:decode(match[2].replace(/<[^>]+>/g,'')),dataset:{step:attrs.match(/data-step="([^"]+)"/)?.[1],value:decode(attrs.match(/data-value="([^"]+)"/)?.[1]||'')},addEventListener:(k,f)=>events[k]=f});
  }
  for(const id of ['zone-area-search','zone-area-empty','zone-heading'])if(value.includes('id="'+id+'"'))nodes.push({id,value:'',hidden:true,events:{},addEventListener(k,f){this.events[k]=f},focus(){}});
 },get innerHTML(){return this.html},querySelectorAll(selector){return nodes.filter(n=>selector==='[data-step]'?n.dataset?.step:n.attrs?.includes('zone-card'))},querySelector(selector){return nodes.find(n=>n.id===selector.slice(1))}};
 picker.mount(host,'Africa/Cairo',value=>selected=value,new Date('2026-10-19'));
 const choose=value=>{const node=nodes.find(n=>n.dataset?.value===value);assert(node,value);node.events.click();};
 choose('AF');choose('EG');
 assert(host.querySelectorAll('.zone-card').length>=27);assert(host.innerHTML.includes('Alexandria'));
 const search=host.querySelector('#zone-area-search');search.value='alex';search.events.input();
 const visible=host.querySelectorAll('.zone-card').filter(n=>!n.hidden);assert.equal(visible.length,1);assert.equal(visible[0].textContent,'Alexandria');
 choose('Alexandria');assert.equal(selected.confirmed,false);assert.equal(selected.zone,'');
 choose('Africa/Cairo');assert.equal(selected.confirmed,true);assert.equal(selected.area,'Alexandria');
});
