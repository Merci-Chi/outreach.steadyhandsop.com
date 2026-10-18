import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../call-guide.js',import.meta.url),'utf8');
function setup({callPage=true}={}){
 let document;
 class Node {
  constructor(tag){this.tag=tag;this.children=[];this.attributes={};this.dataset={};this.listeners={};this.hidden=false;this.text='';this.className='';this.disabled=false;this.open=false;}
  get textContent(){return this.text+this.children.map(c=>c.textContent).join('');}
  set textContent(value){this.text=String(value);this.children=[];}
  setAttribute(k,v){this.attributes[k]=String(v);if(k==='id')this.id=v;}
  getAttribute(k){return this.attributes[k]??null;}
  removeAttribute(k){delete this.attributes[k];}
  append(...children){for(const node of children){node.parent=this;this.children.push(node);}}
  insertBefore(node,anchor){node.parent=this;this.children.splice(anchor?this.children.indexOf(anchor):this.children.length,0,node);}
  before(node){this.parent.insertBefore(node,this);}
  after(node){node.parent=this.parent;this.parent.children.splice(this.parent.children.indexOf(this)+1,0,node);}
  addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
  dispatch(type,event={}){for(const fn of this.listeners[type]||[])fn(event);}
  click(){if(!this.disabled)this.dispatch('click',{preventDefault(){}});}
  focus(){document.activeElement=this;}
  showModal(){this.open=true;this.focus();}
  close(){if(!this.open)return;this.open=false;this.dispatch('close');}
  querySelectorAll(selector){
   const match=node=>selector.startsWith('#')?node.id===selector.slice(1):selector.startsWith('.')?node.className.split(' ').includes(selector.slice(1)):selector==='[data-opener]'?node.dataset.opener!==undefined:selector==='[aria-expanded="true"]'?node.getAttribute('aria-expanded')==='true':node.tag===selector;
   const nodes=this.children.flatMap(child=>[child,...child.querySelectorAll('*')]);
   if(selector==='*')return nodes;
   if(selector==='ol > li')return nodes.filter(n=>n.tag==='li'&&n.parent.tag==='ol');
   return nodes.filter(match);
  }
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
 }
 const root=new Node('main'),process=new Node('aside'),header=new Node('header'),title=new Node('h2'),progress=new Node('span'),fieldset=new Node('fieldset'),ol=new Node('ol'),selected=new Node('div'),back=new Node('nav'),backButton=new Node('button');
 progress.id='processProgress';fieldset.id='processSteps';fieldset.disabled=true;back.className='call-back-nav';backButton.textContent='Back to Outreach';back.append(backButton);
 header.append(title,progress);process.append(header,fieldset);fieldset.append(ol);root.append(back,process,selected);
 for(const label of ['Explain the process','Offer a preview and references','Collect a textable number','Finish the call','Send to development team','Await status from the development team']){
  const li=new Node('li'),strong=new Node('strong'),check=new Node('input');strong.textContent=label;check.checked=false;li.append(strong,check);ol.append(li);
 }
 root.classList={contains:name=>callPage&&name==='page-call'};
 document={createElement:tag=>new Node(tag),getElementById:id=>root.querySelector('#'+id),querySelector:selector=>selector==='#selectedLeadTop'?selected:selector==='.call-back-nav'?(callPage?back:null):root.querySelector(selector),body:root};
 const listeners={},window={addEventListener(type,fn){(listeners[type]??=[]).push(fn);}};let lead='one',observer;
 vm.runInNewContext(source,{window,document,MutationObserver:class{constructor(fn){observer=fn;}observe(){}}});window.SteadyHandsCallGuide.mount({process,leadId:()=>lead});
 const dispatch=(type,detail)=>{for(const fn of listeners[type]||[])fn({detail});};
 return {root,process,header,fieldset,ol,back,backButton,document,dispatch,changeLead(id){lead=id;observer();},pills:root.querySelectorAll('.call-stage-pill'),cards:root.querySelectorAll('.call-guide-card'),dialog:root.querySelector('#call-conversation-popup'),stageNext:root.querySelector('.call-popup-nav').children[2],stagePrevious:root.querySelector('.call-popup-nav').children[0],next:root.querySelector('.workflow-step-nav').children[1],previous:root.querySelector('.workflow-step-nav').children[0]};
}

