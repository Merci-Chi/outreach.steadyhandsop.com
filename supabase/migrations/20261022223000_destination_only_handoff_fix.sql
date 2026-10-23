-- REQUIRED: run manually in Supabase SQL Editor; ChatGPT has NOT executed this.
-- 1) Fix GENERATED ALWAYS identity insert by omitting the id column.
-- 2) Route Spanish Sales automatically to an eligible recipient.
BEGIN;
CREATE OR REPLACE FUNCTION public.outreach_submit_development_request(
 p_crm_id uuid, p_notes text DEFAULT ''
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_sender uuid := auth.uid(); v_lead public.crm%rowtype; v_request_id bigint;
BEGIN
 IF v_sender IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_lead FROM public.crm
 WHERE id=p_crm_id AND assigned_user_id=v_sender
 AND COALESCE(admin_archived,false)=false FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Prospect is not assigned to you' USING ERRCODE='42501'; END IF;
 INSERT INTO public.development_requests(crm_id,submitted_by,company_name,phone,business_needs)
 VALUES (v_lead.id::text,v_sender,
 COALESCE(NULLIF(v_lead.company,''),NULLIF(v_lead.name,''),'Prospect'),
 COALESCE(v_lead.phone,''),
 COALESCE(NULLIF(LEFT(BTRIM(p_notes),2000),''),'Development team review requested'))
 RETURNING id INTO v_request_id;
 RETURN v_request_id;
END;
$$;
REVOKE ALL ON FUNCTION public.outreach_submit_development_request(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.outreach_submit_development_request(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.outreach_send_to_spanish_team(
 p_crm_id uuid, p_notes text DEFAULT ''
) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE v_user uuid:=auth.uid(); v_recipient uuid;
BEGIN
 IF v_user IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
 SELECT r.user_id INTO v_recipient
 FROM public.outreach_handoff_recipients r
 JOIN public.team_permissions tp ON tp.user_id=r.user_id AND tp.active
 WHERE r.kind='spanish' AND r.active AND r.user_id<>v_user
 ORDER BY r.user_id LIMIT 1;
 IF v_recipient IS NULL THEN
  RAISE EXCEPTION 'No other Spanish Sales associate is available to receive this transfer';
 END IF;
 RETURN public.outreach_send_lead(p_crm_id,v_recipient,'spanish',p_notes);
END;
$$;
REVOKE ALL ON FUNCTION public.outreach_send_to_spanish_team(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.outreach_send_to_spanish_team(uuid,text) TO authenticated;
COMMIT;