/* Permission-gated team/associate selector; aggregate reports only. */
(() => {
'use strict';
const escapeHTML = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const duration = n => { const s=Math.max(0,Math.round(Number(n)||0));return Math.floor(s/60)+'m '+String(s%60).padStart(2,'0')+'s'; };
async function init() {
 const slot=document.getElementById('teamPerformanceAccess');
 const personal=document.querySelector('#personalPerformanceContent');
 if(!slot||!personal)return;
 const client=window.steadyHandsCRMClient;
 if(!client)return;
 const {data:access,error:accessError}=await client.rpc('team_performance_access');
 if(accessError||access!==true)return;
 slot.hidden=false;
 slot.innerHTML='<div class="sh-team-select"><label for="teamPerformanceSelect">View performance</label><select id="teamPerformanceSelect" aria-label="View performance"><option value="me">My Performance</option><option value="team">Team Performance</option></select><button id="teamPerformanceRefresh" type="button">Refresh</button></div><section id="teamPerformanceReport" class="sh-performance-panel" role="region" aria-live="polite" hidden></section>';
 const select=slot.querySelector('select'),panel=slot.querySelector('#teamPerformanceReport');
 const refresh=slot.querySelector('#teamPerformanceRefresh');
 let report=null;
 async function getReport(force=false){
  if(report&&!force)return report;
  panel.textContent='Loading team performance…';
  const response=await client.rpc('team_performance_report');
  if(response.error)throw response.error;
  report=response.data;
  const associates=Array.isArray(report?.associates)?report.associates:[];
  select.querySelectorAll('option[data-associate]').forEach(o=>o.remove());
  associates.forEach(a=>{const option=document.createElement('option');option.value='associate:'+a.user_id;option.textContent=a.name||'Associate';option.dataset.associate='true';select.append(option);});
  return report;
 }
 function stat(label,value){return '<div class="sh-performance-metric"><span>'+escapeHTML(label)+'</span><strong>'+escapeHTML(value)+'</strong></div>';}
 function showStats(title,calls,positive,avgSeconds,days,extra=''){
  const max=Math.max(1,...days.map(d=>Number(d.calls)||0));
  panel.innerHTML='<div class="sh-performance-heading"><div><h2>'+escapeHTML(title)+'</h2><p>Last 7 days · Recorded call activity</p></div></div>'+
    '<div class="sh-performance-metrics">'+stat('Calls Logged',calls)+stat('Positive Outcomes',positive)+stat('Positive Outcome Rate',calls?Math.round(positive*100/calls)+'%':'0%')+stat('Avg. Logged Duration',duration(avgSeconds))+'</div>'+
    '<div class="sh-performance-chart"><div class="sh-performance-chart-title"><strong>Call Activity</strong><span>Last 7 days</span></div><div class="sh-performance-bars">'+days.map(d=>'<div class="sh-performance-bar-cell"><span>'+escapeHTML(d.calls)+'</span><div class="sh-performance-bar-track"><div class="sh-performance-bar" style="height:'+Math.max(Number(d.calls)?7:0,Math.round(Number(d.calls)*100/max))+'%"></div></div><small>'+escapeHTML(new Date(d.date+'T12:00:00').toLocaleDateString([],{weekday:'short'}))+'</small></div>').join('')+'</div></div>'+
    extra+'<p class="sh-performance-disclaimer">Logged outcomes are self-reported, not verified sales. Access is read-only.</p>';
 }
 async function show(){
  const value=select.value;
  if(value==='me'){panel.hidden=true;personal.hidden=false;return;}
  panel.hidden=false;personal.hidden=true;
  try{
   const data=await getReport();
   const members=Array.isArray(data?.associates)?data.associates:[];
   const days=Array.isArray(data?.daily)?data.daily:[];
   if(value==='team'){
    const calls=members.reduce((n,a)=>n+Number(a.calls||0),0),positive=members.reduce((n,a)=>n+Number(a.positive||0),0);
    const extra='<h3>Associate performance</h3><div style="overflow-x:auto"><table class="sh-team-table"><thead><tr><th>Associate</th><th>Calls</th><th>Positive</th><th>Rate</th></tr></thead><tbody>'+members.map(a=>'<tr><td>'+escapeHTML(a.name)+'</td><td>'+escapeHTML(a.calls)+'</td><td>'+escapeHTML(a.positive)+'</td><td>'+escapeHTML(Number(a.calls)?Math.round(100*Number(a.positive)/Number(a.calls))+'%':'0%')+'</td></tr>').join('')+'</tbody></table></div>';
    showStats('Team Performance',calls,positive,0,days,extra);
    // Average duration for the whole team is a weighted average, not an average of averages.
    const avg=calls?Math.round(members.reduce((n,a)=>n+Number(a.avg_seconds||0)*Number(a.calls||0),0)/calls):0;
    const metric=panel.querySelectorAll('.sh-performance-metric strong')[3];
    if(metric)metric.textContent=duration(avg);
   }else{
    const member=members.find(a=>'associate:'+a.user_id===value);
    if(!member){panel.textContent='Associate not found.';return;}
    // Use the aggregate RPC for individual totals; it intentionally does not expose other users' customer-level calls.
    showStats(member.name+' — Performance',Number(member.calls)||0,Number(member.positive)||0,member.avg_seconds||0,[]);
    panel.querySelector('.sh-performance-chart')?.remove();
   }
  }catch(e){panel.textContent='Unable to load team performance: '+(e.message||'Try again.');}
 }
 select.addEventListener('change',show);
 refresh.addEventListener('click',async()=>{report=null;await show();});
 try{await getReport();select.value='team';await show();}catch(e){panel.hidden=false;personal.hidden=true;panel.textContent='Unable to load team performance: '+(e.message||'Please retry.');}
}
window.steadyHandsInitTeamPerformance=()=>init().catch(console.error);
})();