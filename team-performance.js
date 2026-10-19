/* Authorized, read-only team reporting inside Outreach Performance. */
(() => {
 'use strict';
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const duration=n=>{n=Math.max(0,Math.round(Number(n)||0));return Math.floor(n/60)+'m '+String(n%60).padStart(2,'0')+'s';};
 async function init(){
  const root=document.getElementById('teamPerformanceAccess');
  if(!root||!window.supabase)return;
  const client=window.steadyHandsCRMClient || window.supabase.createClient('https://glonbvrcudwuzjundrii.supabase.co','sb_publishable_VZbed_uuOXSE744UrAfHXw_z2xDdYtr');
  const {data:{session}}=await client.auth.getSession();
  if(!session)return;
  const access=await client.rpc('team_performance_access');
  if(access.error||access.data!==true)return; // Keep personal view for everyone else.
  root.hidden=false;
  root.innerHTML='<section class="sh-performance-panel"><div class="sh-performance-heading"><div><h2>Team Performance</h2><p>Last 7 days · Team activity (read-only)</p></div><button type="button" id="teamPerformanceReload">Refresh</button></div><div id="teamPerformanceReport" role="status">Loading team results…</div></section>';
  root.querySelector('#teamPerformanceReload').addEventListener('click',load);
  async function load(){
   const target=root.querySelector('#teamPerformanceReport');
   target.textContent='Loading team results…';
   const {data,error}=await client.rpc('team_performance_report');
   if(error){target.textContent='Unable to load team performance: '+error.message;return;}
   const associates=Array.isArray(data?.associates)?data.associates:[];
   const days=Array.isArray(data?.daily)?data.daily:[];
   const calls=associates.reduce((n,a)=>n+Number(a.calls||0),0);
   const positive=associates.reduce((n,a)=>n+Number(a.positive||0),0);
   const max=Math.max(1,...days.map(d=>Number(d.calls)||0));
   target.innerHTML='<div class="sh-performance-metrics">'+
     [['Calls Logged',calls],['Positive Outcomes',positive],['Positive Outcome Rate',calls?Math.round(positive*100/calls)+'%':'0%'],['Associates',associates.length]].map(([label,value])=>'<div class="sh-performance-metric"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong></div>').join('')+'</div>'+
    '<div class="sh-performance-chart"><div class="sh-performance-chart-title"><strong>Call Activity</strong><span>Last 7 days</span></div><div class="sh-performance-bars">'+days.map(d=>'<div class="sh-performance-bar-cell"><span>'+esc(d.calls)+'</span><div class="sh-performance-bar-track"><div class="sh-performance-bar" style="height:'+Math.max(Number(d.calls)?7:0,Math.round(100*Number(d.calls||0)/max))+'%"></div></div><small>'+esc(new Date(d.date+'T12:00:00').toLocaleDateString([],{weekday:'short'}))+'</small></div>').join('')+'</div></div>'+
    '<h3 style="margin:18px 0 10px">Associate Performance</h3><div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;text-align:left"><thead><tr><th>Associate</th><th>Calls</th><th>Positive</th><th>Rate</th><th>Avg. duration</th></tr></thead><tbody>'+
    associates.map(a=>'<tr><td>'+esc(a.name)+'</td><td>'+esc(a.calls)+'</td><td>'+esc(a.positive)+'</td><td>'+esc(Number(a.calls)?Math.round(100*Number(a.positive)/Number(a.calls))+'%':'0%')+'</td><td>'+esc(duration(a.avg_seconds))+'</td></tr>').join('')+'</tbody></table></div>'+
    '<p class="sh-performance-disclaimer">Logged outcomes are self-reported, not verified sales. Team access does not grant access to private customer records.</p>';
  }
  await load();
 }
 document.addEventListener('DOMContentLoaded',()=>{init().catch(console.error);});
})();