-- DRAFT: review and apply separately from the JavaScript release.
-- Allow only active, enabled salespeople and administrators to read catalog options.
-- Do not grant anonymous access or catalog write privileges.
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='public.crm_filter_catalog'::regclass AND relrowsecurity) THEN
  RAISE EXCEPTION 'Catalog must have RLS enabled before granting access';
 END IF;
 IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='crm_filter_catalog') THEN
  RAISE EXCEPTION 'Catalog policies changed; review them before granting access';
 END IF;
END $$;
CREATE POLICY crm_filter_catalog_active_sales_read
 ON public.crm_filter_catalog FOR SELECT TO authenticated
 USING (
  (SELECT auth.uid()) IS NOT NULL AND EXISTS (
   SELECT 1 FROM public.team_permissions tp
   JOIN public.callcenter_profiles cp ON cp.user_id=tp.user_id
   WHERE tp.user_id=(SELECT auth.uid()) AND tp.active IS TRUE
    AND upper(tp.role) IN ('SALES','ADMIN') AND cp.disabled_at IS NULL
  )
 );
GRANT SELECT ON public.crm_filter_catalog TO authenticated;
