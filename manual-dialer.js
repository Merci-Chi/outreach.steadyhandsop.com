/* Shared manual dialer for Outreach. The existing protected Twilio workflow remains authoritative. */
(()=>{'use strict';
const $=(s,r=document)=>r.querySelector(s);
const clean=s=>String(s||'').replace(/[^\d+]/g,'');
const normalize=s=>{let v=clean(s).replace(/\D/g,'');if(v.length===10)v='1'+v;return /^1\d{10}$/.test(v)?'+'+v:null;};
let overlay, busy=false, match=null, checked='', debounce, lookupError=null;
function status(message,error=false){const el=$('#shDialStatus',overlay);if(el){el.textContent=message;el.classList.toggle('error',error)}}
function current(){return normalize($('#shDialNumber',overlay)?.value);}
async function auth(){const db=window.steadyHandsCRMClient;if(!db)throw Error('CRM is still connecting.');const {data,error}=await db.auth.getUser();if(error||!data?.user?.id)throw Error('Please sign in to save or call.');return {db,user:data.user};}
async function lookup(){const n=current();match=null;lookupError=null;checked=n||'';const target=$('#shDialExisting',overlay);target.hidden=true;if(!n){status('Enter a valid 10-digit US phone number.');return;}
try{const {db}=await auth();const variants=[n,n.substring(2),n.substring(1),n.substring(0,2)+' ('+n.substring(2,5)+') '+n.substring(5,8)+'-'+n.substring(8)];const {data,error}=await db.from('crm').select('id,company,name,phone,assigned_user_id,do_not_call').in('phone',variants).limit(10);if(error)throw error;
if(checked!==n)return;match=(data||[]).find(row=>normalize(row.phone)===n)||null;
if(match){target.hidden=false;target.textContent='Existing lead: '+(match.company||match.name||match.phone);status(match.do_not_call?'This number is marked Do Not Call. Calling is blocked.':'Existing CRM lead found.');}
else status('New number. Call it or save it to your assigned leads.');
}catch(e){lookupError=e;status('Unable to check CRM: '+e.message,true)}}
function setBusy(v){busy=v;overlay?.querySelectorAll('button[data-sh-action]').forEach(b=>b.disabled=v);};
async function ensureLead(forCall){const number=current();if(!number)throw Error('Enter a valid 10-digit US phone number.');
const {db,user}=await auth();
await lookup();if(lookupError)throw Error('CRM duplicate check failed: '+lookupError.message);if(checked!==number)throw Error('Number changed. Please try again.');
if(match){if(match.do_not_call)throw Error('This number is marked Do Not Call.');if(forCall&&match.assigned_user_id&&match.assigned_user_id!==user.id)throw Error('This lead is assigned to another salesperson. Ask for reassignment before calling.');return match;}
const company=$('#shDialCompany',overlay).value.trim()||('Manual dial '+number);
const name=$('#shDialContact',overlay).value.trim();const notes=$('#shDialNotes',overlay).value.trim();
const payload={phone:number,company,assigned_user_id:user.id};
if(name)payload.name=name;
if(notes)payload.notes=notes;
const {data,error}=await db.from('crm').insert(payload).select('id,company,name,phone,assigned_user_id,do_not_call').single();
if(error)throw Error('Could not save lead: '+error.message);
if(data?.assigned_user_id!==user.id)throw Error('Lead was created, but salesperson assignment could not be verified. Please contact an administrator.');
match=data;return data;}
function navigate(row,call){if(call)sessionStorage.setItem('sh-manual-dial-pending',JSON.stringify({crmId:String(row.id),at:Date.now()}));else sessionStorage.removeItem('sh-manual-dial-pending');
const url=new URL('call.html',location.href);url.searchParams.set('crm_id',row.id);location.assign(url.toString());}
async function run(mode){if(busy)return;setBusy(true);try{const row=await ensureLead(mode==='call');status(mode==='call'?'Opening calling workspace…':'Lead saved and assigned to your account.');
if(mode==='call')navigate(row,true);else{const btn=$('#shDialView',overlay);btn.hidden=false;btn.onclick=()=>navigate(row,false);}}
catch(e){status(e.message||'Unable to continue.',true)}finally{setBusy(false)}}
function open(){if(!overlay){overlay=document.createElement('div');overlay.id='shManualDialer';overlay.className='sh-dial-overlay';overlay.hidden=true;overlay.innerHTML=`<section class="sh-dial-card" role="dialog" aria-modal="true" aria-labelledby="shDialTitle">
<header><h2 id="shDialTitle">Dialer</h2><button type="button" id="shDialClose" aria-label="Close dialer">×</button></header>
<label class="sh-dial-label" for="shDialNumber">Enter or paste a phone number</label><div class="sh-dial-inputrow"><input id="shDialNumber" type="tel" autocomplete="off" inputmode="tel" placeholder="(702) 555-0123"><button type="button" id="shDialBack" aria-label="Backspace">⌫</button></div>
<div class="sh-dial-pad">${[['1',''],['2','ABC'],['3','DEF'],['4','GHI'],['5','JKL'],['6','MNO'],['7','PQRS'],['8','TUV'],['9','WXYZ'],['*',''],['0','+'],['#','']].map(([d,l])=>`<button type="button" data-digit="${d}"><strong>${d}</strong><small>${l||'&nbsp;'}</small></button>`).join('')}</div>
<p id="shDialExisting" hidden></p><details class="sh-dial-details"><summary>Lead details (optional)</summary><label>Company<input id="shDialCompany" placeholder="Business name"></label><label>Contact<input id="shDialContact" placeholder="Contact name"></label><label>Notes<textarea id="shDialNotes" rows="2" placeholder="Notes"></textarea></label></details>
<p id="shDialStatus" role="status" aria-live="polite">Enter a number to begin.</p>
<div class="sh-dial-actions"><button type="button" data-sh-action="call" id="shDialCall">Call Number</button><button type="button" data-sh-action="save" id="shDialSave">Save as Lead</button><button type="button" id="shDialView" hidden>View Lead</button></div></section>`;
document.body.appendChild(overlay);
const num=$('#shDialNumber',overlay);num.addEventListener('input',()=>{match=null;checked='';$('#shDialView',overlay).hidden=true;clearTimeout(debounce);debounce=setTimeout(lookup,400)});
overlay.querySelectorAll('[data-digit]').forEach(b=>b.addEventListener('click',()=>{num.value+=b.dataset.digit;num.dispatchEvent(new Event('input'));num.focus()}));
$('#shDialBack',overlay).onclick=()=>{num.value=num.value.slice(0,-1);num.dispatchEvent(new Event('input'));num.focus()};
$('#shDialClose',overlay).onclick=close;overlay.addEventListener('click',e=>{if(e.target===overlay)close()});
$('#shDialCall',overlay).onclick=()=>run('call');$('#shDialSave',overlay).onclick=()=>run('save');}
overlay.hidden=false;document.body.classList.add('sh-dial-open');$('#shDialNumber',overlay).focus();}
function close(){if(busy)return;if(overlay)overlay.hidden=true;document.body.classList.remove('sh-dial-open')}
async function resume(){if(!location.pathname.endsWith('/call.html'))return;let pending;try{pending=JSON.parse(sessionStorage.getItem('sh-manual-dial-pending')||'null')}catch(_){}
if(!pending||Date.now()-pending.at>120000){sessionStorage.removeItem('sh-manual-dial-pending');return;}
if(new URLSearchParams(location.search).get('crm_id')!==pending.crmId)return;
sessionStorage.removeItem('sh-manual-dial-pending');
const message=document.getElementById('refMessage');if(message)message.textContent='Manual dial ready. Confirm the prospect and start the call.';
/* Never start behind the user's back: review, transcript, caller and DNC checks run when Call is pressed. */
document.getElementById('refEndCall')?.focus({preventScroll:true});
}
function init(){document.getElementById('refOpenDialer')?.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();open()},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&overlay&&!overlay.hidden)close()});resume();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();