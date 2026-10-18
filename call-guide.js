/* Conversation prompts are navigation only; the six CRM checks remain manual. */
(() => {
  'use strict';
  const openers = [
    {
      title: 'Opener A — The Honest Cold Open',
      script: "Hi, is this [Client name]? … My name is [Your name] with Steady Hands — we build and host websites for businesses. This is a cold call — I know you weren’t expecting it. Can I have thirty seconds to tell you why I called, and then you decide if it’s worth continuing?",
      note: 'Name the cold call honestly and let them choose whether to continue.'
    },
    {
      title: 'Opener B — The Observation Lead',
      script: 'Hi [Client name] — [Your name] from Steady Hands, web design and hosting for businesses. I was looking at [their industry] in [their area] and noticed most of the shops that come up first in a Google search have websites — and I couldn’t find yours. Did I get that right, or is there a site I missed?',
      note: 'Use only after researching this business. If they have a site, acknowledge the correction and ask about what they would like to improve.'
    }
  ];
  const stages = [
    {label:'Opener (15 sec)', title:'Start with an opener'},
    {label:'Permission', title:'Permission to continue',
      lines:['Thanks — I’ll keep it brief. May I ask a couple of questions about your business to see whether this would be useful?'],
      note:'Wait for permission. If they decline, thank them and end the call.'},
    {label:'CGP Questions', title:'The Core Ladder',
      lines:['How do most new customers find you today?', 'Do you ever struggle with people not finding you online? (CGP-C)', 'What goal is that challenge keeping you from — more new faces, fewer interruptions? (CGP-G)', 'How are you handling that today? (CGP-P)', 'When do you need to see that change — this season, or is there a better window? (TCI-T)'],
      note:'Listen 60–70%. Ask a few purposeful questions, let each answer shape the next question, and write down their words.'},
    {label:'Gap Math', title:'The Honest Math — Built From Their Numbers',
      lines:['You said maybe [their estimate] people a month find a competitor instead. Roughly what’s an average new customer worth to you per visit? … Okay — so that’s about [their estimate] × [$X] a month walking past. That’s YOUR rough number — am I understanding your estimate right?', 'And if nothing changes for a year? (TCI-C) — let them say it.'],
      note:'The client supplies the inputs. Round conservatively, label it their estimate, and never inflate it. The gap is a mirror, not a weapon.'},
    {label:'BAA Check', title:'BAA — Before Any Price',
      lines:['What would you plan to invest to fix this? (Budget)', 'Who else is part of a decision like this? (Authority)', 'Where does a website sit on your list right now — top, middle, “someday”? (Agenda)'],
      note:'Verify feasibility before discussing price. Understand their budget, who makes the decision, and when it matters.'},
    {label:'Value Case', title:'The Presentation — When BAA Checks Out',
      lines:['Based on everything you’ve told me: a complete website — designed, built, mobile-ready, launched for you — is $100, one time. Hosting starts at $20/month: we keep it fast, online, and maintained, and support is a phone call away. Against the [their gap number] a month you described — you see the math. And here’s the part owners like most: you see a preview of YOUR site before anything goes live.'],
      note:'Use the needs and estimates they shared. Only present the offer after the BAA check.'},
    {label:'Next-Step Close', title:'Agree on the Next Step',
      lines:['Want me to get your preview started this week?'],
      note:'Ask once, then stop talking and listen. If they agree, continue into the process to confirm the preview, textable number, and development handoff.'}
  ];
  const objections = [
    {id:'busy',label:'I’m busy right now',title:'“I’m busy right now.”',
      script:'Totally understood — I won’t take your working time. Quick one: mornings or afternoons usually better for a two-minute call? … Great, [day/time] it is — I’ll call then, and not before.',
      note:'Confirm and record the agreed follow-up time. Honor that slot exactly.'},
    {id:'sales',label:'Is this a sales call? / hostility',title:'“Is this a sales call?” / hostility',
      script:'It is — and I’d rather be straight with you about that. Thirty seconds on why I called, then your call. Fair?',
      note:'If they still say no: “Fair enough — have a good one.” Log it and move on. No wear-down. Ever.'},
    {id:'email',label:'Send me an email',title:'“Send me an email.”',
      script:'Happy to — so I send something worth reading instead of spam: what’s the one thing you’d want a website to actually do for you? … Got it. I’ll send exactly that, and I’ll follow up [agreed day/time] — does that work?',
      note:'Personalize the email to their answer and agree on the follow-up time.'}
  ];
  function mount({process,leadId}) {
    const make=(tag,text,className)=>{const el=document.createElement(tag);if(text)el.textContent=text;if(className)el.className=className;return el;};
    const header=process.querySelector('header'), fieldset=process.querySelector('#processSteps');
    const checklist=[...fieldset.querySelectorAll('ol > li')];
    let guided=document.body.classList.contains('page-call'),cursor=0,opener=0,currentLead=leadId();
    const guide=make('section',null,'call-guide');guide.setAttribute('aria-label','Conversation guide');
    const cards=stages.map((stage,i)=>{
      const card=make('section',null,'call-guide-card');card.id=`call-guide-step-${i+1}`;
      const title=make('h3',stage.title);title.tabIndex=-1;card.append(title);
      if(i===0){
        const choices=make('div',null,'call-opener-choices');choices.setAttribute('role','group');choices.setAttribute('aria-label','Choose an opener');
        openers.forEach((item,index)=>{const button=make('button',index===0?'Opener A · Honest Cold Open':'Opener B · Observation Lead');button.type='button';button.dataset.opener=String(index);button.addEventListener('click',()=>{opener=index;renderOpener();});choices.append(button);});
        card.append(choices,make('h4'),make('blockquote'),make('p',null,'call-guide-note'));
      }else{
        const quote=make('blockquote');stage.lines.forEach(line=>quote.append(make('p',line)));card.append(quote,make('p',stage.note,'call-guide-note'));
      }
      guide.append(card);return card;
    });
    function renderOpener(){
      const card=cards[0],item=openers[opener];
      card.querySelector('h4').textContent=item.title;card.querySelector('blockquote').textContent=item.script;card.querySelector('.call-guide-note').textContent=item.note;
      card.querySelectorAll('[data-opener]').forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.opener)===opener)));
    }
    fieldset.before(guide);
    const labels=[...stages.map(s=>s.label),...checklist.map(step=>step.querySelector('strong').textContent)];
    const pills=make('div',null,'call-stage-pills');pills.setAttribute('role','group');pills.setAttribute('aria-label','Call steps');
    const pillButtons=labels.slice(0,stages.length).map((label,i)=>{
      const button=make('button',`${i+1}. ${label}`,'call-stage-pill');button.type='button';
      button.setAttribute('aria-controls',i<cards.length?cards[i].id:'processSteps');
      button.addEventListener('click',()=>{cursor=i;showStep(true);});pills.append(button);return button;
    });
    const topbar=document.querySelector('.call-back-nav');
    if(topbar)topbar.append(pills);else process.insertBefore(pills,header);
    const links=make('div',null,'call-objection-links');links.setAttribute('role','group');links.setAttribute('aria-label','Quick objection responses');
    const responses=make('section',null,'call-objection-responses');responses.hidden=true;
    const responseTitle=make('h3');responseTitle.tabIndex=-1;
    const responseScript=make('blockquote'),responseNote=make('p',null,'call-guide-note');
    const dismiss=make('button','Back to current step','call-objection-close');dismiss.type='button';
    responses.append(responseTitle,responseScript,responseNote,dismiss);guide.before(responses);
    function closeResponse(){responses.hidden=true;links.querySelectorAll('a').forEach(link=>link.setAttribute('aria-expanded','false'));}
    objections.forEach(item=>{
      const link=make('a',item.label);link.href='#call-objection-response';link.setAttribute('aria-controls','call-objection-response');link.setAttribute('aria-expanded','false');
      link.addEventListener('click',event=>{
        event.preventDefault();const closing=!responses.hidden&&responses.dataset.objection===item.id;closeResponse();
        if(closing)return;
        responses.dataset.objection=item.id;responses.hidden=false;
        responseTitle.textContent=item.title;responseScript.textContent=item.script;responseNote.textContent=item.note;
        link.setAttribute('aria-expanded','true');responseTitle.focus({preventScroll:true});
      });links.append(link);
    });
    responses.id='call-objection-response';
    dismiss.addEventListener('click',()=>{const link=links.querySelector('[aria-expanded="true"]');closeResponse();link?.focus();});
    process.addEventListener('keydown',event=>{if(event.key==='Escape'&&!responses.hidden){event.preventDefault();dismiss.click();}});
    const nav=make('div',null,'workflow-step-nav');nav.setAttribute('role','group');nav.setAttribute('aria-label','Process steps');
    const previous=make('button','Previous','sh-sheet-secondary');previous.type='button';
    const next=make('button','Next step →','sh-sheet-primary');next.type='button';
    const status=make('span',null,'call-step-status');status.setAttribute('aria-live','polite');
    nav.append(previous,next);header.insertBefore(links,document.getElementById('processProgress'));header.insertBefore(nav,document.getElementById('processProgress'));
    header.after(status);
    function showStep(focus=false){
      guide.hidden=!guided;nav.hidden=!guided;pills.hidden=!guided;links.hidden=!guided;status.hidden=!guided;
      const inChecklist=cursor>=cards.length;
      fieldset.hidden=guided&&!inChecklist;
      cards.forEach((card,i)=>card.hidden=i!==cursor);
      checklist.forEach((step,i)=>step.hidden=guided&&cursor!==cards.length+i);
      pillButtons.forEach((button,i)=>{button.setAttribute('aria-pressed',String(cursor===i));if(cursor===i)button.setAttribute('aria-current','step');else button.removeAttribute('aria-current');});
      status.textContent=`${cursor+1} / ${labels.length} · ${labels[cursor]}`;
      previous.disabled=cursor===0;next.disabled=cursor===labels.length-1;closeResponse();
      if(focus&&guided){const heading=inChecklist?checklist[cursor-cards.length].querySelector('strong'):cards[cursor].querySelector('h3');heading.tabIndex=-1;heading.focus({preventScroll:true});}
    }
    previous.addEventListener('click',()=>{cursor=Math.max(0,cursor-1);showStep(true);});
    next.addEventListener('click',()=>{cursor=Math.min(labels.length-1,cursor+1);showStep(true);});
    const resetLead=()=>{const id=leadId();if(id!==currentLead){currentLead=id;cursor=0;showStep();}};
    window.addEventListener('steadyhands:call-lead-ready',resetLead);
    window.addEventListener('steadyhands:call-guide-step',event=>{
      const step=Number(event.detail?.checklistStep);
      if(!Number.isInteger(step)||step<1||step>checklist.length)return;
      guided=true;cursor=cards.length+step-1;showStep(true);
    });
    const selected=document.querySelector('#selectedLeadTop');
    if(selected)new MutationObserver(resetLead).observe(selected,{childList:true,subtree:true,attributes:true,attributeFilter:['data-crm-id']});
    window.addEventListener('steadyhands:process-mode',event=>{guided=!!event.detail?.guided;resetLead();showStep();});
    renderOpener();showStep();
  }
  window.SteadyHandsCallGuide={mount};
})();