test('call opens in the opener popup; both location-neutral openers switch in place',()=>{
 const s=setup(),card=s.cards[0],buttons=card.querySelectorAll('[data-opener]');
 assert(s.dialog.open);assert.equal(s.cards.filter(c=>!c.hidden).length,1);assert.equal(s.fieldset.hidden,false);assert(s.stagePrevious.disabled);
 assert.match(card.querySelector('blockquote').textContent,/This is a cold call/);
 buttons[1].click();assert.match(card.querySelector('blockquote').textContent,/Did I get that right/);assert.equal(buttons[1].getAttribute('aria-pressed'),'true');
 assert.equal(s.pills[0].getAttribute('aria-current'),'step');
 for(const button of buttons){button.click();assert.doesNotMatch(card.querySelector('blockquote').textContent,/Las Vegas|local businesses/i);}
 assert.equal(s.process.querySelector('.call-guide'),null);
});
test('six stage pills open popups and the seventh opens Process instead of a separate close script',()=>{
 const s=setup();assert.equal(s.pills.length,7);assert.equal(s.pills[6].textContent,'7. Process');assert.equal(s.back.children[0],s.backButton);
 for(let i=0;i<6;i++){
  s.pills[i].click();assert(s.dialog.open);assert.equal(s.cards[i].hidden,false);assert.equal(s.pills[i].getAttribute('aria-current'),'step');
 }
 assert.equal(s.stageNext.textContent,'Continue to Process →');s.stageNext.click();
 assert.equal(s.dialog.open,false);assert.equal(s.pills[6].getAttribute('aria-current'),'step');assert.equal(s.ol.children[0].hidden,false);
 s.pills[2].click();assert(s.dialog.open);s.stagePrevious.click();assert.equal(s.cards[1].hidden,false);
 s.pills[6].click();assert.equal(s.dialog.open,false);assert.equal(s.fieldset.hidden,false);
});
test('popup Next reaches Process; Process Next/Previous only navigate its six manual checks',()=>{
 const s=setup();for(let i=0;i<6;i++)s.stageNext.click();assert.equal(s.dialog.open,false);assert(s.previous.disabled);
 for(let i=1;i<6;i++){s.next.click();assert.equal(s.ol.children[i].hidden,false);}
 assert(s.next.disabled);assert.match(s.header.querySelector('.call-step-status').textContent,/6 \/ 6/);
 s.previous.click();assert.equal(s.ol.children[4].hidden,false);
 s.pills[0].click();s.pills[6].click();assert.equal(s.ol.children[4].hidden,false);
 assert(s.ol.children.every(li=>li.querySelector('input').checked===false));assert(s.fieldset.disabled);
});
test('objection links open modal responses and closing returns focus without changing the Process step',()=>{
 const s=setup();s.pills[6].click();s.next.click();s.next.click();
 const links=s.header.querySelectorAll('a'),response=s.root.querySelector('#call-objection-response');assert.equal(links.length,3);assert.equal(s.process.querySelector('.call-objection-responses'),null);
 for(const [i,pattern] of [/mornings or afternoons/,/rather be straight/,/something worth reading/].entries()){
  links[i].click();assert(response.open);assert.match(response.querySelector('blockquote').textContent,pattern);assert.equal(links[i].getAttribute('aria-haspopup'),'dialog');
  assert.equal(s.ol.children[2].hidden,false);assert.equal(links[i].getAttribute('aria-expanded'),'true');
  response.querySelector('.call-objection-close').click();assert.equal(response.open,false);assert.equal(s.document.activeElement,links[i]);
 }
 links[0].click();response.close();assert.equal(links[0].getAttribute('aria-expanded'),'false');assert.equal(s.document.activeElement,links[0]);
});
test('objections also open from conversation popups and return to the same conversation stage',()=>{
 const s=setup();s.pills[3].click();const link=s.dialog.querySelectorAll('a')[2],response=s.root.querySelector('#call-objection-response');
 link.click();assert(response.open);assert(s.dialog.open);response.close();assert.equal(s.document.activeElement,link);assert.equal(s.cards[3].hidden,false);
 s.dialog.querySelector('.call-popup-close').click();assert.equal(s.dialog.open,false);assert.equal(s.pills[6].getAttribute('aria-current'),'step');
});
test('new leads restart the opener and Process; textable-number shortcut opens checklist step three',()=>{
 const s=setup();s.pills[6].click();s.next.click();s.next.click();s.changeLead('two');assert(s.dialog.open);assert.equal(s.pills[0].getAttribute('aria-current'),'step');assert.equal(s.ol.children[0].hidden,false);
 s.dispatch('steadyhands:call-guide-step',{checklistStep:3});assert.equal(s.dialog.open,false);assert.equal(s.pills[6].getAttribute('aria-current'),'step');assert.equal(s.ol.children[2].hidden,false);
 s.dispatch('steadyhands:call-guide-step',{checklistStep:20});assert.equal(s.ol.children[2].hidden,false);
});
test('Outreach overview keeps its checklist; regular-call mode opens the guide as a popup',()=>{
 const s=setup({callPage:false});assert.equal(s.dialog.open,false);assert(s.ol.children.every(li=>!li.hidden));
 s.dispatch('steadyhands:process-mode',{guided:true});assert(s.dialog.open);
 s.dispatch('steadyhands:process-mode',{guided:false});assert.equal(s.dialog.open,false);assert.equal(s.fieldset.hidden,false);assert(s.ol.children.every(li=>!li.hidden));
});
test('both workspaces load the guide before workflow initialization',async()=>{
 for(const name of ['call.html','index.html']){const html=await readFile(new URL('../'+name,import.meta.url),'utf8');assert(html.indexOf('call-guide.js?')<html.indexOf('outreach-workflow.js?'));}
});
