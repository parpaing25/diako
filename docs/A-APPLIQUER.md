# Ce qu'il reste à appliquer avant le lancement

Écrit le 17/08/2026. **Six migrations sont écrites et poussées, aucune n'est
appliquée.** Le code qui en dépend est déjà en ligne et échoue proprement en
attendant — il ne casse rien, mais les fonctions concernées ne rendent rien.

Je n'ai pas pu les appliquer moi-même : le connecteur Supabase est déconnecté,
et la CLI échoue à créer son rôle de connexion
(`permission denied to alter role cli_login_postgres`). Il faut passer par
l'éditeur SQL du tableau de bord Supabase, ou rebrancher le connecteur.

## L'ordre compte

```
0096_credit_photo_plats.sql              ← D'ABORD (0101 en dépend)
0097_console_administration.sql
0098_photos_proposees.sql                ← après 0097
0099_planificateur_le_graphe_des_troncons.sql
0100_planificateur_ou_manger_ou_dormir.sql  ← après 0099
0101_photos_des_plats.sql                ← après 0096
```

Chacune se termine par une assertion `raise exception` qui échoue bruyamment si
l'effet voulu n'est pas là. **Si une migration passe sans erreur, elle a
réellement fait ce qu'elle annonce** — c'est le contrat de ce dépôt.

## Ce que chacune débloque, et ce qui reste cassé sans elle

| Migration | Débloque | Sans elle |
|---|---|---|
| **0096** | Les trois colonnes d'attribution sur `dishes` | 0101 échoue |
| **0101** | 33 photos sur l'atlas des plats | 95 rectangles gris |
| **0097** | La console `/admin` | `/admin` répond « réservé » à tout le monde |
| **0098** | Les propositions de photo des visiteurs | L'onglet de modération est vide |
| **0099** | Le graphe des tronçons du planificateur | `/y-aller` affiche « le chargement a échoué » sur le bloc planificateur ; le reste de la page marche |
| **0100** | Où manger / où dormir par étape | Le plan sort sans ses arrêts |

## Trois gestes à faire à la main, en plus du SQL

1. **Créer le compte `contact.diako@gmail.com` et CONFIRMER son adresse.**
   L'accès admin est accordé sur l'e-mail *confirmé* : tant qu'il ne l'est pas,
   personne n'entre — et si on retirait cette exigence, n'importe qui pourrait
   s'inscrire à cette adresse et devenir administrateur.

2. **Régénérer `src/integrations/supabase/types.ts`** une fois les six
   migrations passées. Les nouvelles fonctions n'y sont pas ; les appels passent
   aujourd'hui par un échappatoire non typé, isolé et commenté en un seul point
   de chaque module.

3. **Le tableau de bord Supabase**, trois réglages qui ne passent pas par une
   migration : les cinq gabarits d'e-mail en français, la protection contre les
   mots de passe divulgués, et la mise à jour de Postgres.

## Un risque d'hébergement à regarder avant d'ouvrir les vannes

Pendant les tests, o2switch a répondu **429 sur la totalité des assets** — pas
seulement sur la page, mais sur le JS, le CSS et le manifeste — après une simple
rafale de chargements depuis une seule adresse IP. La page devient alors
entièrement blanche, sans message.

C'est le comportement de Tiger Protect. Sur les réseaux mobiles malgaches, où
des milliers d'abonnés partagent une poignée d'adresses publiques (CGNAT), ce
compteur peut voir tout un opérateur comme un seul visiteur. **Il vaut la peine
de relever ou de désactiver cette limite depuis cPanel avant d'annoncer le
site** : un lancement réussi ressemble beaucoup à une attaque, vu du limiteur.

## Ce qui reste ouvert dans la liste de lancement

Traités : la carte, les photos du fil, le rail, l'empilement des destinations,
les photos des plats, la page admin, les propositions de photo (côté serveur),
le planificateur.

Restent à faire : l'espace pro à rendre plus attractif avec saisie dynamique et
aperçu public (item 7), la modernisation des circuits (item 8), les photos
cliquables côté visiteur (item 9, la moitié client), et les événements avec
leurs miniatures — 0 affiche sur 42 événements aujourd'hui (item 11).
