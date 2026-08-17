-- ============================================================================
-- 0102 — LE LIEU D'UNE PUBLICATION DEVIENT CLIQUABLE
--
-- 🔴 CE QUI MANQUAIT, ET POURQUOI ÇA A DURÉ. Chaque publication du fil porte une
--    puce de lieu — « Nosy Be », « Toliara ». Elle était bien cliquable, mais
--    elle menait à `/recherche?q=Nosy+Be` : une recherche PLEIN TEXTE, qui
--    redemande au serveur de retrouver par son nom un lieu que la publication
--    désignait déjà par son `place_id`. Un aller-retour et un écran d'écart,
--    pour arriver — parfois — sur la bonne fiche.
--
--    La cause est écrite noir sur blanc dans `src/lib/api.ts` : « PAS DE SLUG
--    ICI, ET C'EST ASSUMÉ POUR L'INSTANT ». Le fil ne vient pas d'un `select`
--    client mais de `get_feed` et `feed_filtre`, et ces deux fonctions ne
--    rendaient pas le slug. Le contournement était donc côté écran.
--
-- ⚠ LES DEUX FONCTIONS RENDENT DU `jsonb` : ajouter une clé ne change aucune
--   signature, donc ni 42P13 (`create or replace` ne peut pas changer un type
--   de retour) ni surcharge fantôme (deux signatures rendent la fonction
--   inappelable par PostgREST, erreur 300 / PGRST203). Un client qui ignore la
--   clé nouvelle continue de fonctionner à l'identique.
--
-- ⚠ POURQUOI UN PATCH TEXTUEL PLUTÔT QU'UNE RÉÉCRITURE. `feed_filtre` fait une
--   centaine de lignes, porte le classement par pertinence, le boost, la
--   distance et quatre modes. La recopier ici pour ajouter UNE clé, c'est
--   prendre le risque d'en perdre une ligne en chemin — et ce serait invisible
--   jusqu'au jour où un mode ne classerait plus rien. On remplace donc un
--   fragment EXACT, on échoue bruyamment s'il n'est pas trouvé, et on PROUVE
--   ensuite que la clé sort réellement.
--
-- ⚠ `left join`, PAS `join`. Une publication dont le lieu a été fusionné ou
--   supprimé garderait son texte mais perdrait sa ligne : un `join` la ferait
--   DISPARAÎTRE DU FIL. Le slug vaut alors NULL et la puce reste du texte, ce
--   qu'elle était hier.
-- ============================================================================

do $$
declare
  v_def    text;
  v_patch  text;
  v_avant  constant text := '''place'', p.place, ''dish'', p.dish, ''page_name'', p.page_name,';
  v_apres  constant text := '''place'', p.place, ''place_slug'', pl.slug, ''dish'', p.dish, ''page_name'', p.page_name,';
begin
  -- ── ① get_feed : il faut AUSSI lui ajouter la jointure ────────────────────
  v_def := pg_get_functiondef('public.get_feed(timestamptz,integer)'::regprocedure);

  if position(v_avant in v_def) = 0 then
    raise exception '0102 : le fragment attendu est absent de get_feed — la fonction a changé, relire avant de patcher';
  end if;
  if position('join public.places pl' in v_def) > 0 then
    raise exception '0102 : get_feed joint déjà places — le patch ferait doublon';
  end if;

  v_patch := replace(v_def, v_avant, v_apres);
  v_patch := replace(
    v_patch,
    'join public.profiles pr on pr.id = p.author_id',
    'join public.profiles pr on pr.id = p.author_id'
      || E'\n    left join public.places pl on pl.id = p.place_id');

  execute v_patch;

  -- ── ② feed_filtre : la jointure `pl` existe déjà ──────────────────────────
  v_def := pg_get_functiondef(
    'public.feed_filtre(text,timestamptz,integer,double precision,double precision,double precision)'::regprocedure);

  if position(v_avant in v_def) = 0 then
    raise exception '0102 : le fragment attendu est absent de feed_filtre — la fonction a changé, relire avant de patcher';
  end if;
  if position('left join public.places pl on pl.id = p.place_id' in v_def) = 0 then
    raise exception '0102 : feed_filtre ne joint plus places — le slug n''aurait aucune source';
  end if;

  execute replace(v_def, v_avant, v_apres);
end $$;

-- ============================================================================
-- CONTRÔLE — on PROUVE que la clé sort, et qu'elle sort JUSTE.
-- ⚠ Un patch textuel qui « a l'air » d'avoir marché est exactement le genre de
--   changement qui se découvre cassé en production : on interroge donc les
--   fonctions pour de vrai.
-- ============================================================================
do $$
declare
  v        jsonb;
  v_slug   text;
  v_attendu text;
  v_id     uuid;
begin
  v := public.get_feed(null, 5);
  if jsonb_array_length(v) = 0 then
    raise warning '0102 : le fil est vide — contrôle impossible, mais le patch est posé.';
    return;
  end if;

  -- ① La clé existe sur chaque entrée (même à NULL) : une clé absente
  --    obligerait le client à distinguer « pas de lieu » de « champ oublié ».
  if exists (
    select 1 from jsonb_array_elements(v) e where not (e ? 'place_slug')
  ) then
    raise exception '0102 : get_feed rend des publications sans la clé place_slug';
  end if;

  -- ② Le slug rendu est CELUI du lieu de la publication, pas celui d'à côté.
  select (e ->> 'place_slug'), (e ->> 'id')::uuid
    into v_slug, v_id
    from jsonb_array_elements(v) e
   where e ->> 'place_slug' is not null
   limit 1;

  if v_slug is null then
    raise warning '0102 : aucune des publications lues n''a de lieu rattaché — le rapprochement n''a pas pu être vérifié.';
  else
    select pl.slug into v_attendu
      from public.posts p join public.places pl on pl.id = p.place_id
     where p.id = v_id;
    if v_attendu is distinct from v_slug then
      raise exception '0102 : slug rendu = %, attendu = % pour la publication %', v_slug, v_attendu, v_id;
    end if;
  end if;

  -- ③ Le même contrôle sur l'autre fonction : les deux écrans doivent se
  --    comporter pareil, sinon la puce serait cliquable dans un mode et pas
  --    dans l'autre — le genre d'écart qu'on met des jours à reproduire.
  v := public.feed_filtre('tout', null, 5, null, null, null);
  if jsonb_array_length(v) > 0 and exists (
    select 1 from jsonb_array_elements(v) e where not (e ? 'place_slug')
  ) then
    raise exception '0102 : feed_filtre rend des publications sans la clé place_slug';
  end if;

  -- ④ Le fil n'a pas rétréci : c'est le risque exact d'une jointure mal posée.
  if jsonb_array_length(public.get_feed(null, 30))
     <> least((select count(*) from public.posts where status = 'published'), 30) then
    raise exception '0102 : get_feed ne rend plus le même nombre de publications — la jointure en a écarté';
  end if;
end $$;
