-- An account without a sh_associate_pause row is active, not an unknown pause.
-- Preserve the function signature, security context, and real pause restrictions.
create or replace function public.sh_get_my_access_pause()
returns table(is_paused boolean, status text, selected_track text)
language sql stable security definer set search_path to ''
as $function$
  select coalesce(p.status = 'pause_action_needed', false),
         coalesce(p.status, 'active'),
         p.selected_track
  from (select auth.uid() as uid) u
  left join public.sh_associate_pause p on p.user_id = u.uid
  where u.uid is not null;
$function$;
