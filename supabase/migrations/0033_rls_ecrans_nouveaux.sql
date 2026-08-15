-- ============================================================================
-- 0033 — RLS SUR LES TABLES DE 0032
--
-- 🔴 SANS CE FICHIER, LES HUIT TABLES CRÉÉES EN 0032 SONT OUVERTES À TOUT LE
--    MONDE. Une table Postgres sans `enable row level security` est lisible et
--    modifiable par la clé anonyme, qui est publiée dans le paquet JavaScript
--    du site. `bookings` porte des numéros de téléphone, `trip_requests` des
--    budgets : ce n'est pas une négligence de confort.
--
-- ⚠ `auth.uid()` EST ENVELOPPÉ DANS UN SOUS-SELECT partout. Sans cela,
--   Postgres le réévalue à chaque ligne au lieu d'une fois par requête ; sur
--   une liste de plusieurs milliers de lignes la différence se voit.
-- ============================================================================

alter table public.dish_tastings   enable row level security;
alter table public.tour_departures enable row level security;
alter table public.attractions     enable row level security;
alter table public.events          enable row level security;
alter table public.trip_requests   enable row level security;
alter table public.trip_offers     enable row level security;
alter table public.bookings        enable row level security;
alter table public.guides          enable row level security;

/* ── LE CARNET DE GOÛTS ────────────────────────────────────────────────────
   Chacun gère le sien, et ne voit que le sien. Le carnet public viendra avec
   un drapeau explicite sur le profil — pas par défaut. */
drop policy if exists dish_tastings_lecture on public.dish_tastings;
create policy dish_tastings_lecture on public.dish_tastings
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists dish_tastings_ecriture on public.dish_tastings;
create policy dish_tastings_ecriture on public.dish_tastings
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists dish_tastings_maj on public.dish_tastings;
create policy dish_tastings_maj on public.dish_tastings
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
drop policy if exists dish_tastings_suppr on public.dish_tastings;
create policy dish_tastings_suppr on public.dish_tastings
  for delete to authenticated using (user_id = (select auth.uid()));

/* ── SITES, ÉVÉNEMENTS, GUIDES, DÉPARTS ────────────────────────────────────
   Contenu éditorial : lecture publique quand c'est publié, écriture réservée
   à l'équipe. ⚠ Un site à visiter derrière un mur de connexion ne sert
   personne — c'est exactement le trafic de recherche qu'on vise. */
drop policy if exists attractions_lecture on public.attractions;
create policy attractions_lecture on public.attractions
  for select to anon, authenticated using (is_published);

drop policy if exists events_lecture on public.events;
create policy events_lecture on public.events
  for select to anon, authenticated using (is_published);

drop policy if exists guides_lecture on public.guides;
create policy guides_lecture on public.guides
  for select to anon, authenticated using (is_published);

-- Les départs suivent la visibilité de leur circuit.
drop policy if exists tour_departures_lecture on public.tour_departures;
create policy tour_departures_lecture on public.tour_departures
  for select to anon, authenticated
  using (exists (select 1 from public.tours t where t.id = tour_id));

/* ── PROJETS DE VOYAGE ─────────────────────────────────────────────────────
   ⚠ LE VOYAGEUR VOIT SON PROJET. Les professionnels voient les projets
     OUVERTS — c'est le principe même de l'écran : l'offre vient au voyageur.
     Mais ils ne voient ni son nom ni son téléphone, qui ne sont pas dans
     cette table : le contact passe par une offre acceptée, puis la messagerie. */
drop policy if exists trip_requests_sien on public.trip_requests;
create policy trip_requests_sien on public.trip_requests
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists trip_requests_ouverts_aux_pros on public.trip_requests;
create policy trip_requests_ouverts_aux_pros on public.trip_requests
  for select to authenticated
  using (status = 'ouvert'
         and exists (select 1 from public.pages p
                      where p.owner_id = (select auth.uid()) and p.is_published));

drop policy if exists trip_requests_creation on public.trip_requests;
create policy trip_requests_creation on public.trip_requests
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists trip_requests_maj on public.trip_requests;
create policy trip_requests_maj on public.trip_requests
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

/* ── OFFRES ────────────────────────────────────────────────────────────────
   Visibles du voyageur destinataire et du pro qui les a écrites. Personne
   d'autre : une agence ne doit pas lire les propositions de ses concurrents. */
drop policy if exists trip_offers_lecture on public.trip_offers;
create policy trip_offers_lecture on public.trip_offers
  for select to authenticated
  using (author_id = (select auth.uid())
         or exists (select 1 from public.trip_requests r
                     where r.id = request_id and r.user_id = (select auth.uid())));

drop policy if exists trip_offers_creation on public.trip_offers;
create policy trip_offers_creation on public.trip_offers
  for insert to authenticated
  with check (author_id = (select auth.uid())
              and exists (select 1 from public.pages p
                           where p.id = page_id and p.owner_id = (select auth.uid())
                             and p.is_published));

drop policy if exists trip_offers_maj on public.trip_offers;
create policy trip_offers_maj on public.trip_offers
  for update to authenticated using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));

/* ── DEMANDES ──────────────────────────────────────────────────────────────
   ⚠ LES COORDONNÉES DU VOYAGEUR NE SONT VISIBLES QUE DU PRO DESTINATAIRE.
     C'est la règle du design final, et c'est une table qui porte des numéros
     de téléphone en clair. */
drop policy if exists bookings_auteur on public.bookings;
create policy bookings_auteur on public.bookings
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists bookings_destinataire on public.bookings;
create policy bookings_destinataire on public.bookings
  for select to authenticated
  using (exists (select 1 from public.pages p
                  where p.id = page_id and p.owner_id = (select auth.uid())));

drop policy if exists bookings_creation on public.bookings;
create policy bookings_creation on public.bookings
  for insert to authenticated with check (user_id = (select auth.uid()));

-- Le pro fait avancer le statut de ses propres demandes.
drop policy if exists bookings_maj_pro on public.bookings;
create policy bookings_maj_pro on public.bookings
  for update to authenticated
  using (exists (select 1 from public.pages p
                  where p.id = page_id and p.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.pages p
                       where p.id = page_id and p.owner_id = (select auth.uid())));
