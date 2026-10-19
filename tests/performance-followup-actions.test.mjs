import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../performance-followup-actions.js',import.meta.url),'utf8');
function setup({actor='associate',fail=false,adminSession}={}){
 const writes=[],window={steadyHandsAdminSession:adminSession};
 vm.runInNewContext(source,{window,URLSearchParams,crypto:{randomUUID:()=> 'calendar-id'}});
 const client={
  auth:{async getUser(){return {data:{user:actor?{id:actor}:null}}}},
  from(table){return {async insert(row){writes.push({table,row});return fail?{error:new Error('Write denied')}:{data:[]};}};},
  async rpc(name,args){writes.push({name,args});return fail?{error:new Error('Write denied')}:{data:true};}
 };
 const args={client,lead:{id:'lead',company:'Spiderwash',phone:'555'},userId:'associate',title:'Follow-up: Spiderwash',notes:'Call about preview',date:'2099-10-20T14:30',mode:'task'};
 return {api:window.PerformanceFollowupActions,args,writes};
}
test('Add to tasks writes a linked task owned by the associate, including optional due date',async()=>{
 const p=setup();assert.equal(await p.api.save(p.args),null);
 assert.equal(p.writes.length,1);assert.equal(p.writes[0].table,'outreach_tasks');
 assert.equal(p.writes[0].row.assigned_to,'associate');assert.equal(p.writes[0].row.created_by,'associate');assert.equal(p.writes[0].row.lead_id,'lead');assert.match(p.writes[0].row.due_at,/2099-10-20/);
 const undated=setup();await undated.api.save({...undated.args,date:''});assert.equal(undated.writes[0].row.due_at,null);
});
test('Admin task records the admin as creator and selected associate as owner',async()=>{
 const p=setup({actor:'admin',adminSession:{user:{id:'admin'}}});await p.api.save({...p.args,admin:true});assert.equal(p.writes[0].row.created_by,'admin');assert.equal(p.writes[0].row.assigned_to,'associate');
});
test('Outreach calendar saves an owned scheduled call before returning calendar options',async()=>{
 const p=setup();const options=await p.api.save({...p.args,mode:'calendar'});assert.equal(p.writes[0].table,'callcenter_scheduled_calls');assert.equal(p.writes[0].row.user_id,'associate');assert.equal(p.writes[0].row.crm_id,'lead');assert.match(options.text,/BEGIN:VEVENT/);assert.match(options.google,/calendar.google.com/);assert.match(options.outlook,/outlook.live.com/);
});
test('Admin calendar uses the existing protected assignment RPC for the selected associate',async()=>{
 const p=setup({actor:'admin',adminSession:{user:{id:'admin'}}});await p.api.save({...p.args,mode:'calendar',admin:true});assert.equal(p.writes[0].name,'admin_assign_outreach_followup');assert.equal(p.writes[0].args.p_user_id,'associate');assert.equal(p.writes[0].args.p_lead_id,'lead');
});
test('invalid, past, unauthenticated and other-owner submissions never write',async()=>{
 for(const overrides of [{mode:'calendar',date:''},{mode:'calendar',date:'2020-01-01'},{date:'bad-date'},{title:' '},{userId:null},{userId:'someone-else'},{admin:true}]){
  const p=setup();await assert.rejects(p.api.save({...p.args,...overrides}));assert.equal(p.writes.length,0);
 }
 const p=setup({actor:null});await assert.rejects(p.api.save(p.args),/Sign in/);assert.equal(p.writes.length,0);
});
test('write errors propagate without reporting a saved task or exposing calendar destinations',async()=>{
 const p=setup({fail:true});await assert.rejects(p.api.save({...p.args,mode:'calendar'}),/Write denied/);
});
test('calendar export escapes user text and uses UTC event timestamps',()=>{
 const p=setup(),result=p.api.calendar({title:'Prospect, Inc; \\ Branch\nTitle',notes:'First\nSecond',start:'2099-10-20T14:30:00Z',id:'event'});
 assert.match(result.text,/DTSTART:20991020T143000Z/);assert.match(result.text,/DTEND:20991020T150000Z/);assert(result.text.includes('SUMMARY:Prospect\\, Inc\\; \\\\ Branch\\nTitle'));assert(result.text.includes('DESCRIPTION:First\\nSecond'));
 assert.equal(new URL(result.google).searchParams.get('text'),'Prospect, Inc; \\ Branch\nTitle');
});
test('action buttons escape lead attributes and disable unassigned follow-ups',()=>{
 const p=setup();const html=p.api.buttons({id:'"><script>',callback_owner_id:'own'});assert(!html.includes('<script>'));assert.match(html,/Add to calendar/);assert.match(html,/Add to tasks/);assert.match(p.api.buttons({id:'unassigned'}),/disabled title="Assign this follow-up/);
});
