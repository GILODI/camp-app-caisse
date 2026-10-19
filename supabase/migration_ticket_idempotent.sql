-- ============================================================================
-- Création de ticket idempotente : un renvoi ne peut plus créer de doublon.
--
-- Le problème : quand le réseau lâche, le téléphone met la vente en file
-- d'attente et la renvoie plus tard. Si le serveur avait en réalité déjà
-- enregistré la vente et que seule la confirmation s'est perdue en route, le
-- renvoi créait un SECOND ticket — chiffre d'affaires et stock comptés deux
-- fois, sans que le vendeur le sache.
--
-- La parade : chaque vente porte un identifiant unique (client_ref), généré
-- par le téléphone avant le premier envoi. Un renvoi de la même vente
-- retrouve le ticket déjà créé au lieu d'en créer un autre.
--
-- À coller dans Supabase > SQL Editor et exécuter une fois, en entier.
-- À EXÉCUTER AVANT la fusion du code côté application.
--
-- Additive : ajoute une colonne, un index et UNE NOUVELLE FONCTION. Ne
-- modifie ni create_ticket ni aucune donnée existante. La nouvelle fonction
-- porte un nom distinct de create_ticket : aucun risque de surcharge
-- ambiguë (« Could not choose the best candidate function »).
-- ============================================================================

alter table public.tickets add column if not exists client_ref uuid;

-- Unique par événement. Partiel : les tickets antérieurs (sans référence) et
-- ceux créés par correction ne sont pas concernés.
create unique index if not exists tickets_client_ref_idx
  on public.tickets (event_id, client_ref)
  where client_ref is not null;

create or replace function public.create_ticket_idempotent(
  p_client_ref uuid,
  p_event_id uuid,
  p_vendeur text,
  p_mode_paiement text,
  p_items jsonb
)
returns table (id uuid, numero integer, vente_date date, total_ttc numeric)
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_ticket record;
begin
  if p_client_ref is null then
    raise exception 'Référence de vente requise';
  end if;

  -- Sérialise les appels portant la MÊME référence. Cas visé : le renvoi
  -- arrive alors que la requête d'origine est encore en cours de traitement
  -- côté serveur (réseau lent). Le second appel attend la fin du premier,
  -- puis retrouve son ticket. Le verrou est libéré à la fin de la transaction.
  perform pg_advisory_xact_lock(hashtextextended(p_client_ref::text, 0));

  select t.id, t.numero, t.vente_date, t.total_ttc
    into v_ticket
    from public.tickets t
   where t.event_id = p_event_id
     and t.client_ref = p_client_ref;

  -- Vente déjà enregistrée : on renvoie le ticket existant, tel quel. Ce
  -- contrôle passe AVANT la garde de clôture de create_ticket, volontairement
  -- — un renvoi tardif d'une vente déjà acceptée doit rester inoffensif.
  if found then
    return query select v_ticket.id, v_ticket.numero, v_ticket.vente_date, v_ticket.total_ttc;
    return;
  end if;

  select c.id, c.numero, c.vente_date, c.total_ttc
    into v_ticket
    from public.create_ticket(p_event_id, p_vendeur, p_mode_paiement, p_items) as c;

  update public.tickets t
     set client_ref = p_client_ref
   where t.id = v_ticket.id;

  return query select v_ticket.id, v_ticket.numero, v_ticket.vente_date, v_ticket.total_ttc;
end;
$$;
