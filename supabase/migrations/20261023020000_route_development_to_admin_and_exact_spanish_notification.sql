-- Review and run manually in Supabase SQL Editor.
-- Developer handoffs are visible only on Admin -> DEVELOP via admin_development_handoffs().
-- Spanish recipients receive an Outreach notification with the exact handoff ID.
BEGIN;
CREATE OR REPLACE FUNCTION public.outreach_send_lead(
 p_crm_id uuid, p_recipient_id uuid, p_kind text, p_notes text DEFAULT ''
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
 v_sender uuid := auth.uid();
 v_id uuid;
 v_name text;
BEGIN
 IF v_sender IS NULL OR p_recipient_id=v_sender OR p_kind NOT IN ('spanish','development') THEN
  RAISE EXCEPTION 'Invalid handoff';
 END IF;
 PERFORM 1 FROM public.crm c
 WHERE c.id=p_crm_id AND c.assigned_user_id=v_sender AND COALESCE(c.admin_archived,false)=false
 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Prospect is not assigned to you'; END IF;
 IF NOT EXISTS (
  SELECT 1 FROM public.outreach_handoff_recipients r
  JOIN public.team_permissions p ON p.user_id=r.user_id AND p.active=true
  WHERE r.user_id=p_recipient_id AND r.kind=p_kind AND r.active=true
 ) THEN
  RAISE EXCEPTION 'Recipient is not eligible';
 END IF;
 SELECT COALESCE(NULLIF(c.company,''),NULLIF(c.name,''),'a lead')
 INTO v_name FROM public.crm c WHERE c.id=p_crm_id;
 INSERT INTO public.outreach_lead_handoffs(crm_id,sender_id,recipient_id,kind,notes)
 VALUES (p_crm_id,v_sender,p_recipient_id,p_kind,left(COALESCE(p_notes,''),2000))
 RETURNING id INTO v_id;
 IF p_kind='spanish' THEN
  INSERT INTO public.outreach_notifications(
   recipient_id,title,body,lead_id,kind,handoff_id
  ) VALUES (
   p_recipient_id,
   COALESCE(
    (SELECT NULLIF(split_part(u.email,'@',1),'') FROM auth.users u WHERE u.id=v_sender),
    'An associate'
   ) || ' has shared a lead with you',
   v_name || ' · Spanish-speaking sales transfer',
   p_crm_id::text, 'lead_handoff', v_id
  );
 END IF;
 RETURN v_id;
END;
$$;
-- All future notifications use explicit IDs; remove the inference trigger.
DROP TRIGGER IF EXISTS outreach_notification_handoff_link ON public.outreach_notifications;
REVOKE ALL ON FUNCTION public.outreach_send_lead(uuid,uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.outreach_send_lead(uuid,uuid,text,text) TO authenticated;
COMMIT;
