/* Admin Performance transcript exports. Timestamps are displayed only when recorded. */
(()=>{
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const stamp=v=>{if(v===null||v===undefined||v==='')return '';const d=new Date(v);return Number.isNaN(d.getTime())?'':d.toLocaleString();};
const clock=v=>{const n=Number(v);if(!Number.isFinite(n)||n<0)return '';const t=Math.floor(n);return String(Math.floor(t/3600)).padStart(2,'0')+':'+String(Math.floor(t%3600/60)).padStart(2,'0')+':'+String(t%60).padStart(2,'0');};
const who=s=>({agent:'Sales Associate',customer:'Customer'}[String(s||'').toLowerCase()]||String(s||'Speaker'));
function messageTime(s,t){
  const iso=s.timestamp||s.started_at||s.start_time||s.time_iso||s.absolute_time;
  if(iso&&typeof iso==='string'&&!/^\d+(?:\.\d+)?$/.test(iso)){const x=stamp(iso);if(x)return x;}
  const raw=s.start_ms??s.offset_ms??s.start_seconds??s.startSeconds??s.start_offset_seconds??s.offset_seconds??s.start??s.offset??s.time;
  if(raw===null||raw===undefined||raw==='')return '';
  if(typeof raw==='string'&&raw.includes(':'))return raw;
  const n=Number(raw);if(!Number.isFinite(n)||n<0)return '';
  // Millisecond offsets are explicitly named; otherwise interpret as seconds.
  const sec=s.start_ms!==undefined?Number(s.start_ms)/1000:s.offset_ms!==undefined?Number(s.offset_ms)/1000:n;
  if(t?.started_at&&Number.isFinite(sec)){const base=new Date(t.started_at);if(!Number.isNaN(base.getTime()))return new Date(base.getTime()+sec*1000).toLocaleTimeString();}
  return clock(sec);
}
function messages(t){
  if(Array.isArray(t?.segments)&&t.segments.length)return t.segments.filter(s=>String(s?.text||'').trim()).map(s=>({speaker:who(s.speaker),time:messageTime(s,t),text:String(s.text)}));
  return String(t?.transcript||'').trim()?[{speaker:'Conversation',time:'',text:String(t.transcript)}]:[];
}
const safeName=v=>String(v||'Call').replace(/[^a-z0-9._-]+/gi,'_').slice(0,75);
const file=(blob,name)=>{const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);};
function textCall(c,metadata=true){
 const meta=metadata?['Lead: '+(c.lead||'Unknown'),'Associate: '+(c.associate||'Unknown'),'Date: '+(stamp(c.date)||'—'),'Outcome: '+(c.outcome||'—'),'Duration: '+(c.duration??'—')].join('\n')+'\n\n':'';
 return meta+messages(c.transcript).map(m=>(m.time?'['+m.time+'] ':'')+m.speaker+': '+m.text).join('\n\n')+'\n';
}
function csv(calls,metadata){
 const rows=[['Call ID','Associate','Lead','Date','Outcome','Duration (seconds)','Speaker','Message time','Message']];
 for(const c of calls){const ms=messages(c.transcript);for(const m of ms.length?ms:[{speaker:'',time:'',text:''}])rows.push([c.id,metadata?c.associate:'',metadata?c.lead:'',metadata?stamp(c.date):'',metadata?c.outcome:'',metadata?c.duration:'',m.speaker,m.time,m.text]);}
 return '\ufeff'+rows.map(row=>row.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');
}
// Generate an actual PDF download, independent of Safari's print CSS and scaling.
let pdfLibraryPromise;
function loadPdfLibrary(){
 if(window.jspdf?.jsPDF)return Promise.resolve(window.jspdf.jsPDF);
 if(!pdfLibraryPromise)pdfLibraryPromise=new Promise((resolve,reject)=>{
  const script=document.createElement('script');
  script.src='vendor/jspdf-2.5.2.umd.min.js';
  const timer=setTimeout(()=>{script.remove();reject(Error('PDF library timed out. Please retry.'));},15000);
  script.onload=()=>{clearTimeout(timer);window.jspdf?.jsPDF?resolve(window.jspdf.jsPDF):reject(Error('PDF library unavailable.'));};
  script.onerror=()=>{clearTimeout(timer);script.remove();reject(Error('Could not load the PDF library. Refresh the page and retry.'));};
  document.head.appendChild(script);
 }).catch(error=>{pdfLibraryPromise=null;throw error;});
 return pdfLibraryPromise;
}
async function downloadPdf(calls,metadata){
 const JsPDF=await loadPdfLibrary();
 const pdf=new JsPDF({unit:'mm',format:'letter',orientation:'portrait',compress:true});
 const width=215.9,height=279.4,left=12,right=12,bottom=13,contentWidth=width-left-right;
 let y=12;
 const navy=[24,48,71],muted=[87,102,121],blue=[21,63,121];
 const plain=value=>String(value??'').replace(/[‘’]/g,"'").replace(/[–—]/g,'-').replace(/…/g,'...');
 const line=(value,x,at,size=9,color=navy,style='normal')=>{
  pdf.setFont('helvetica',style);pdf.setFontSize(size);pdf.setTextColor(...color);
  pdf.text(plain(value),x,at);
 };
 function space(required){if(y+required>height-bottom){pdf.addPage();y=12;}}
 function wrapped(value,x,indent,size=9,color=navy,style='normal',leading=4.4){
  pdf.setFont('helvetica',style);pdf.setFontSize(size);
  const lines=pdf.splitTextToSize(plain(value),contentWidth-indent);
  for(const item of lines){space(leading);line(item,x,y,size,color,style);y+=leading;}
 }
 line('STEADY HANDS',left,y,11,navy,'bold');y+=6;
 line('C A L L   T R A N S C R I P T   R E P O R T',left,y,8,muted);y+=5;
 pdf.setDrawColor(...navy);pdf.setLineWidth(.35);pdf.line(left,y,width-right,y);y+=9;
 for(const c of calls){
  space(metadata?19:12);
  line(c.lead||'Call',left,y,12,navy,'bold');y+=5.5;
  if(metadata){
   const info='Associate: '+(c.associate||'-')+' | '+(stamp(c.date)||'-')+' | '+(c.outcome||'-')+' | '+(c.duration??'-')+' seconds';
   wrapped(info,left,0,8,muted,'normal',3.8);y+=3;
  }
  const items=messages(c.transcript);
  if(!items.length){space(5);line('No saved transcript.',left,y,8,muted);y+=5;}
  for(const m of items){
   // Split long messages across pages while keeping short entries together.
   pdf.setFont('helvetica','normal');pdf.setFontSize(9);
   const rows=pdf.splitTextToSize(plain(m.text),contentWidth);
   const required=5+Math.min(rows.length,3)*4.4;
   space(required);
   line(m.speaker,left,y,9,blue,'bold');
   const speakerWidth=pdf.getTextWidth(plain(m.speaker));
   if(m.time)line(m.time,left+speakerWidth+3,y,7.5,muted);
   y+=4.5;
   for(const txt of rows){space(4.3);line(txt,left,y,9,navy);y+=4.3;}
   space(2);
   pdf.setDrawColor(226,231,237);pdf.setLineWidth(.17);pdf.line(left,y,width-right,y);y+=3.5;
  }
  y+=5;
 }
 pdf.save('steady-hands-transcripts-'+new Date().toISOString().slice(0,10)+'.pdf');
}

const pngWidth=1200,pngHeight=1550,pngMargin=66;
function createPngPages(calls,metadata){
 const pages=[];let canvas,ctx,y;
 const colors={navy:'#183047',muted:'#576679',blue:'#153f79',rule:'#e2e7ed'};
 function page(){canvas=document.createElement('canvas');canvas.width=pngWidth;canvas.height=pngHeight;ctx=canvas.getContext('2d');if(!ctx)throw Error('Canvas unavailable.');ctx.fillStyle='#fff';ctx.fillRect(0,0,pngWidth,pngHeight);pages.push(canvas);y=pngMargin;}
 function ensure(h){if(y+h>pngHeight-pngMargin)page();}
 function font(size,bold=false){ctx.font=(bold?'bold ':'')+size+'px Arial, sans-serif';}
 function line(text,size=21,bold=false,color=colors.navy,indent=0){
  ensure(size*1.4);font(size,bold);ctx.fillStyle=color;ctx.fillText(String(text??''),pngMargin+indent,y);y+=Math.round(size*1.4);
 }
 function wrap(text,size=21,bold=false,color=colors.navy,indent=0){
  font(size,bold);const maxWidth=pngWidth-pngMargin*2-indent;
  const tokens=String(text??'').split(/(\\s+)/);let current='';
  for(const token of tokens){
   const next=current+token;
   if(ctx.measureText(next).width>maxWidth&&current.trim()){line(current.trimEnd(),size,bold,color,indent);current=token.trimStart();}
   else current=next;
   // Very long unbroken words are split at character boundaries.
   while(current&&ctx.measureText(current).width>maxWidth){
    let n=1;while(n<current.length&&ctx.measureText(current.slice(0,n+1)).width<=maxWidth)n++;
    line(current.slice(0,n),size,bold,color,indent);current=current.slice(n);
   }
  }
  if(current.trim())line(current.trimEnd(),size,bold,color,indent);
 }
 function rule(){ensure(12);ctx.strokeStyle=colors.rule;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(pngMargin,y);ctx.lineTo(pngWidth-pngMargin,y);ctx.stroke();y+=13;}
 page();line('STEADY HANDS',27,true);line('C A L L   T R A N S C R I P T   R E P O R T',17,false,colors.muted);rule();y+=15;
 for(const c of calls){
  ensure(metadata?95:50);wrap(c.lead||'Call',29,true);y+=2;
  if(metadata){wrap('Associate: '+(c.associate||'-')+' | '+(stamp(c.date)||'-')+' | '+(c.outcome||'-')+' | '+(c.duration??'-')+' seconds',17,false,colors.muted);y+=13;}
  const entries=messages(c.transcript);
  if(!entries.length){line('No saved transcript.',19,false,colors.muted);}
  for(const m of entries){
   ensure(90);line(m.speaker+(m.time?'   '+m.time:''),20,true,colors.blue);
   wrap(m.text,21);y+=4;rule();
  }
  y+=22;
 }
 return pages;
}
let zipLibraryPromise;
function loadZipLibrary(){
 if(window.JSZip)return Promise.resolve(window.JSZip);
 if(!zipLibraryPromise)zipLibraryPromise=new Promise((resolve,reject)=>{
  const script=document.createElement('script');
  script.src='https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
  script.onload=()=>window.JSZip?resolve(window.JSZip):reject(Error('ZIP library unavailable.'));
  script.onerror=()=>reject(Error('Could not load ZIP library.'));
  document.head.appendChild(script);
 }).catch(e=>{zipLibraryPromise=null;throw e;});
 return zipLibraryPromise;
}
async function downloadPng(calls,metadata){
 const pages=createPngPages(calls,metadata);
 const basename='steady-hands-transcripts-'+new Date().toISOString().slice(0,10);
 const toBlob=canvas=>new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('PNG encoding failed.')),'image/png'));
 if(pages.length===1){file(await toBlob(pages[0]),basename+'.png');return;}
 const JSZip=await loadZipLibrary(),zip=new JSZip();
 for(let i=0;i<pages.length;i++)zip.file(basename+'-page-'+String(i+1).padStart(3,'0')+'.png',await toBlob(pages[i]));
 file(await zip.generateAsync({type:'blob',compression:'DEFLATE'}),basename+'-png-pages.zip');
}
function exportCalls(calls,format,metadata){
 if(!calls.length)throw Error('No matching transcripts to export.');
 if(format==='pdf')return downloadPdf(calls,metadata);
 if(format==='png')return downloadPng(calls,metadata);
 const basename='steady-hands-transcripts-'+new Date().toISOString().slice(0,10);
 if(format==='csv')file(new Blob([csv(calls,metadata)],{type:'text/csv;charset=utf-8'}),basename+'.csv');
 else file(new Blob([calls.map(c=>textCall(c,metadata)).join('\n\n'+ '='.repeat(60)+'\n\n')],{type:'text/plain;charset=utf-8'}),basename+'.txt');
}
async function hydrate(rows){
 const client=window.steadyHandsCRMClient;if(!client)throw Error('CRM is unavailable.');
 const ids=[...new Set(rows.map(r=>String(r.id)).filter(Boolean))],transcripts=new Map();
 for(let i=0;i<ids.length;i+=75){
   // Fetch newest transcript for each call; never assume the initial 100 visible calls is the full dataset.
   const {data,error}=await client.from('callcenter_transcripts').select('id,call_activity_id,transcript,segments,started_at,created_at').in('call_activity_id',ids.slice(i,i+75)).order('created_at',{ascending:false});
   if(error)throw error;
   for(const t of data||[])if(!transcripts.has(String(t.call_activity_id)))transcripts.set(String(t.call_activity_id),t);
 }
 return rows.map(r=>({...r,transcript:transcripts.get(String(r.id))||null}));
}
function showBulk(rows){
 const overlay=document.createElement('div');overlay.className='performance-detail-overlay';
 overlay.innerHTML='<section class="performance-export-dialog" role="dialog" aria-modal="true" aria-label="Export transcripts"><div class="performance-export-header"><h2>Export Transcripts</h2><button type="button" data-close aria-label="Close">✕</button></div><p>Export transcripts for your current Performance filters, or all associates.</p><label>Calls to export<select data-scope><option value="filtered">Current Performance filters</option><option value="all">All associates</option></select></label><label>Date range<select data-range><option value="current">Current date filter</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="all">All time</option></select></label><label>Format<select data-format><option value="pdf">PDF (Direct download, compact layout)</option><option value="png">PNG images (continuous report)</option><option value="csv">CSV spreadsheet</option><option value="txt">Plain text (TXT)</option></select></label><label class="performance-export-check"><input type="checkbox" data-meta checked> Include associate, lead, date, duration and outcome</label><label class="performance-export-check"><input type="checkbox" data-empty> Include calls without transcripts</label><p data-count role="status"></p><button class="performance-export-submit" data-export type="button">Export Transcripts</button></section>';
 const dlg=overlay.querySelector('section'),close=()=>overlay.remove();
 const btn=overlay.querySelector('[data-export]'),count=overlay.querySelector('[data-count]');
 const choose=()=>{const scope=overlay.querySelector('[data-scope]').value,range=overlay.querySelector('[data-range]').value, now=Date.now();return (scope==='filtered'?rows.filtered:rows.all).filter(r=>{if(range==='current'||range==='all')return true;return new Date(r.created_at).getTime()>=now-Number(range)*86400000;});};
 const refresh=()=>{count.textContent=choose().length+' calls match the selection; calls without saved transcripts are excluded by default.';};
 overlay.querySelector('[data-close]').onclick=close;overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
 overlay.querySelectorAll('select').forEach(el=>el.addEventListener('change',refresh));
 btn.onclick=async()=>{const format=overlay.querySelector('[data-format]').value;btn.disabled=true;count.textContent='Preparing transcript export…';try{let calls=await hydrate(choose());if(!overlay.querySelector('[data-empty]').checked)calls=calls.filter(c=>messages(c.transcript).length);await exportCalls(calls,format,overlay.querySelector('[data-meta]').checked);count.textContent='Exported '+calls.length+' call(s)'+(format==='pdf'?' as one compact PDF.':format==='png'?' as PNG (one image or a ZIP of numbered images).':'.');}catch(e){count.textContent='Export failed: '+(e.message||e);}finally{btn.disabled=false;}};
 document.body.append(overlay);refresh();dlg.querySelector('[data-close]').focus();
}
window.SteadyHandsTranscriptExport={
 history:async(client,crmId,userId)=>{
  if(!crmId)return {data:[],error:null};
  const rows=[];
  for(let offset=0;;offset+=200){
   let query=client.from('callcenter_transcripts').select('id,call_activity_id,company,transcript,segments,started_at,ended_at,created_at').eq('crm_id',crmId);
   if(userId)query=query.eq('user_id',userId);
   const {data,error}=await query.order('created_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+199);
   if(error)return {data:[],error};
   rows.push(...(data||[]));
   if(!data||data.length<200)return {data:rows,error:null};
  }
 },
 previous:(transcript,lead)=>{
  const start=new Date(transcript.started_at),end=new Date(transcript.ended_at);
  const duration=transcript.started_at&&transcript.ended_at&&end>=start?(end-start)/1000:undefined;
  return window.SteadyHandsTranscriptExport.single({id:transcript.call_activity_id||transcript.id,lead:transcript.company||lead,date:transcript.started_at||transcript.created_at,duration},transcript);
 },
 bulk:(all,filtered)=>showBulk({all,filtered}),
 single:(call,transcript)=>{const c={id:call.id,associate:call.associate,lead:call.lead,date:call.date,outcome:call.outcome,duration:call.duration,transcript};if(!messages(transcript).length)return alert('No transcript was saved for this call.');const format=prompt('Export transcript format: PDF, PNG, CSV, or TXT','PDF');if(!format)return;const f=format.trim().toLowerCase();if(!['pdf','png','csv','txt'].includes(f))return alert('Choose PDF, PNG, CSV, or TXT.');return exportCalls([c],f,true)?.catch?.(e=>alert(e.message||e));},
 time:messageTime
};
})();
