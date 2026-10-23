/* Outreach and call workflow behavior. */
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

  let reviewPending=null;
  window.SteadyHandsReviewBeforeCall = id => {
    if(reviewPending)return reviewPending;
    reviewPending=new Promise(resolve=>{
      const dialog=make('dialog',null,'lead-action-dialog sh-tool-sheet');
      dialog.setAttribute('aria-labelledby','precallTitle');
      dialog.setAttribute('aria-describedby','precallSubtitle');
      const header=make('header',null,'sh-tools-head sh-sheet-head');
      const heading=make('div'),title=make('h2','Before you call');title.id='precallTitle';
      const subtitle=make('p','Review the prospect, then make the conversation personal.','sh-sheet-help');subtitle.id='precallSubtitle';
      heading.append(title,subtitle);
      const close=make('button','×','sh-sheet-x');close.type='button';close.setAttribute('aria-label','Close pre-call review');
      header.append(heading,close);
      const body=make('div',null,'sh-sheet-body app-modal-body');
      const notesCard=make('section',null,'sh-alert-row');
      const notesTitle=make('h3','Notes to review','modal-label');notesTitle.id='precallNotesTitle';
      const notes=make('textarea',null,'sh-sheet-input');notes.readOnly=true;notes.rows=3;notes.value='Loading prospect notes…';notes.setAttribute('aria-labelledby','precallNotesTitle');
      notesCard.append(notesTitle,notes);
      const details=make('section',null,'sh-prices');details.setAttribute('aria-label','Company information');
      const researchLinks=make('div',null,'sh-tag-options');
      const homework=make('section',null,'sh-alert-row');
      homework.append(make('h3','Do your homework','modal-label'),make('p','It’s best to do your homework. Briefly search each client online before calling.','sh-sheet-help'),make('p','Don’t rely solely on notes, it’s not just about the numbers.','sh-sheet-help'),make('p','Look at their website and social media, if available. Mention something real to warm up the conversation.','sh-sheet-help'),make('div','“I saw you on Instagram…”','sh-preview-url'),make('small','Only mention a profile or post you actually reviewed.','sh-sheet-help'));
      homework.append(researchLinks);
      const feedback=make('p',null,'sh-sheet-status');feedback.setAttribute('role','status');
      const ack=make('input');ack.type='checkbox';ack.id='precallAcknowledged';ack.disabled=true;
      const ackLabel=make('div',null,'cc-check'),ackText=make('label','I’ve reviewed the notes and prospect details');ackText.htmlFor=ack.id;ackLabel.append(ack,ackText);
      const footer=make('div',null,'sh-alert-row');footer.setAttribute('role','group');footer.setAttribute('aria-label','Call review actions');
      const actions=make('div',null,'app-modal-actions');
      const cancel=make('button','Back','modal-action'),proceed=make('button','Continue to call','modal-action primary');
      cancel.type=proceed.type='button';proceed.disabled=true;
      actions.append(cancel,proceed);footer.append(ackLabel,feedback,actions);
      body.append(notesCard,details,homework,footer);dialog.append(header,body);document.body.append(dialog);
      let loaded=false,accepted=false;
      ack.onchange=()=>proceed.disabled=!loaded||!ack.checked;
      cancel.onclick=close.onclick=()=>dialog.close();
      proceed.onclick=()=>{
        if(loaded&&ack.checked&&leadId()===id){accepted=true;dialog.close();}
        else feedback.textContent='The selected prospect changed. Close this review and try again.';
      };
      dialog.addEventListener('close',()=>{dialog.remove();reviewPending=null;resolve(accepted);},{once:true});
      dialog.showModal();close.focus();
      core.load(window.steadyHandsCRMClient,id).then(({row})=>{
        if(!dialog.isConnected)return;
        notes.value=row.notes||'No notes are on file. Review the business online before calling.';
        const address=[row.address||row.street_address||row.street,row.city,row.state||row.state_code,row.zip||row.postal_code].filter(Boolean).join(', ');
        for(const [label,value] of [['Company name',row.company||row.name],['Address',address],['Phone number',row.phone]]) {
          const line=make('div',null,'sh-template-row'),valueCopy=make('div');
          valueCopy.append(make('b',label),make('small',value||'Not on file'));
          const copy=make('button','Copy','sh-template-copy');copy.type='button';copy.disabled=!value;copy.setAttribute('aria-label','Copy '+label.toLowerCase());
          const copyActions=make('div',null,'sh-template-actions');copyActions.append(copy);line.append(valueCopy,copyActions);
          copy.onclick=async()=>{
            try{await navigator.clipboard.writeText(value);copy.textContent='Copied';feedback.textContent=label+' copied.';}
            catch{feedback.textContent='Copy unavailable. Select the text to copy it.';}
          };
          details.append(line);
        }
        const search=make('a','Search company online','sh-tag-pill');search.href='https://www.google.com/search?q='+encodeURIComponent([row.company,row.city,row.state_code].filter(Boolean).join(' '));search.target='_blank';search.rel='noopener noreferrer';researchLinks.append(search);
        let profiles=0;
        for(const field of ['website','instagram','instagram_url','facebook','facebook_url','linkedin','linkedin_url']) {
          const value=row[field];if(typeof value!=='string')continue;
          try{const url=new URL(value);if(!['http:','https:'].includes(url.protocol))continue;const link=make('a',field.replace('_url',''),'sh-tag-pill');link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';researchLinks.append(link);profiles++;}catch{}
        }
        if(!profiles)homework.append(make('p','No website or social profile links are on file. Search the business and verify any profile before mentioning it.','sh-sheet-help'));
        loaded=true;ack.disabled=false;proceed.disabled=!ack.checked;
      }).catch(error=>{notes.value='Prospect review could not be loaded.';feedback.textContent=error.message;});
    });
    return reviewPending;
  };

  // Register the mandatory review before initializing the optional call guide.
  // A call-guide failure must not leave dialing permanently blocked.
  try {
    window.SteadyHandsCallGuide?.mount?.({process,leadId});
  } catch (error) {
    console.error('Unable to initialize call guide:', error);
  }

  // All transcript state is scoped to the selected lead and stays in memory.
  const history=$('transcriptHistory'), feedback=$('transcriptFeedback'), actions=$('keywordActions');
  let current=leadId(), entries=[], callActive=$('refEndCall')?.dataset.callState==='active'||!!document.querySelector('#refRegularCallTracker:not([hidden])');
  const applied=new Set(), imported=new Set();
  let inboundCallSid=null, inboundMatchedCrmId=null;
  const inboundIdentityBySid=new Map();
  const inboundTargetValid=()=>Boolean(inboundCallSid&&inboundMatchedCrmId&&leadId()===inboundMatchedCrmId);
  let syncTimer=null, since=null, syncEpoch=0, syncBusy=false, drainUntil=0, activeCallSid=null;
  function resetLead() {
    const id=leadId();if(id===current)return;
    if(inboundCallSid){current=id;applied.clear();$('keywordFeedback').textContent='';if(!inboundTargetValid()){entries=[];history.value='';feedback.textContent='Incoming call transcript is available in Incoming calls until the caller is verified.';}renderActions();return;}
    stopSync();inboundCallSid=null;callActive=false;current=id;entries=[];applied.clear();history.value='';renderActions();feedback.textContent='';
    $('keywordFeedback').textContent='';
    $('refTranscriptStatus').textContent='';
  }
  function appendEntry({id,speaker,text,seconds,final=true}) {
    resetLead();
    if(!id||id!==current||!final||!['agent','prospect','unknown'].includes(speaker)||typeof text!=='string'||!text.trim())return;
    entries.push({speaker,text:text.trim().slice(0,4000),time:new Date(),seconds});
    entries.sort((a,b)=>(a.seconds ?? Infinity)-(b.seconds ?? Infinity));
    if(entries.length>200)entries.shift();
    history.value=entries.map(entry=>`${entry.time.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'})} · ${entry.speaker==='prospect'?'Prospect':entry.speaker==='agent'?'You':'Transcript'}: ${entry.text}`).join('\n\n');
    history.scrollTop=history.scrollHeight;
    $('refTranscriptStatus').textContent=`${entries.length} entries · newest at bottom`;
    renderActions();
  }
  function renderActions() {
    // Latest prospect utterances determine suggestions; a DNC request takes precedence.
    const recent=(inboundCallSid&&!inboundTargetValid()?[]:entries).filter(entry=>entry.speaker==='prospect').slice(-4).map(entry=>entry.text).join(' ');
    const suggested=core.suggestions(recent).filter(action=>!applied.has(action.id));actions.replaceChildren();
    for(const action of suggested) {
      const button=make('button',action.label,'sh-tag-pill');button.type='button';actions.append(button);
      const id=current;
      button.onclick=async()=>{
        if(leadId()!==id){resetLead();return;}
        if(!id){$('keywordFeedback').textContent='Select the caller’s prospect to apply this suggestion.';return;}
        const incoming=inboundCallSid;
        if(incoming&&!inboundTargetValid()){$('keywordFeedback').textContent='Caller identity is not verified for this prospect.';return;}
        button.disabled=true;
        try {
          if(incoming){
            const {row}=await core.load(window.steadyHandsCRMClient,id);
            if(incoming!==inboundCallSid||leadId()!==id)return;
            const target=[row.company||row.name||'selected prospect',row.phone].filter(Boolean).join(' · ');
            if(!window.confirm('Apply “'+action.label+'” to '+target+'? Confirm this is the incoming caller’s prospect.'))return;
          }
          if(action.id==='dnc'){$('refDoNotCall')?.click();}
          else if(action.id.startsWith('tag:')){await core.addTag(window.steadyHandsCRMClient,id,action.id.slice(4));if(leadId()===id)applied.add(action.id);}
          else if(action.id==='phone'){window.dispatchEvent(new CustomEvent('steadyhands:call-guide-step',{detail:{checklistStep:3}}));$('processPhone').focus();}
          else {if(!window.steadyHandsOpenOutreachTool)throw Error('Call tools are still loading. Please try again.');await window.steadyHandsOpenOutreachTool(action.id);}
          if(leadId()===id){$('keywordFeedback').textContent=action.id.startsWith('tag:')?'Tag saved.':'Review the action before saving.';renderActions();}
        }catch(error){if(leadId()===id)$('keywordFeedback').textContent=error.message;}
        finally{button.disabled=false;}
      };
    }
    if(!suggested.length){const empty=make('span',null,'suggested-action-empty');empty.setAttribute('aria-hidden','true');actions.append(empty);}
  }
  window.addEventListener('steadyhands:inbound-caller-identity',event=>{
    const {callSid,crmId,matchStatus}=event.detail||{};
    if(!/^CA[0-9a-fA-F]{32}$/.test(callSid||''))return;
    const matched=matchStatus==='matched'&&/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(crmId||'')?String(crmId):null;
    inboundIdentityBySid.set(callSid,matched);
    if(callSid!==inboundCallSid)return;
    inboundMatchedCrmId=matched;
    if(!inboundTargetValid()){entries=[];history.value='';feedback.textContent='Caller not verified for the selected prospect. Use the Incoming calls transcript panel.';renderActions();}
  });
  window.addEventListener('steadyhands:inbound-transcript',event=>{
    const detail=event.detail||{};
    if(detail.cleared){
      if(inboundCallSid){inboundCallSid=null;inboundMatchedCrmId=null;entries=[];history.value='';feedback.textContent='';$('refTranscriptStatus').textContent='';renderActions();}
      return;
    }
    if(detail.started){
      stopSync();callActive=false;current=leadId();inboundCallSid=detail.callSid;inboundMatchedCrmId=inboundIdentityBySid.get(detail.callSid)||null;entries=[];applied.clear();history.value='';renderActions();
      feedback.textContent='Waiting for the incoming transcript…';$('refTranscriptStatus').textContent='Incoming call';
    }
    if(!inboundCallSid||detail.callSid!==inboundCallSid)return;
    if(!inboundTargetValid()){
      entries=[];history.value='';feedback.textContent='Caller not verified for the selected prospect. Use the Incoming calls transcript panel.';renderActions();return;
    }
    if(detail.transcript){
      history.value=detail.displayText??detail.transcript.transcript??'';history.scrollTop=history.scrollHeight;
      entries=core.transcriptSegments(detail.transcript);renderActions();
    }
    if(detail.message!==undefined)feedback.textContent=detail.message;
    // Only finalized caller speech produces suggestions; applying one requires
    // an explicitly confirmed prospect. Provisional speech is display-only.
  });
  window.addEventListener('steadyhands:transcript',event=>appendEntry(event.detail||{}));
  window.addEventListener('steadyhands:call-lead-ready',resetLead);
  async function refreshTranscript() {
    if(syncBusy)return;
    if(!callActive && drainUntil && Date.now()>=drainUntil){clearInterval(syncTimer);syncTimer=null;return;}
    const id=leadId(),epoch=syncEpoch;if(!id||!activeCallSid)return;
    syncBusy=true;
    try {
      const row=await core.fetchTranscript(window.steadyHandsCRMClient,id,since,activeCallSid);
      if(epoch!==syncEpoch||leadId()!==id)return;
      if(!row){feedback.textContent='Waiting for the call transcript…';return;}
      const segments=core.transcriptSegments(row);
      segments.forEach((segment,i)=>{
        const key=JSON.stringify([row.id,segment.segmentId ?? i,segment.speaker,segment.text]);
        if(!imported.has(key)){imported.add(key);appendEntry({id,...segment});}
      });
      const provisional=Object.values(row.interim_segments||{}).filter(part=>part?.text).map(part=>(part.speaker==='agent'?'You':part.speaker==='customer'?'Prospect':'Transcript')+' (speaking…): '+part.text);
      const finalText=entries.map(entry=>`${entry.speaker==='prospect'?'Prospect':entry.speaker==='agent'?'You':'Transcript'}: ${entry.text}`).join('\n');
      history.value=[finalText,...provisional].filter(Boolean).join('\n');
      feedback.textContent=row.transcription_status==='error' ? 'Transcription error: '+(row.transcription_error || 'Please ask your administrator to check Twilio.') : '';
      if(!callActive && (Date.now()>=drainUntil)){clearInterval(syncTimer);syncTimer=null;}
    }catch(error){if(epoch===syncEpoch)feedback.textContent=error.message;}
    finally{syncBusy=false;}
  }
  function stopSync() {if(syncTimer)clearInterval(syncTimer);syncTimer=null;since=null;syncEpoch++;imported.clear();activeCallSid=null;}
  function callState(event) {
    const nextActive=!!event.detail?.active;
    if(nextActive)inboundCallSid=null;
    if(nextActive&&!callActive){stopSync();drainUntil=0;entries=[];history.value='';$('refTranscriptStatus').textContent='';renderActions();since=new Date(Date.now()-5000).toISOString();syncTimer=setInterval(refreshTranscript,1500);refreshTranscript();}
    if(!nextActive&&callActive){drainUntil=Date.now()+30000;refreshTranscript();}
    callActive=nextActive;
    if(nextActive&&event.detail?.callSid){activeCallSid=event.detail.callSid;refreshTranscript();}
  }
  window.addEventListener('steadyhands:call-state',callState);
  window.addEventListener('steadyhands:regular-call-state',()=>{feedback.textContent='Live transcription is available for calls made through the app.';});
  const selected=$('selectedLeadTop');if(selected)new MutationObserver(resetLead).observe(selected,{childList:true,subtree:true,attributes:true,attributeFilter:['data-crm-id']});
  window.addEventListener('steadyhands:lead-disposition',event=>{if(event.detail?.id===current&&event.detail.action==='dnc'){applied.add('dnc');renderActions();}});
  window.addEventListener('pagehide',()=>{stopSync();});
  icons();
})();
