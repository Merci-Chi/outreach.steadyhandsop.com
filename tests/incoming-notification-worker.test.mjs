import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../sw.js',import.meta.url),'utf8');
test('incoming notification focuses its live call client without navigation or reloading',async()=>{
 const handlers={},messages=[];let focused=false,navigated=false;
 const client={postMessage:message=>messages.push(message),focus:async()=>{focused=true},navigate:async()=>{navigated=true}};
 const self={addEventListener:(name,fn)=>(handlers[name]??=[]).push(fn),clients:{get:async id=>id==='call-tab'?client:null},location:{origin:'https://outreach.steadyhandsop.com'}};
 vm.runInNewContext(source,{self,URL});let waited;
 handlers.notificationclick[0]({notification:{close(){},data:{kind:'incoming-call',clientId:'call-tab'}},waitUntil:promise=>waited=promise});await waited;
 assert.equal(focused,true);assert.equal(navigated,false);assert.equal(messages[0].type,'steadyhands:open-incoming');
});
test('worker binds device call alerts to the source client and closes only that client alerts',async()=>{
 const handlers={};let shown,ownClosed=false,otherClosed=false;
 const self={addEventListener:(name,fn)=>(handlers[name]??=[]).push(fn),registration:{showNotification:async(title,options)=>shown={title,options},getNotifications:async()=>[{data:{clientId:'own'},close(){ownClosed=true}},{data:{clientId:'other'},close(){otherClosed=true}}]}};
 vm.runInNewContext(source,{self});const fn=handlers.message.at(-1);let waited;
 fn({data:{type:'steadyhands:incoming-alert',title:'Incoming call',options:{tag:'steadyhands-incoming-call'}},source:{id:'own'},waitUntil:promise=>waited=promise});await waited;assert.equal(shown.options.data.clientId,'own');
 fn({data:{type:'steadyhands:close-incoming-alert'},source:{id:'own'},waitUntil:promise=>waited=promise});await waited;assert(ownClosed);assert.equal(otherClosed,false);
});

test('server push displays a call alert and a tap opens a closed PWA using only a validated call SID',async()=>{
 const handlers={},shown=[],opened=[];const self={addEventListener:(name,fn)=>(handlers[name]??=[]).push(fn),registration:{showNotification:async(title,options)=>shown.push({title,options})},clients:{matchAll:async()=>[],openWindow:async url=>opened.push(url)},location:{origin:'https://outreach.steadyhandsop.com'}};
 vm.runInNewContext(source,{self,URL});let waited;
 const sid='CA'+'1'.repeat(32);
 handlers.push[0]({data:{json:()=>({kind:'incoming-call',call_sid:sid,expires_at:new Date(Date.now()+60000).toISOString(),title:'Incoming call',url:'https://evil.example'})},waitUntil:promise=>waited=promise});await waited;
 assert.equal(shown[0].options.data.kind,'incoming-call');
 handlers.notificationclick[0]({notification:{close(){},data:shown[0].options.data},waitUntil:promise=>waited=promise});await waited;
 assert.equal(opened[0],'/index.html?incoming='+sid);
 handlers.push[0]({data:{json:()=>({kind:'incoming-call',expires_at:new Date(Date.now()-1).toISOString()})},waitUntil:promise=>waited=promise});assert.equal(shown.length,1);
});
test('server call push focuses an existing PWA without navigating an active call away',async()=>{
 const handlers={},messages=[];let focused=0;const client={url:'https://outreach.steadyhandsop.com/call.html',postMessage:message=>messages.push(message),focus:async()=>focused++};
 const self={addEventListener:(name,fn)=>(handlers[name]??=[]).push(fn),clients:{matchAll:async()=>[client]},location:{origin:'https://outreach.steadyhandsop.com'}};
 vm.runInNewContext(source,{self,URL});let waited;
 handlers.notificationclick[0]({notification:{close(){},data:{kind:'incoming-call',callSid:'CA'+'1'.repeat(32)}},waitUntil:promise=>waited=promise});await waited;
 assert.equal(focused,1);assert.equal(messages[0].type,'steadyhands:open-incoming');
});
