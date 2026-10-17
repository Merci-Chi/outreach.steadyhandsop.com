/* Workflow additions use existing classes; no CSS or dialer styling is changed. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const core = window.SteadyHandsWorkflowCore;
  const leadId = () => window.steadyHandsCallLead?.id || document.querySelector('#selectedLeadTop .lead-card')?.dataset.crmId || '';
  const make = (tag,text,className) => { const el=document.createElement(tag);if(text)el.textContent=text;if(className)el.className=className;return el; };
  const icons = () => window.lucide?.createIcons?.();

  // HTML column widths set the layout; mobile moves the same live nodes into a stack.
  const table=$('workflowLayout'), left=$('workflowDialer'), right=$('workflowReview');
  if (!table || !left || !right) return;
  const marker=document.createComment('workflow layout');table.before(marker);
  const stacked=make('div');
  const breakpoint=matchMedia('(max-width: 760px)');
  function layout() {
    if(breakpoint.matches) {
      stacked.append(...left.children,...right.children);table.remove();marker.after(stacked);
    } else {
      const children=[...stacked.children];
      if(children.length) {
        // Each node retains its original column, including a process moved to a call popup.
        for(const node of children)(node.dataset.workflowColumn==='left'?left:right).append(node);
      }
      stacked.remove();marker.after(table);
    }
  }
  [...left.children].forEach(node=>node.dataset.workflowColumn='left');
  [...right.children].forEach(node=>node.dataset.workflowColumn='right');
  layout();breakpoint.addEventListener?.('change',layout);
  window.SteadyHandsRestoreProcess = panel => {
    if(breakpoint.matches){const anchor=[...stacked.children].find(node=>node.dataset.workflowColumn==='right');stacked.insertBefore(panel,anchor||null);}
    else right.prepend(panel);
  };

  const process=document.querySelector('.outreach-process');
  const steps=[...process.querySelectorAll('ol > li')];
  let guided=document.body.classList.contains('page-call'), cursor=0;
  const nav=make('div',null,'sh-tag-options');
  const previous=make('button','Previous','sh-sheet-secondary');previous.type='button';
  const next=make('button','Next step →','sh-sheet-primary');next.type='button';
  const stepStatus=make('p',null,'sh-sheet-help');stepStatus.setAttribute('aria-live','polite');
  nav.append(previous,next);process.append(stepStatus,nav);
  function showStep(direction=0) {
    steps.forEach((step,i)=>{step.hidden=guided&&i!==cursor;});
    nav.hidden=!guided;stepStatus.hidden=!guided;
    stepStatus.textContent=`Step ${cursor+1} of ${steps.length}`;
    previous.disabled=cursor===0;next.disabled=cursor===steps.length-1;
    if(guided&&direction&&!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      steps[cursor].animate?.([{opacity:0,transform:`translateX(${direction*24}px)`},{opacity:1,transform:'translateX(0)'}],{duration:180,easing:'ease-out'});
    }
  }
  previous.onclick=()=>{cursor=Math.max(0,cursor-1);showStep(-1);};
  next.onclick=()=>{cursor=Math.min(steps.length-1,cursor+1);showStep(1);};
  window.addEventListener('steadyhands:process-mode',event=>{guided=!!event.detail?.guided;showStep();});
  showStep();

  let reviewPending=null;
  window.SteadyHandsReviewBeforeCall = id => {
    if(reviewPending)return reviewPending;
    reviewPending=new Promise(resolve=>{
      const dialog=make('dialog',null,'lead-action-dialog call-tool-sheet');
      dialog.setAttribute('aria-labelledby','precallTitle');
      const title=make('h2','Before you call');title.id='precallTitle';
      const notes=make('p','Loading prospect notes…');
      const homework=make('section');homework.append(make('h3','Do your homework'),make('p','It’s best to do your homework. Briefly search each client online before calling.'),make('p','Don’t rely solely on notes, it’s not just about the numbers.'),make('p','Look at their website and social media, if available. Mention something real to warm up the conversation.'),make('blockquote','“I saw you on Instagram…”'),make('small','Only mention a profile or post you actually reviewed.'));
      const details=make('section'), feedback=make('p');feedback.setAttribute('role','status');
      const ack=make('input');ack.type='checkbox';
      const ackLabel=make('label','I’ve reviewed the notes and prospect details');ackLabel.prepend(ack);
      const footer=make('footer'), cancel=make('button','Back'), proceed=make('button','Reviewed — continue to call','primary');
      cancel.type=proceed.type='button';proceed.disabled=true;
      footer.append(cancel,proceed);dialog.append(title,make('h3','Notes to review'),notes,homework,details,ackLabel,feedback,footer);document.body.append(dialog);
      let loaded=false,accepted=false;
      ack.onchange=()=>proceed.disabled=!loaded||!ack.checked;
      cancel.onclick=()=>dialog.close();
      proceed.onclick=()=>{
        if(loaded&&ack.checked&&leadId()===id){accepted=true;dialog.close();}
        else feedback.textContent='The selected prospect changed. Close this review and try again.';
      };
      dialog.addEventListener('close',()=>{dialog.remove();reviewPending=null;resolve(accepted);},{once:true});
      dialog.showModal();cancel.focus();
      core.load(window.steadyHandsCRMClient,id).then(({row})=>{
        if(!dialog.isConnected)return;
        notes.textContent=row.notes||'No notes are on file. Review the business online before calling.';
        const address=[row.address||row.street_address||row.street,row.city,row.state||row.state_code,row.zip||row.postal_code].filter(Boolean).join(', ');
        for(const [label,value] of [['Company name',row.company||row.name],['Address',address],['Phone number',row.phone]]) {
          const line=make('p'),copy=make('button','Copy','sh-template-copy');copy.type='button';copy.disabled=!value;
          line.append(make('strong',label+': '),document.createTextNode(value||'Not on file'),copy);
          copy.onclick=async()=>{try{await navigator.clipboard.writeText(value);feedback.textContent=label+' copied.';}catch{feedback.textContent='Copy unavailable. Select the text to copy it.';}};
          details.append(line);
        }
        const search=make('a','Search company online','sh-sheet-secondary');search.href='https://www.google.com/search?q='+encodeURIComponent([row.company,row.city,row.state_code].filter(Boolean).join(' '));search.target='_blank';search.rel='noopener noreferrer';details.append(search);
        let profiles=0;
        for(const field of ['website','instagram','instagram_url','facebook','facebook_url','linkedin','linkedin_url']) {
          const value=row[field];if(typeof value!=='string')continue;
          try{const url=new URL(value);if(!['http:','https:'].includes(url.protocol))continue;const link=make('a',field.replace('_url',''),'sh-sheet-secondary');link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';details.append(link);profiles++;}catch{}
        }
        if(!profiles)details.append(make('p','No website or social profile links are on file. Search the business and verify any profile before mentioning it.'));
        loaded=true;proceed.disabled=!ack.checked;
      }).catch(error=>{notes.textContent='Prospect review could not be loaded.';feedback.textContent=error.message;});
    });
    return reviewPending;
  };

  // All transcript state is scoped to the selected lead and stays in memory.
  const history=$('transcriptHistory'), feedback=$('transcriptFeedback'), actions=$('keywordActions');
  let current=leadId(), entries=[], capture=null, captureRunning=false, callActive=$('refEndCall')?.dataset.callState==='active'||!!document.querySelector('#refRegularCallTracker:not([hidden])');
  const applied=new Set(), imported=new Set();
  let syncTimer=null, since=null, syncEpoch=0, syncBusy=false;
  function stopCapture() {captureRunning=false;try{capture?.stop();}catch{}capture=null;$('transcriptCapture').textContent='Start microphone transcript';}
  function resetLead() {
    const id=leadId();if(id===current)return;
    stopCapture();stopSync();callActive=false;current=id;entries=[];applied.clear();history.value='';actions.replaceChildren();cursor=0;showStep();
    $('keywordFeedback').textContent='Suggestions appear when a relevant keyword is mentioned.';
    $('refTranscriptStatus').textContent='No transcript captured yet';
  }
  function appendEntry({id,speaker,text,final=true}) {
    resetLead();
    if(!id||id!==current||!final||!['agent','prospect','unknown'].includes(speaker)||typeof text!=='string'||!text.trim())return;
    entries.push({speaker,text:text.trim().slice(0,4000),time:new Date()});
    if(entries.length>200)entries.shift();
    history.value=entries.map(entry=>`${entry.time.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'})} · ${entry.speaker==='prospect'?'Prospect':entry.speaker==='agent'?'You':'Transcript'}: ${entry.text}`).join('\n\n');
    history.scrollTop=history.scrollHeight;
    $('refTranscriptStatus').textContent=`${entries.length} entries · newest at bottom`;
    renderActions();
  }
  function renderActions() {
    // Latest prospect utterances determine suggestions; a DNC request takes precedence.
    const recent=entries.filter(entry=>entry.speaker==='prospect').slice(-4).map(entry=>entry.text).join(' ');
    const suggested=core.suggestions(recent).filter(action=>!applied.has(action.id));actions.replaceChildren();
    for(const action of suggested) {
      const button=make('button',action.label,'sh-tag-pill');button.type='button';actions.append(button);
      const id=current;
      button.onclick=async()=>{
        if(leadId()!==id){resetLead();return;}
        button.disabled=true;
        try {
          if(action.id==='dnc'){$('refDoNotCall')?.click();}
          else if(action.id.startsWith('tag:')){await core.addTag(window.steadyHandsCRMClient,id,action.id.slice(4));if(leadId()===id)applied.add(action.id);}
          else if(action.id==='phone'){cursor=2;showStep();$('processPhone').focus();}
          else {if(!window.steadyHandsOpenOutreachTool)throw Error('Call tools are still loading. Please try again.');await window.steadyHandsOpenOutreachTool(action.id);}
          if(leadId()===id){$('keywordFeedback').textContent=action.id.startsWith('tag:')?'Tag saved.':'Review the action before saving.';renderActions();}
        }catch(error){if(leadId()===id)$('keywordFeedback').textContent=error.message;}
        finally{button.disabled=false;}
      };
    }
    if(!suggested.length)$('keywordFeedback').textContent='No new keyword actions to review.';
  }
  $('transcriptAdd').onclick=()=>{
    if(!leadId()){feedback.textContent='Select a prospect first.';return;}
    const input=$('transcriptText');appendEntry({id:leadId(),speaker:$('transcriptSpeaker').value,text:input.value});input.value='';
  };
  const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!Recognition){$('transcriptCapture').disabled=true;feedback.textContent='Microphone transcription is unavailable in this browser. Enter the prospect’s words above.';}
  $('transcriptCapture').onclick=()=>{
    if(captureRunning){stopCapture();return;}
    if(!callActive){feedback.textContent='Start the call before enabling microphone transcription.';return;}
    const id=leadId();if(!id)return;
    capture=new Recognition();capture.continuous=true;capture.interimResults=false;capture.lang='en-US';
    capture.onresult=event=>{
      for(let i=event.resultIndex;i<event.results.length;i++)if(event.results[i].isFinal)appendEntry({id,speaker:'agent',text:event.results[i][0].transcript});
    };
    capture.onerror=event=>{feedback.textContent='Microphone transcript stopped: '+event.error;stopCapture();};
    capture.onend=()=>{captureRunning=false;$('transcriptCapture').textContent='Start microphone transcript';};
    try{capture.start();captureRunning=true;$('transcriptCapture').textContent='Stop microphone transcript';feedback.textContent='Capturing your microphone as You. Remote caller speech requires transcript entry.';}catch(error){feedback.textContent=error.message;stopCapture();}
  };
  window.addEventListener('steadyhands:transcript',event=>appendEntry(event.detail||{}));
  window.addEventListener('steadyhands:call-lead-ready',resetLead);
  async function refreshTranscript() {
    if(syncBusy)return;
    const id=leadId(),epoch=syncEpoch;if(!id)return;
    syncBusy=true;
    try {
      const row=await core.fetchTranscript(window.steadyHandsCRMClient,id,since);
      if(epoch!==syncEpoch||leadId()!==id)return;
      if(!row){feedback.textContent='No saved transcript is available for this call yet. You can add entries manually.';return;}
      const segments=core.transcriptSegments(row);
      segments.forEach((segment,i)=>{
        const key=JSON.stringify([row.id,i,segment.speaker,segment.text]);
        if(!imported.has(key)){imported.add(key);appendEntry({id,...segment});}
      });
      feedback.textContent='Saved transcript synced. Unlabelled speech is shown as Transcript and does not create keyword actions.';
    }catch(error){if(epoch===syncEpoch)feedback.textContent=error.message;}
    finally{syncBusy=false;}
  }
  function stopSync() {if(syncTimer)clearInterval(syncTimer);syncTimer=null;since=null;syncEpoch++;imported.clear();}
  function callState(event) {
    const nextActive=!!event.detail?.active;
    if(nextActive&&!callActive){stopSync();since=new Date(Date.now()-5000).toISOString();syncTimer=setInterval(refreshTranscript,5000);refreshTranscript();}
    if(!nextActive){stopCapture();if(callActive)refreshTranscript();if(syncTimer)clearInterval(syncTimer);syncTimer=null;}
    callActive=nextActive;
  }
  $('transcriptRefresh').onclick=refreshTranscript;
  window.addEventListener('steadyhands:call-state',callState);
  window.addEventListener('steadyhands:regular-call-state',callState);
  const selected=$('selectedLeadTop');if(selected)new MutationObserver(resetLead).observe(selected,{childList:true,subtree:true,attributes:true,attributeFilter:['data-crm-id']});
  window.addEventListener('steadyhands:lead-disposition',event=>{if(event.detail?.id===current&&event.detail.action==='dnc'){applied.add('dnc');renderActions();}});
  window.addEventListener('pagehide',()=>{stopCapture();stopSync();});
  icons();
})();
