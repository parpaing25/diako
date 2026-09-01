# DIAKO — règles de détail

*Sorti du `CLAUDE.md` le 30/08/2026 : celui-ci est chargé en entier à chaque session, ce fichier-ci ne s'ouvre que quand le sujet le concerne. Le `CLAUDE.md` garde ce qui bloque, ce fichier porte le détail.*

## Règles remontées des fiches mémoire (30/08/2026)

*Ces 18 règles ne vivaient que dans les fiches mémoire : elles ne s'appliquaient donc que si on pensait à ouvrir la fiche. Reprises telles qu'elles y figurent, **sans avoir été recontrôlées à la source** — chacune porte sa fiche d'origine.*

- **Les migrations Diako ne s'appliquent pas depuis une session : la CLI echoue en 42501 « permission denied to alter role cli_login_postgres » malgre linked: true. Passer par le connecteur Supabase ou l'editeur SQL, et quand le connecteur est deconnecte, ecrire la migration, la pousser, et lister l'ordre dans docs/A-APPLIQUER.md. Pour savoir ce qui est deja en base sans la CLI : sonder en REST avec la cle anon (select=<colonne>&limit=1 → 400 si absente ; rpc/<fn> → 404 si absente).**
  *Le CLAUDE.md de Diako impose supabase/migrations/ mais ne dit pas COMMENT appliquer — donc chaque session recommence par un db push qui echoue avec un message qui accuse le jeton. Pire : sans la sonde REST, on ne sait pas ce qui est reellement en base et on code contre un schema suppose.*
  `diako-appliquer-migrations`
- **Fermer une fonction Postgres sur Supabase demande TROIS revocations (anon+authenticated, puis public, puis encore anon a cause des ALTER DEFAULT PRIVILEGES) et se verifie par has_function_privilege(), jamais par le linter — il cache ses resultats. MAIS is_staff() / is_admin() sans argument doivent RESTER executables par anon : une policy est evaluee avec les droits de l'appelant.**
  *Les deux moities coutent. Une revocation incomplete laisse une fonction ouverte a anon en croyant l'avoir fermee (ouvrir_conversation() est restee executable pendant 5 migrations). Une revocation de trop a casse le sitemap et TOUT lien /post/:id partage sur WhatsApp, en 42501 — invisible depuis le site, qui lit par des fonctions SECURITY DEFINER.*
  `diako-projet-voyage`
- **types.ts se complete A LA MAIN : `supabase gen types` en bloc casse ~15 appels (nullabilite | null vs | undefined, export Profile perdu).**
  *Ce n'est pas seulement une regle absente : le fichier de regles dit aujourd'hui LE CONTRAIRE. Quelqu'un qui suit le CLAUDE.md a la lettre casse le build. Une regle fausse coute plus cher qu'une regle manquante.*
  `diako-design-final-v4`
- **tsc --noEmit sur un tsconfig « solution » (files: []) ne verifie RIEN : viser tsconfig.app.json.**
  *Le CLAUDE.md prescrit la commande sans la reserve, et la CI de Diako a un verrou de typage BLOQUANT presente comme un avantage sur Fonenako. Un verrou vert sur zero fichier verifie est pire qu'aucun verrou : il donne la confiance sans la garantie.*
  `diako-projet-voyage`
- **Apres toute migration ou route nouvelle, verifier explicitement TROIS choses : la contrainte CHECK en base, le sitemap, et types.ts. Une liste de valeurs vit toujours a deux endroits — le code et la contrainte.**
  *Quatre des six boutons de reaction etaient refuses par Postgres (23514) depuis leur mise en ligne, et le sitemap soumettait 178 destinations sur une URL a parametre sans page. Profil commun : ajoute d'un cote, jamais repercute de l'autre, et rien n'echoue bruyamment — avec 1 membre inscrit, l'echec ressemblait a de la latence.*
  `diako-design-final-v4`
- **place:places!inner(...) est obligatoire pour filtrer sur une table liee : sans !inner, PostgREST garde la ligne avec place = null. Et PostgREST plafonne toute reponse a 1 000 lignes SANS LE DIRE — tout compte affiche vient d'une RPC, tout parcours complet boucle par pages.**
  *Deux mensonges silencieux de la meme couche. Le filtre « a l'air de marcher tout en ne filtrant rien » ; le plafond de 1 000 lignes fausse tout compteur affiche. Le CLAUDE.md interdit deja l'offset — mais /explorer a quand meme perdu des destinations DEUX FOIS a cause d'une limite fixe (80 pour 87 lieux, puis 200 pour 524).*
  `diako-projet-voyage`
- **Un declencheur ne porte JAMAIS de cle : il transmet uniquement un identifiant de ligne, et le contenu est relu en base. Une requete forgee ne peut alors que reexpedier une vraie notification a son vrai destinataire.**
  *Fonenako a service_role EN CLAIR dans deux triggers (constat SEC-04 de son propre audit, toujours ouvert) : la definition d'une fonction est lisible par plus de monde qu'on ne croit, et service_role contourne toute RLS. Diako a demontre que le motif sans cle marche — donc il n'y a aucune raison de reproduire l'autre.*
  `diako-projet-voyage`
- **Realtime ne marche pas parce qu'on s'abonne : la table doit etre AJOUTEE a la publication supabase_realtime, et sans `replica identity full` un UPDATE ne transporte que la cle primaire.**
  *La publication ne contenait AUCUNE table : le canal postgres_changes s'abonnait sans jamais rien recevoir, un message n'apparaissait qu'au rechargement. Rien dans le code ne le montre — c'est de la configuration de base invisible depuis l'application. Le CLAUDE.md dit ou activer le realtime, jamais comment le rendre effectif.*
  `diako-projet-voyage`
