-- Refine money-request notifications: when the distributor acts directly on a
-- FOS-pending request, both fos_status and distributor_status change in one
-- update. Only the final outcome (distributor branch) should notify — not the
-- intermediate "FOS accepted / awaiting distributor" messages. Use elsif so a
-- distributor decision supersedes the FOS-step notifications.

create or replace function public.notify_money_request()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_retailer text;
  v_fos text;
  v_account text;
  v_data jsonb;
  v_amt numeric;
  fos_changed boolean;
  dist_changed boolean;
  is_auto boolean;
begin
  select full_name into v_retailer from public.profiles where id = NEW.retailer_id;
  select full_name into v_fos from public.profiles where id = NEW.fos_id;
  select name into v_account from public.accounts where id = NEW.account_id;
  v_retailer := coalesce(v_retailer, 'Retailer');

  if TG_OP = 'INSERT' then
    if NEW.distributor_status = 'approved'
       and coalesce(NEW.distributor_notes, '') like 'Manual adjustment by distributor%' then
      v_amt := coalesce(NEW.final_amount, NEW.requested_amount);
      perform add_notif(NEW.retailer_id, 'adjustment',
        'Balance adjusted',
        'Your outstanding was increased by ' || inr(v_amt) || ' on ' || coalesce(v_account,''),
        jsonb_build_object('request_id', NEW.id, 'amount', v_amt, 'account', v_account, 'direction', 'up'));
      return NEW;
    end if;
    if NEW.distributor_status = 'approved' then return NEW; end if;
    perform add_notif(NEW.fos_id, 'req_new',
      'New money request',
      v_retailer || ' requested ' || inr(NEW.requested_amount) || ' on ' || coalesce(v_account,''),
      jsonb_build_object('request_id', NEW.id, 'retailer', v_retailer, 'amount', NEW.requested_amount, 'account', v_account));
    perform add_notif(NEW.distributor_id, 'req_new_dist',
      'New request (awaiting FOS)',
      v_retailer || ' requested ' || inr(NEW.requested_amount) || ' — ' || coalesce(v_fos,'FOS'),
      jsonb_build_object('request_id', NEW.id, 'retailer', v_retailer, 'fos', v_fos, 'amount', NEW.requested_amount, 'account', v_account));
    return NEW;
  end if;

  fos_changed  := NEW.fos_status is distinct from OLD.fos_status;
  dist_changed := NEW.distributor_status is distinct from OLD.distributor_status;
  is_auto := dist_changed and NEW.distributor_status = 'approved'
             and coalesce(NEW.distributor_notes, '') like 'Auto-approved%';

  v_data := jsonb_build_object('request_id', NEW.id, 'retailer', v_retailer, 'fos', v_fos, 'account', v_account);

  if is_auto then
    v_amt := coalesce(NEW.final_amount, NEW.fos_amount, NEW.requested_amount);
    perform add_notif(NEW.retailer_id, 'req_approved',
      'Request approved', inr(v_amt) || ' approved on ' || coalesce(v_account,''),
      v_data || jsonb_build_object('amount', v_amt));
    perform add_notif(NEW.distributor_id, 'req_auto',
      'Auto-approved', v_retailer || ': ' || inr(v_amt) || ' (FOS authority)',
      v_data || jsonb_build_object('amount', v_amt));
    return NEW;
  end if;

  -- A distributor decision is the final word (covers direct overrides where the
  -- FOS stage was stamped in the same update) → only outcome notifications.
  if dist_changed then
    if NEW.distributor_status = 'approved' then
      v_amt := coalesce(NEW.final_amount, NEW.fos_amount, NEW.requested_amount);
      perform add_notif(NEW.retailer_id, 'req_approved',
        'Request approved', inr(v_amt) || ' approved on ' || coalesce(v_account,''),
        v_data || jsonb_build_object('amount', v_amt));
      perform add_notif(NEW.fos_id, 'req_approved_fos',
        'Distributor approved', v_retailer || ': ' || inr(v_amt),
        v_data || jsonb_build_object('amount', v_amt));
    elsif NEW.distributor_status = 'declined' then
      perform add_notif(NEW.retailer_id, 'req_declined',
        'Request declined', 'Declined by distributor',
        v_data || jsonb_build_object('by', 'distributor'));
      perform add_notif(NEW.fos_id, 'req_declined_fos',
        'Distributor declined', v_retailer || '''s request', v_data);
    end if;
  elsif fos_changed then
    if NEW.fos_status = 'accepted' then
      perform add_notif(NEW.retailer_id, 'req_fos_accepted',
        'Accepted by FOS', inr(coalesce(NEW.fos_amount, NEW.requested_amount)) || ' — awaiting distributor',
        v_data || jsonb_build_object('amount', coalesce(NEW.fos_amount, NEW.requested_amount)));
      perform add_notif(NEW.distributor_id, 'req_awaiting_dist',
        'Approval needed', v_retailer || ' ' || inr(coalesce(NEW.fos_amount, NEW.requested_amount)),
        v_data || jsonb_build_object('amount', coalesce(NEW.fos_amount, NEW.requested_amount)));
    elsif NEW.fos_status = 'edited' then
      perform add_notif(NEW.retailer_id, 'req_fos_edited',
        'Revised by FOS', 'Now ' || inr(NEW.fos_amount) || ' — awaiting distributor',
        v_data || jsonb_build_object('amount', NEW.fos_amount, 'requested', NEW.requested_amount));
      perform add_notif(NEW.distributor_id, 'req_awaiting_dist',
        'Approval needed', v_retailer || ' ' || inr(NEW.fos_amount),
        v_data || jsonb_build_object('amount', NEW.fos_amount));
    elsif NEW.fos_status = 'declined' then
      perform add_notif(NEW.retailer_id, 'req_declined',
        'Request declined', 'Declined by ' || coalesce(v_fos, 'FOS'),
        v_data || jsonb_build_object('by', 'fos'));
    end if;
  end if;

  return NEW;
end; $$;
