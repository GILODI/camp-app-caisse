-- ============================================================================
-- Correction d'un ticket d'une journée passée, réservée à l'admin.
--
-- Jusqu'ici une erreur repérée le lendemain n'était plus corrigeable :
-- l'écran vendeur ne montre que la journée en cours, et correct_ticket
-- daterait le ticket de remplacement d'AUJOURD'HUI (create_ticket force la
-- date du jour), ce qui déplacerait la vente de journée.
--
-- Cette fonction porte un NOM DISTINCT et ne modifie aucune fonction
-- existante : aucun risque d'ambiguïté de surcharge (« Could not choose the
-- best candidate function »). create_ticket, cancel_ticket et correct_ticket
-- restent strictement inchangées.
--
-- À coller dans Supabase > SQL Editor et exécuter une fois.
-- ============================================================================

create or replace function public.admin_correct_ticket(
  p_ticket_id uuid,
  p_vendeur text,
  p_mode_paiement text,
  p_items jsonb,
  p_by text
)
returns table (id uuid, numero integer, vente_date date, total_ttc numeric)
language plpgsql
as $$
declare
  v_event_id uuid;
  v_vente_date date;
  v_numero integer;
  v_ticket_id uuid;
  v_total numeric(10,2);
  v_item jsonb;
begin
  if jsonb_array_length(p_items) = 0 then
    raise exception 'Un ticket doit contenir au moins une ligne';
  end if;

  select t.event_id, t.vente_date
    into v_event_id, v_vente_date
    from public.tickets t
   where t.id = p_ticket_id;

  if v_event_id is null then
    raise exception 'Ticket introuvable';
  end if;

  -- Refuse déjà les journées clôturées (garde interne à cancel_ticket).
  perform public.cancel_ticket(p_ticket_id, 'Correction (admin)', p_by);

  select coalesce(sum((elem->>'prix_unitaire')::numeric * (elem->>'quantite')::integer), 0)
    into v_total
    from jsonb_array_elements(p_items) as elem;

  -- Numéro pris sur la séquence de la journée d'origine, pas celle du jour.
  v_numero := public.next_ticket_number(v_event_id, v_vente_date);

  insert into public.tickets (event_id, numero, vente_date, vendeur, mode_paiement, total_ttc, remplace_ticket_id)
  values (v_event_id, v_numero, v_vente_date, p_vendeur, p_mode_paiement, v_total, p_ticket_id)
  returning tickets.id into v_ticket_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into public.ticket_items (ticket_id, reference, designation, prix_unitaire, pvp_ttc, prix_modifie, quantite)
    values (
      v_ticket_id,
      v_item->>'reference',
      v_item->>'designation',
      (v_item->>'prix_unitaire')::numeric,
      nullif(v_item->>'pvp_ttc', '')::numeric,
      coalesce((v_item->>'prix_modifie')::boolean, false),
      (v_item->>'quantite')::integer
    );
  end loop;

  return query select v_ticket_id, v_numero, v_vente_date, v_total;
end;
$$;
