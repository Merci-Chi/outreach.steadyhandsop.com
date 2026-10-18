/* Shared authenticated Action Needed data access. No browser-owned assignments. */
(() => {
  'use strict';
  async function session() {
    const client = window.steadyHandsCRMClient;
    if (!client) throw new Error('Sign-in connection unavailable. Reload the page.');
    const {data,error} = await client.auth.getUser();
    if (error || !data?.user) throw new Error('Please sign in again.');
    return {client,userId:data.user.id};
  }
  async function load() {
    const {client,userId} = await session();
    const {data:assignment,error} = await client.from('outreach_action_assignments')
      .select('id,user_id,status,assigned_at,completed_at')
      .eq('user_id',userId).in('status',['assigned','completed']).maybeSingle();
    if (error) throw new Error('Action Needed is unavailable. Please contact your administrator.');
    if (!assignment) return {assignment:null};
    const {data:associate,error:associateError} = await client.from('outreach_associates')
      .select('user_id,current_basis,start_date').eq('user_id',userId).single();
    if (associateError || !associate) throw new Error('Your associate record is unavailable. Please contact your administrator.');
    return {assignment,associate};
  }
  async function submit(assignmentId,state) {
    const {client} = await session();
    const {data,error} = await client.rpc('outreach_action_submit_v2',{
      p_assignment_id:assignmentId,
      p_selected_path:state.path,
      p_local_timezone:state.localZone,
      p_work_timezone:state.workZone,
      p_shift_start_minutes:state.start,
      p_preferred_weekly_hours:state.hours,
      p_quota_acknowledged:state.quotaAcknowledged === true,
      p_confirmed_start_date:state.path==='hourly' ? state.startDate : null,
      p_phone_setup:state.phoneSetup,
      p_us_phone_number:state.phoneSetup==='needs_number' ? null : state.phoneNumber
    });
    if (error) throw new Error(error.message || 'Could not confirm your submission. Return to Action Needed to check its status.');
    return data;
  }
  async function extend(assignmentId,previous,next) {
    const {client} = await session();
    const {data,error} = await client.rpc('outreach_action_extend_start_date',{
      p_assignment_id:assignmentId,p_expected_start_date:previous,p_new_start_date:next
    });
    if (error) throw new Error(error.message || 'Could not confirm your new start date. Reload before trying again.');
    if (data !== next) throw new Error('Could not confirm your new start date. Reload before trying again.');
    return data;
  }
  window.OutreachActions = {load,submit,extend};
})();
