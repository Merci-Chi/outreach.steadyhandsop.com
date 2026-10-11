(()=>{'use strict';
const button=document.getElementById('shStartSale');if(!button)return;
const p=new URLSearchParams(location.search),crmId=p.get('crm_id')||'',company=p.get('company')||'Business',preview=p.get('preview')||'';
const e=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const portalOrigin='https://portal.steadyhandsop.com';
button.addEventListener('click',()=>{
 if(!crmId){alert('Select a CRM lead from Outreach before starting a sale.');return;}
 const layer=document.createElement('div');layer.className='sh-sale-overlay';
 layer.innerHTML=`<div class="sh-sale-dialog" role="dialog" aria-modal="true" aria-label="Start sale"><header><h2>Start Sale</h2><button type="button" class="sh-sale-close" aria-label="Close">×</button></header><p>Invite <b>${e(company)}</b> to finish registration in the customer portal. Sending a link does not mark the sale as paid.</p><form id="shSaleForm"><label>Customer email *<input id="shSaleEmail" type="email" required maxlength="250" placeholder="customer@example.com" autocomplete="email"></label><div class="sh-preview-linked"><strong>Website preview</strong><span>${preview?'Automatically linked to the selected lead':'No preview attached to this lead'}</span>${preview?`<a href="${e(preview)}" target="_blank" rel="noopener noreferrer">Open preview</a>`:''}</div><label>Hosting interest<select id="shSalePlan"><option value="undecided">Not decided yet</option><option value="standard">Standard · $20/month</option><option value="backend">Backend · $30/month</option></select></label><label>Notes (optional)<textarea id="shSaleNotes" maxlength="2000" placeholder="Anything the customer mentioned"></textarea></label><p id="shSaleFeedback" class="sh-sale-note" role="status" aria-live="polite"></p><div id="shSaleResult" class="sh-sale-result" hidden><label>Personalized customer registration link<input id="shSaleLink" type="url" readonly></label><p>The customer can open this link to register. Their website preview will be attached automatically once the portal integration in Batch 2 is installed. No preview code is needed.</p><div class="sh-sale-actions"><button type="button" id="shSaleCopy">Copy Link</button><button type="button" id="shSaleShare">Share Link</button></div></div><div class="sh-sale-actions"><button type="button" id="shSaleCancel">Close</button><button class="primary" id="shSaleSave" type="submit">Create Registration Link</button></div></form></div>`;
 document.body.append(layer);const close=()=>layer.remove();layer.querySelector('.sh-sale-close').onclick=close;layer.querySelector('#shSaleCancel').onclick=close;layer.addEventListener('click',ev=>{if(ev.target===layer)close()});
 const feedback=layer.querySelector('#shSaleFeedback'),submit=layer.querySelector('#shSaleSave');
 layer.querySelector('#shSaleForm').addEventListener('submit',async ev=>{ev.preventDefault();submit.disabled=true;feedback.textContent='Creating customer invitation…';try{
  if(!preview||!/^https:\/\//i.test(preview))throw Error('This lead does not have a secure website preview URL. Attach the preview to the lead first.');
  const client=window.steadyHandsCRMClient;if(!client)throw Error('Please sign in to Outreach.');const {data:{user},error:authError}=await client.auth.getUser();if(authError||!user)throw Error('Please sign in to Outreach.');
  const customerEmail=layer.querySelector('#shSaleEmail').value.trim().toLowerCase();
  const payload={p_crm_id:crmId,p_company_name:company,p_preview_url:preview,p_customer_email:customerEmail,p_hosting_plan:layer.querySelector('#shSalePlan').value,p_stage:'interested',p_follow_up_at:null,p_notes:layer.querySelector('#shSaleNotes').value.trim()||null};
  const {data:saleId,error:saleError}=await client.rpc('sh_start_sale',payload);if(saleError)throw Error('Could not save the sale: '+saleError.message);
  const {data:token,error:inviteError}=await client.rpc('sh_create_portal_invite',{p_sale_id:saleId,p_email:customerEmail});
  if(inviteError)throw Error('Sale saved, but registration link could not be created: '+inviteError.message+' (Run Batch 1 SQL.)');
  if(!token||typeof token!=='string')throw Error('The server did not return an invitation token.');
  const link=portalOrigin+'/login.html?invite='+encodeURIComponent(token);
  layer.querySelector('#shSaleLink').value=link;layer.querySelector('#shSaleResult').hidden=false;submit.hidden=true;
  feedback.textContent='Registration invitation ready. Copy or share the link with the customer.';
  layer.querySelector('#shSaleCopy').onclick=async()=>{try{await navigator.clipboard.writeText(link);feedback.textContent='Link copied.';}catch{layer.querySelector('#shSaleLink').select();feedback.textContent='Select and copy the link above.';}};
  layer.querySelector('#shSaleShare').onclick=()=>{const message=`Hi! Here's your Steady Hands registration link for ${company}: ${link}`;if(navigator.share){navigator.share({title:'Steady Hands registration',text:message,url:link}).catch(()=>{});}else{location.href='mailto:'+encodeURIComponent(customerEmail)+'?subject='+encodeURIComponent('Your Steady Hands website registration')+'&body='+encodeURIComponent(message);}};
 }catch(err){feedback.textContent=err.message||'Could not create the registration link.';submit.disabled=false;}});
});
})();
