/* Follow-up scheduling and tasks, shared by the Admin and Outreach Performance pages. */
(() => {
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const local=value=>{
    if(!value)return '';
    const date=new Date(value);if(!Number.isFinite(date.getTime()))return '';
    return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);
  };
  const initialDate=lead=>local(lead.follow_up_at)||(/^\d{4}-\d{2}-\d{2}$/.test(lead.callbackdate||'')?lead.callbackdate+'T'+(/^\d{2}:\d{2}/.exec(lead.callbackat||'')?.[0]||'09:00'):'');
  const escapeICS=value=>String(value||'').replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
  const stamp=date=>new Date(date).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
  function calendar({title,notes,start,id}){
    const end=new Date(new Date(start).getTime()+30*60000);
    const text=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Steady Hands//Follow-ups//EN','BEGIN:VEVENT',`UID:${escapeICS(id)}@steadyhandsop.com`,`DTSTAMP:${stamp(new Date())}`,`DTSTART:${stamp(start)}`,`DTEND:${stamp(end)}`,`SUMMARY:${escapeICS(title)}`,`DESCRIPTION:${escapeICS(notes)}`,'END:VEVENT','END:VCALENDAR',''].join('\r\n');
    return {text,google:'https://calendar.google.com/calendar/u/0/r/eventedit?'+new URLSearchParams({text:title,dates:stamp(start)+'/'+stamp(end),details:notes}),outlook:'https://outlook.live.com/calendar/0/deeplink/compose?'+new URLSearchParams({path:'/calendar/action/compose',rru:'addevent',subject:title,startdt:new Date(start).toISOString(),enddt:end.toISOString(),body:notes})};
  }
  async function save({client,lead,userId,mode,admin,title,notes,date}){
    if(!userId)throw Error('Assign this follow-up to an associate before adding it.');
    if(!title?.trim())throw Error('Enter a title.');
    const due=date?new Date(date):null;
    if(date&&!Number.isFinite(due.getTime()))throw Error('Choose a valid date and time.');
    if(mode==='calendar'&&(!due||due<=new Date()))throw Error('Choose a future date and time.');
    const {data,error}=await client.auth.getUser();if(error)throw error;
    const actor=data?.user?.id;if(!actor)throw Error('Sign in before saving.');
    if(!admin&&String(actor)!==String(userId))throw Error('You can only add your own follow-ups.');
    if(admin&&window.steadyHandsAdminSession?.user?.id!==actor)throw Error('Administrator access must be verified before saving.');
    let response;
    if(mode==='task')response=await client.from('outreach_tasks').insert({assigned_to:userId,created_by:actor,title:title.trim(),notes,lead_id:lead.id,due_at:due?due.toISOString():null,priority:'normal'});
    else if(admin)response=await client.rpc('admin_assign_outreach_followup',{p_lead_id:lead.id,p_user_id:userId,p_starts_at:due.toISOString(),p_note:notes});
    else response=await client.from('callcenter_scheduled_calls').insert({user_id:userId,crm_id:lead.id,company:lead.company||'',contact:lead.name||'',phone:lead.phone||'',note:notes,starts_at:due.toISOString(),active:true});
    if(response.error)throw response.error;
    return mode==='calendar'?calendar({title:title.trim(),notes,start:due,id:crypto.randomUUID()}):null;
  }
  function open({client,lead,userId,mode,admin=false,trigger}){
    document.getElementById('performanceFollowupDialog')?.remove();
    const dialog=document.createElement('dialog');dialog.id='performanceFollowupDialog';dialog.className='performance-action-dialog';
    const task=mode==='task',label=lead.company||lead.name||lead.phone||'Prospect';
    dialog.innerHTML=`<form><header><h2>${task?'Add to tasks':'Add to calendar'}</h2><button type="button" data-action-close aria-label="Close">×</button></header><p>${esc(label)}</p><label>Title<input name="title" required maxlength="160" value="${esc('Follow-up: '+label)}"></label><label>${task?'Due date and time (optional)':'Follow-up date and time'}<input name="date" type="datetime-local" ${task?'':'required'} value="${esc(initialDate(lead))}"></label><small>Times use your device’s local time zone.</small><label>Notes<textarea name="notes" rows="3" maxlength="1500">${esc([lead.phone,lead.follow_up_category,lead.notes].filter(Boolean).join('\n'))}</textarea></label><p role="status" data-action-status></p><footer><button type="button" data-action-close>Cancel</button><button type="submit">${task?'Create task':'Save follow-up'}</button></footer><div data-calendar-destinations hidden></div></form>`;
    document.body.appendChild(dialog);
    let busy=false,saved=false;
    const form=dialog.querySelector('form'),button=form.querySelector('[type="submit"]'),status=form.querySelector('[data-action-status]');
    const close=()=>{if(busy)return;dialog.close();};
    dialog.querySelectorAll('[data-action-close]').forEach(b=>b.addEventListener('click',close));
    dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
    dialog.addEventListener('close',()=>{dialog.remove();trigger?.focus?.();},{once:true});
    form.addEventListener('submit',async event=>{
      event.preventDefault();if(busy||saved)return;
      busy=true;button.disabled=true;status.textContent='Saving…';
      const fields=new FormData(form);
      try{
        const result=await save({client,lead,userId,mode,admin,title:String(fields.get('title')||''),notes:String(fields.get('notes')||''),date:String(fields.get('date')||'')});
        saved=true;button.textContent=task?'Task created':'Follow-up saved';
        status.textContent=task?'Added to tasks.':'Saved. Choose a calendar below.';
        form.querySelectorAll('input,textarea').forEach(el=>el.disabled=true);
        form.querySelectorAll('[data-action-close]').forEach(el=>el.textContent=el.getAttribute('aria-label')?'×':'Done');
        if(result){
          lead.follow_up_at=new Date(String(fields.get('date'))).toISOString();
          const destinations=form.querySelector('[data-calendar-destinations]');destinations.hidden=false;
          destinations.innerHTML=`<a target="_blank" rel="noopener noreferrer" href="${esc(result.google)}">Google Calendar ↗</a><a target="_blank" rel="noopener noreferrer" href="${esc(result.outlook)}">Outlook Calendar ↗</a><button type="button" data-download-calendar>Apple / Other Calendar (.ics)</button>`;
          destinations.querySelector('[data-download-calendar]').onclick=()=>{
            const url=URL.createObjectURL(new Blob([result.text],{type:'text/calendar;charset=utf-8'})),a=document.createElement('a');
            a.href=url;a.download='follow-up.ics';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
          };
        }
        window.dispatchEvent(new CustomEvent('steadyhands:followup-saved',{detail:{mode,crmId:lead.id,userId}}));
      }catch(error){status.textContent='Unable to save: '+(error?.message||'Please try again.');button.disabled=false;}
      finally{busy=false;}
    });
    dialog.showModal();
  }
  const buttons=lead=>`<div class="performance-followup-actions"><button type="button" ${lead.callback_owner_id?'':'disabled title="Assign this follow-up to an associate first"'} data-followup-action="calendar" data-followup-id="${esc(lead.id)}" data-followup-owner="${esc(lead.callback_owner_id)}"><i data-lucide="calendar-plus"></i>Add to calendar</button><button type="button" ${lead.callback_owner_id?'':'disabled title="Assign this follow-up to an associate first"'} data-followup-action="task" data-followup-id="${esc(lead.id)}" data-followup-owner="${esc(lead.callback_owner_id)}"><i data-lucide="list-plus"></i>Add to tasks</button></div>`;
  window.PerformanceFollowupActions={open,buttons,save,calendar};
})();
