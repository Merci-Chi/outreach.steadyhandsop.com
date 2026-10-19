import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read = name => readFileSync(new URL('../'+name, import.meta.url),'utf8');
function screen({number='+12125550101', timezone='', saved=null, now='2026-10-19T14:00:00Z'}={}) {
  const nodes=Object.fromEntries(['refLocalTime','refCompany','refPhone','refStatus','refEndCall'].map(id=>[id,{textContent:'',dataset:{}}]));
  const window={dispatchEvent(){}};
  class Clock extends Date { constructor(...args){super(...(args.length?args:[now]));} }
  const context=vm.createContext({window,Date:Clock,Intl,URLSearchParams,Event:class {},
    location:{search:'?'+new URLSearchParams({crm_id:'chosen',number,timezone})},
    sessionStorage:{getItem:()=>JSON.stringify(saved)},setInterval(){},
    document:{readyState:'complete',querySelector:s=>nodes[s.slice(1)]||null}});
  // Follow the actual call page's script order: no app.js or CRM load.
  const scripts=[...read('call.html').matchAll(/<script[^>]*src="([^"]+)"[^>]*>/g)].map(m=>m[1].split('?')[0]);
  assert.ok(scripts.indexOf('lead-timezone.js')<scripts.indexOf('call-reference.js'));
  assert.ok(!scripts.includes('app.js'));
  for(const path of scripts.filter(p=>['lead-timezone.js','call-reference.js'].includes(p))) vm.runInContext(read(path),context);
  return nodes;
}
test('standalone call screen resolves a formatted phone area code without a CRM timezone',()=>{
  const nodes=screen({number:'+1 (212) 555-0101'});
  assert.match(nodes.refLocalTime.textContent,/10:00 AM EDT/);
  assert.equal(nodes.refStatus.textContent,'Ready to call');
});
test('area code controls both clock and calling hours',()=>{
  const nodes=screen({number:'(702) 555-0101'});
  assert.match(nodes.refLocalTime.textContent,/7:00 AM PDT/);
  assert.equal(nodes.refStatus.textContent,'Outside of recommended calling hours');
});
test('valid stored timezone takes precedence and invalid stored timezone falls back to the area code',()=>{
  assert.match(screen({timezone:'America/Los_Angeles'}).refLocalTime.textContent,/7:00 AM PDT/);
  assert.match(screen({timezone:'America/Invalid'}).refLocalTime.textContent,/10:00 AM EDT/);
});
test('clock observes winter daylight saving rules and Arizona fixed time',()=>{
  assert.match(screen({now:'2026-12-14T14:00:00Z'}).refLocalTime.textContent,/9:00 AM EST/);
  assert.match(screen({number:'6025550101'}).refLocalTime.textContent,/7:00 AM MST/);
});
test('matching session handoff supplies the phone when URL data is missing',()=>{
  const nodes=screen({number:'',saved:{id:'chosen',number:'3125550101'}});
  assert.match(nodes.refLocalTime.textContent,/9:00 AM CDT/);
  assert.equal(nodes.refStatus.textContent,'Ready to call');
});
