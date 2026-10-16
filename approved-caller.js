/* Admin-managed Twilio assignments are separate from personal SMS verification. */
(() => {
  'use strict';
  window.SteadyHandsApprovedCaller = async () => {
    const client = window.steadyHandsCRMClient;
    if (!client) throw new Error('CRM connection is not ready. Please try again.');
    const {data: auth, error: authError} = await client.auth.getUser();
    if (authError || !auth?.user?.id) throw new Error('Please sign in again.');
    const userId = auth.user.id;
    const {data: assignment, error: assignmentError} = await client
      .from('callcenter_phone_assignments').select('phone_number_id')
      .eq('user_id', userId).maybeSingle();
    if (assignmentError) throw new Error('Unable to check your phone assignment. Please try again.');
    if (!assignment?.phone_number_id) return null;
    const {data: number, error: numberError} = await client
      .from('callcenter_phone_numbers').select('id,phone_number,active,twilio_status')
      .eq('id', assignment.phone_number_id).maybeSingle();
    if (numberError) throw new Error('Unable to check your phone approval. Please try again.');
    if (!number || number.active !== true || number.twilio_status !== 'ready' ||
        !/^\+[1-9]\d{7,14}$/.test(String(number.phone_number || ''))) return null;
    return number;
  };
})();
