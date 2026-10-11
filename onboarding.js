(() => {
 const client = window.supabase.createClient('https://glonbvrcudwuzjundrii.supabase.co','sb_publishable_VZbed_uuOXSE744UrAfHXw_z2xDdYtr',{auth:{persistSession:true,autoRefreshToken:true}});
 let step=1, currentUser=null;
 const $=id=>document.getElementById(id);
 const form=$('setupForm'), error=$('setupError');
 const titles=['Make it yours','Choose your experience','How will you call?'];
 const subs=['Create your Steady Hands profile.','Pick your appearance and notification preference.','Choose how you want to contact customers.'];
 const methodKey='steadyhands-default-calling-method-v1';
 function render(){document.querySelectorAll('.setup-panel').forEach(p=>p.hidden=Number(p.dataset.step)!==step);$('setupStep').textContent=`Account setup · ${step} of 3`; $('setupTitle').textContent=titles[step-1];$('setupDesc').textContent=subs[step-1];$('setupBack').hidden=step===1;$('setupNext').textContent=step===3?'Finish setup ✓':'Continue →';error.textContent='';}
 client.auth.getUser().then(({data,error:e})=>{if(e||!data?.user){location.replace('login.html');return;}currentUser=data.user;const joinedAt=Date.parse(data.user.created_at||'')||0;if(data.user.user_metadata?.steadyhands_onboarding_complete===true || joinedAt<Date.parse('2026-10-11T00:00:00Z'))location.replace('index.html');}).catch(()=>{error.textContent='Unable to verify your session. Please log in again.';});
 $('setupBack').addEventListener('click',()=>{step=Math.max(1,step-1);render();});
 form.addEventListener('submit',async e=>{
  e.preventDefault();error.textContent='';
  if(!currentUser){error.textContent='Your account is still loading. Try again.';return;}
  if(step===1){let name=$('setupName').value.trim(),pass=$('setupPassword').value;if(!name){error.textContent='Enter your display name.';return;}if(!/^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/.test(pass)){error.textContent='Use 8+ characters, one capital letter, one number, and one symbol.';return;}if(pass!==$('setupConfirm').value){error.textContent='Passwords do not match.';return;}}
  if(step<3){step++;render();return;}
  $('setupNext').disabled=true;$('setupNext').textContent='Saving...';
  try{
    const display_name=$('setupName').value.trim(); const password=$('setupPassword').value;
    const theme=form.elements.setupTheme.value;const notifications=form.elements.setupNotify.value==='yes';const callMethod=form.elements.setupCall.value;
    // Updating the Supabase Auth password is required, not merely saving it to local storage.
    const {error:pwError}=await client.auth.updateUser({password});if(pwError)throw pwError;
    const {error:metaError}=await client.auth.updateUser({data:{display_name,steadyhands_theme:theme,steadyhands_notifications:notifications,steadyhands_calling_method:callMethod,steadyhands_onboarding_complete:true}});if(metaError)throw metaError;
    try{await client.from('callcenter_profiles').update({display_name,theme_preference:theme}).eq('user_id',currentUser.id);}catch(err){console.warn('Profile sync deferred',err);}
    try{localStorage.setItem('steadyhands-theme',theme); localStorage.setItem(methodKey,callMethod);}catch{}
    if(notifications&&'Notification' in window&&Notification.permission==='default'){try{await Notification.requestPermission();}catch{}}
    location.replace('index.html');
  }catch(err){error.textContent=err?.message||'Unable to finish setup.';$('setupNext').disabled=false;$('setupNext').textContent='Finish setup ✓';}
 });
 render();
})();