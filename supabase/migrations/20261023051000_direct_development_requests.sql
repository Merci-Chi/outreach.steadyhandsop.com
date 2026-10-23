-- Development Team goes straight into Admin -> DEVELOP. No recipient assignment.
-- Review and run manually in Supabase SQL Editor; ChatGPT has NOT run this SQL.
BEGIN;
CREATE OR REPLACE FUNCTION public.outreach_submit_development_request(
 p_crm_id uuid, p_notes text DEFAULT ''
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
 v_sender uuid := auth.uid();
 v_lead public.crm%rowtype;
 v_request_id bigint;
BEGIN
 IF v_sender IS NULL THEN
  RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501';
 END IF;
 SELECT * INTO v_lead FROM public.crm
 WHERE id=p_crm_id AND assigned_user_id=v_sender AND COALESCE(admin_archived,false)=false
 FOR UPDATE;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'Prospect is not assigned to you' USING ERRCODE='42501';
 END IF;
 INSERT INTO public.development_requests(
   id,crm_id,submitted_by,company_name,phone,business_needs
 ) VALUES (
   nextval('public.development_requests_id_seq'::regclass),
   v_lead.id::text,
   v_sender,
   COALESCE(NULLIF(v_lead.company,''),NULLIF(v_lead.name,''),'Prospect'),
   COALESCE(v_lead.phone,''),
   COALESCE(NULLIF(left(btrim(p_notes),2000),''),'Development team review requested')
 ) RETURNING id INTO v_request_id;
 RETURN v_request_id;
END;
$$;
REVOKE ALL ON FUNCTION public.outreach_submit_development_request(uuid,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.outreach_submit_development_request(uuid,text)
 TO authenticated;
COMMIT;