- **Ne pas mettre NOT NULL sur un champ que la collecte ne peut pas toujours remplir.**
  *Le NOT NULL de room_types.base_price_ar faisait jeter 46 chambres sur 77 EN SILENCE. Une grille sans prix vaut mieux que pas de grille — et c'est en tension directe avec la regle « le prix ne voyage jamais seul » du meme fichier, donc le prochain reflexe sera de remettre du NOT NULL.*
  `diako-bot-collecte`
- **Rejouer toute ecriture nouvelle dans une transaction annulee avant de publier.**
  *Trois tables portent trois vocabulaires d'unites de prix (posts.price_unit refuse « plat », menu_items refuse « personne », pages.price_min_unit accepte « plat ») et pages.website exige ^https?:// quand le modele rend « www.x.com » : l'INSERT ENTIER part en 23514. Une moisson entiere se perd sur une valeur d'enum, apres la collecte, donc apres tout le cout.*
  `diako-bot-collecte`
- **Sources de donnees : jamais Google, Booking ni TripAdvisor (ODbL contre leurs CGU). Wikipedia (CC BY-SA) et Commons exigent l'auteur ET la licence AFFICHES ; une image dont l'auteur n'est pas lisible ne se telecharge pas.**
  *C'est la seule regle de Diako a risque JURIDIQUE, et elle n'est ecrite que dans une fiche memoire. Le CLAUDE.md interdit d'inventer une donnee mais pas d'en prendre une la ou on n'a pas le droit — or l'annuaire est vide, donc la tentation est permanente et 19 images ont deja ete ecartees a ce titre.*
  `diako-bot-collecte + diako-projet-voyage`
- **Le projet Supabase gratuit se met en pause tout seul ; pendant COMING_UP la base repond mais `public` est VIDE et auth.users = 0. NE RIEN RECREER — le volume n'est pas encore monte.**
  *Recreer quoi que ce soit a ce moment-la serait catastrophique — et c'est exactement le reflexe devant une base vide en production, site hors ligne, sous pression. Verifie apres coup : 37 tables, 178 lieux, 28 posts, tout etait intact.*
  `diako-projet-voyage`
- **Jamais deux cles `colors:` dans tailwind.config.ts : en JS la seconde ecrase la premiere et tout le theme disparait d'un coup.**
  *Le CLAUDE.md de Diako consacre plusieurs lignes aux couleurs (contrastes, #F4633A qui ne porte jamais de texte) mais pas a la facon de les perdre TOUTES en une ligne. Piege deja rencontre, et le symptome — site entierement depeint — n'oriente pas vers la config.*
  `diako-design-carte`
- **Le jeton ~/.fonenako-secrets/supabase_token.txt porte un BOM UTF-8 a retirer (sed 's/^\xEF\xBB\xBF//') sinon la CLI refuse un jeton valide. Le Site URL Supabase reste sur http://localhost:3000 par defaut : tout lien de confirmation renvoie l'utilisateur sur sa propre machine.**
  *Le BOM fait conclure a un jeton mort ou revoque et lance une chasse au mauvais gibier — il a deja fallu le rediagnostiquer deux fois (Diako, agent-diako). Le Site URL casse l'inscription de TOUS les nouveaux utilisateurs sans qu'aucun test local ne le voie.*
  `diako-appliquer-migrations + diako-projet-voyage`
- **DesignSync : list_projects rend une liste VIDE et ce n'est PAS une panne — il ne liste que les PROJECT_TYPE_DESIGN_SYSTEM. Passer directement par get_project / list_files avec l'UUID du lien claude.ai/design/p/<uuid>.**
  *Le CLAUDE.md nomme les .dc.html de reference sans dire qu'ils sont accessibles ni comment. Une liste vide se lit comme « pas d'acces » : on redemande les maquettes a Andry ou on redesigne a l'aveugle, alors que les sources sont lisibles ET modifiables.*
  `diako-claude-design-access`
- **Dans un .htaccess o2switch : <Directory> est INTERDIT et php_flag n'existe pas sous PHP-FPM — les deux rendent 500 sur TOUT le site. Proteger un dossier d'images par un .htaccess dedie place dans le dossier. Et base: './' dans Vite casse toute route imbriquee (depuis /p/x, ./assets → /p/assets) : base: '/'.**
  *Le CLAUDE.md de Fonenako parle deja de public/.htaccess (pour les secrets) — c'est l'endroit exact ou manque l'avertissement. Les deux pieges ont ete rencontres EN DIRECT pendant un deploiement, site entier a 500 : c'est le moment ou l'on a le moins de temps pour chercher.*
  `diako-projet-voyage`
- **Tiger Protect (anti-bot o2switch) : un client sans cookie de challenge recoit 307 puis 406 (HTML d'erreur). Les navigateurs passent seuls ; tout appel serveur-a-serveur ou en ligne de commande exige un bocal a cookies (curl -c/-b -L + User-Agent navigateur).**
  *Vaut pour toute verification de mise en ligne depuis une session : sans cookie, le controle post-deploiement rend une erreur qui n'a rien a voir avec le deploiement, et on conclut a tort que la livraison a echoue — ou on corrige quelque chose qui n'etait pas casse.*
  `diako-projet-voyage`
- **Recharger le referentiel local d'un bot apres tout ajout de colonne au cache.**
  *site_web est reste vide 12 heures et la moisson n'a RIEN trouve cote annuaire — resultat nul, sans erreur, donc lu comme « la source est epuisee ». Apres rechargement : 165 sites ajoutes, dont 163 rattaches a une fiche existante. Le cout est une conclusion fausse sur le rendement d'une source.*
  `diako-bot-collecte`
