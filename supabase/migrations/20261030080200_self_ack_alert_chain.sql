-- Re-review of PR #58, Low: a sole superadmin's acknowledgement of an alert about themselves raises a high alert of its
-- own (20261029080400), which names them too, so acknowledging that one the same way raised another, without end.
-- Acknowledging an alert_self_ack_sole_superadmin alert now writes its event and audit row and raises nothing more:
-- the first self-acknowledgement has already gone out of band, and the chain stops there.

-- Replaces the 20261029080400 version.
create or replace function public.acknowledge_alert_as_sole_superadmin(p_alert_id uuid, p_reason text) returns void
  language plpgsql security definer
  set search_path = ''
as $$
declare
  wait constant interval := interval '24 hours';
  alert record;
  step jsonb;
begin
  perform internal.require_superadmin_step_up();
  if length(btrim(coalesce(p_reason, ''))) not between 10 and 500 then
    raise exception 'acknowledging an alert about yourself needs a reason of 10 to 500 characters' using errcode = '22023';
  end if;
  if (select count(*) from public.profiles p where p.role = 'superadmin' and p.is_active) <> 1 then
    raise exception 'only the sole active superadmin acknowledges an alert about themselves; ask another superadmin'
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  select a.id, a.rule, a.notified_at, a.acknowledged_at, a.details into alert
  from public.security_alerts a where a.id = p_alert_id for update;
  if not found then
    raise exception 'no alert %', p_alert_id using errcode = 'P0002';
  end if;
  if alert.acknowledged_at is not null or not (coalesce(alert.details -> 'involved', '[]') ? auth.uid()::text)
     or alert.notified_at is null or alert.notified_at > now() - wait then
    raise exception 'this alert is open, names you and went out of band 24 hours ago, or it takes the ordinary path'
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;

  update public.security_alerts set acknowledged_by = auth.uid() where id = p_alert_id;
  step := jsonb_build_object('alert_id', p_alert_id, 'rule', alert.rule, 'by', auth.uid(), 'reason', btrim(p_reason));
  insert into public.security_events (event_type, severity, actor_id, entity_type, entity_id, details)
  values ('alert_self_ack_sole_superadmin', 'high', auth.uid(), 'security_alerts', p_alert_id::text, step);
  if alert.rule <> 'alert_self_ack_sole_superadmin' then
    insert into public.security_alerts (rule, severity, fingerprint, title, details)
    values ('alert_self_ack_sole_superadmin', 'high', 'alert_self_ack_sole_superadmin:' || p_alert_id,
            'Superadmin tunggal menutup peringatan tentang dirinya', step - 'reason');
  end if;
  perform internal.log_audit('security.alert_self_ack_sole_superadmin', 'security_alerts', p_alert_id::text,
                             step - 'alert_id');
end;
$$;
