import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../action-needed.js',import.meta.url),'utf8');
class Element{
 constructor(tag){this.tag=tag;this.children=[];this.events={};this.textContent='';}
 appendChild(child){this.children.push(child);}
 replaceChildren(...children){this.children=children;}
 setAttribute(){}
 addEventListener(event,fn){this.events[event]=fn;}
}
test('every action displays its dates; each open button targets only its action',async()=>{
 const main=new Element('main'),opened=[];let init;
 const rows=[{id:'one',status:'assigned',assigned_at:'2026-10-18T12:00:00Z'},{id:'two',status:'assigned',assigned_at:'2026-10-19T12:00:00Z'},{id:'done',status:'completed',assigned_at:'2026-10-17T12:00:00Z',completed_at:'2026-10-17T13:00:00Z'}];
 const window={OutreachActions:{list:async()=>rows},OutreachQuestionnaire:{open:async options=>opened.push(options)}};
 const document={getElementById:()=>main,createElement:tag=>new Element(tag),addEventListener(event,callback){init=callback;}};
 vm.runInNewContext(source,{window,document,URLSearchParams,location:{search:''},Intl,Date});await init();
 const cards=main.children.filter(x=>x.tag==='section');assert.equal(cards.length,3);
 for(const card of cards)assert(card.children.some(x=>x.children.some(y=>y.tag==='time')));
 assert.equal(cards[2].children.filter(x=>x.tag==='button').length,0);
 await cards[0].children.find(x=>x.tag==='button').events.click();
 await cards[1].children.find(x=>x.tag==='button').events.click();
 assert.deepEqual(opened.map(x=>x.assignmentId),['one','two']);
});
