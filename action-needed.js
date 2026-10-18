(() => {
 'use strict';
 const make=(tag,text)=>{const el=document.createElement(tag);if(text)el.textContent=text;return el;};
 async function init(){
  const main=document.getElementById('action-list');
  main.replaceChildren(make('h1','Action Needed'));
  try{
   const rows=await window.OutreachActions.list();
   if(!rows.length)main.appendChild(make('p','You have no actions assigned right now.'));
   for(const row of rows){
    const card=make('section');card.className='notice';
    card.appendChild(make('h2','Associate Questionnaire'));
    card.appendChild(make('p',row.status==='completed'?'Completed':'Action needed'));
    for(const [label,value] of [['Assigned',row.assigned_at],['Completed',row.completed_at]]){
     if(!value)continue;const date=new Date(value);if(!Number.isFinite(date.getTime()))continue;
     const line=make('p',label+' '),time=make('time',new Intl.DateTimeFormat('en-US',{dateStyle:'medium',timeStyle:'short'}).format(date));
     time.dateTime=value;line.appendChild(time);card.appendChild(line);
    }
    if(row.status==='assigned'){
     const button=make('button','Open questionnaire');button.type='button';button.className='button';
     const open=async()=>{button.disabled=true;try{await window.OutreachQuestionnaire.open({assignmentId:row.id,onComplete:init});}
      catch(error){card.appendChild(make('p',error.message));}finally{button.disabled=false;}};
     button.addEventListener('click',open);card.appendChild(button);
     if(new URLSearchParams(location.search).get('open')==='1'&&row===rows.find(x=>x.status==='assigned'))await open();
    }
    main.appendChild(card);
   }
  }catch{const error=make('p','We couldn’t load your actions. Please try again or contact your administrator.');error.setAttribute('role','alert');main.appendChild(error);
   const retry=make('button','Try again');retry.addEventListener('click',init);main.appendChild(retry);}
  const back=make('a','Back to Outreach');back.href='index.html';back.className='button';main.appendChild(back);
 }
 document.addEventListener('DOMContentLoaded',init);
})();
