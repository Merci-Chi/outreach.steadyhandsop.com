-- Batch 3: bind handoff notifications to the exact handoff record.
-- Execute manually after review. No production SQL has been run by ChatGPT.
BEGIN;
ALTER TABLE public.outreach_notifications
 ADD COLUMN IF NOT EXISTS handoff_id uuid REFERENCES public.outreach_lead_handoffs(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS outreach_notifications_handoff_id_idx
 ON public.outreach_notifications(handoff_id)
 WHERE handoff_id IS NOT NULL;

-- The current send RPC writes a handoff immediately before its notification,
-- in the same transaction. This trigger records that handoff's UUID.
CREATE OR REPLACE FUNCTION public.outreach_attach_handoff_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
 IF NEW.kind = 'lead_handoff' AND NEW.handoff_id IS NULL THEN
  SELECT h.id INTO NEW.handoff_id
  FROM public.outreach_lead_handoffs h
  WHERE h.recipient_id = NEW.recipient_id
    AND h.crm_id::text = NEW.lead_id
    AND h.created_at <= COALESCE(NEW.created_at, now()) + interval '5 seconds'
  ORDER BY h.created_at DESC
  LIMIT 1;
 END IF;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS outreach_notification_handoff_link ON public.outreach_notifications;
CREATE TRIGGER outreach_notification_handoff_link
 BEFORE INSERT ON public.outreach_notifications
 FOR EACH ROW WHEN (NEW.kind = 'lead_handoff')
 EXECUTE FUNCTION public.outreach_attach_handoff_notification();

-- Backfill ONLY notifications that can be matched to one unambiguous handoff.
WITH candidates AS (
 SELECT n.id AS notice_id, MIN(h.id::text)::uuid AS handoff_id, COUNT(*) AS matches
 FROM public.outreach_notifications n
 JOIN public.outreach_lead_handoffs h
 ON h.recipient_id=n.recipient_id AND h.crm_id::text=n.lead_id
 AND h.created_at BETWEEN n.created_at - interval '10 seconds' AND n.created_at + interval '10 seconds'
 WHERE n.kind='lead_handoff' AND n.handoff_id IS NULL
 GROUP BY n.id
)
UPDATE public.outreach_notifications n SET handoff_id=c.handoff_id
FROM candidates c WHERE c.notice_id=n.id AND c.matches=1;
COMMIT;
