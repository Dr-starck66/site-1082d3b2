# ASTRA Discover Multisite — dossier de vérification des six sujets du 3 novembre 2026

**Préparé le 2 novembre 2026, sans publication anticipée.** Ce fichier est un dossier de sources et de contrôle éditorial, pas une page en ligne, pas une validation du 3 novembre. Aucun nouveau service, tâche ou déploiement.

## État de référence à relire avant toute écriture le 03/11

- Dépôt `Dr-starck66/site-1082d3b2`, branche `astra/discover-avocat-freehotels-20261102`, racine `astra/discover-multisite-20261102/`. Relire les fichiers, leur blob SHA et les routes Vercel LIVE : ne pas écraser les modifications concurrentes.
- Avocat : projet Vercel `prj_SPcrN3LuEwYM63SsuMv0OIdQ8AdB`, huit routes LIVE constatées le 02/11, article existant `/actualites/frais-colis-hors-ue-novembre-2026/`, hub `/actualites/`, router regex `^/actualites/([a-z0-9-]+)/?$`, archives `/blog/`, `/blog/page/2/`, `/blog/page/3/` indexables. Préserver le sitemap historique de 51 URL.
- FreeHotels : projet `prj_CRcKh820D2Sm3h9eFS2SkdNtPVcA`, cinq routes LIVE constatées le 02/11, article Berlin `/de/reise/berlin-weihnachtsmaerkte-2026-hotels/`, hub `/de/reise/aktuell/`, router allemand `^/de/reise/([a-z0-9-]+)/?$`. **Aucune route éditoriale française n'est présente dans ces cinq routes**. Pour les trois nouvelles pages françaises, vérifier d'abord le hub FR réellement accessible, puis créer une rubrique FR distincte et une route ciblée `^/fr/voyage/([a-z0-9-]+)/?$` avant toute publication. Ne pas réutiliser la route allemande pour une page française. Préserver le sitemap historique de 23 URL.
- Aucun des six articles ci-dessous n'est considéré comme publié dans ce dossier. Le 03/11, re-vérifier sources primaires, actualité, droits photos et routes, puis produire, indexer dans `sitemap-editorial.xml`, promouvoir Vercel LIVE et lire publiquement la canonique. Les guides saisonniers ne sont pas NewsArticle et restent hors `sitemap-news.xml`. Ne jamais antidater `datePublished`.

## 09:00 — AVOCAT #1 — remboursement d'une fraude bancaire

**Titre candidat** : « Victime d'une arnaque bancaire ? Ce que change l'arrêt européen du 15 octobre sur le remboursement ».
**Source primaire vérifiée le 02/11** : CJUE, arrêt C-70/25 [Tukowiecka], communiqué 147/26 daté du **15 octobre 2026**, https://curia.europa.eu/site/upload/docs/application/pdf/2026-10/cp260147fr.pdf ; explication administrative française https://www.service-public.gouv.fr/particuliers/actualites/A19102 (à relire le 03/11). Le communiqué distingue remboursement rapide d'une **opération non autorisée**, sauf soupçon fondé de fraude du payeur communiqué à l'autorité, et action ultérieure de la banque pour récupérer les pertes si négligence grave prouvée. **Ne pas généraliser aux paiements volontairement autorisés**, ne pas confondre droit belge et jurisprudence sur renvoi polonais, ne pas promettre remboursement systématique.
**Valeur originale** : tableau décisionnel non autorisé / autorisé, démarches et pièces à conserver, contestation, banque, médiation belge après vérification des voies de recours.
**URL candidate** : `/actualites/arnaque-bancaire-remboursement-cjue-octobre-2026/`; `Article`, non breaking du 03/11.

## 09:00 — FREEHOTELS #1 — Strasbourg

**Titre candidat** : « Marché de Noël de Strasbourg 2026 : ouverture le 27 novembre, où dormir ? »
**Source primaire vérifiée le 02/11** : portail officiel de Strasbourg, https://noel.strasbourg.eu/foire-aux-questions/ et https://noel.strasbourg.eu/fr/ . Dates **27 novembre au 24 décembre 2026**, ouverture 27/11 de 14 h à 21 h, 11 h–21 h les autres jours, fermeture 24/12 à 18 h, sous réserve de mise à jour officielle.
**Valeur originale** : comparer Grande Île (à pied, cœur de marché), Petite France (promenade, accès piéton) et secteur gare centrale (arrivée train et tram), coûts de déplacement, circulation et contrôle de l'hébergement ; aucun tarif hôtel ou disponibilité inventé.
**URL candidate** : `/fr/voyage/marche-noel-strasbourg-2026-ou-dormir/`; `Article` saisonnier, hors News sitemap.

## 14:00 — AVOCAT #2 — précompte professionnel belge

**Titre candidat** : « Votre salaire net change-t-il en novembre ? Les règles belges du précompte expliquées »
**Source primaire vérifiée le 02/11** : arrêté royal du **27 septembre 2026**, publié le 02/10, https://refli.be/fr/lex/2026007167 ; article 10 : revenus payés ou attribués à compter du **1er novembre 2026**, avec exceptions expresses lorsque calcul conforme au numéro 80 ou à la Partie 5 de l'annexe III de l'AR/CIR 92. Recouper avec SPF Finances https://finances.belgium.be/fr/entreprises/impot_des_societes/Precomptes/precompte_professionnel/calcul/ et Partena https://www.partena-professional.be/fr/nos-connaissances/infoflashes/precompte-professionnel-nouvelles-regles-partir-du-1er-novembre-2026 .
**Valeur originale** : expliquer la différence précompte/impôt définitif, revenus concernés, quotient conjugal, personnes à charge, retenue sur fiche de paie, exemples qualitatifs sans faux calculateur ni promesse de hausse pour tous.
**URL candidate** : `/actualites/precompte-professionnel-salaire-net-novembre-2026/`; `Article`.

## 14:00 — FREEHOTELS #2 — Lyon

**Titre candidat** : « Fête des Lumières 2026 à Lyon : dates et quartiers où réserver »
**Source primaire vérifiée le 02/11** : https://www.fetedeslumieres.lyon.fr/fr/page/horaires-et-dates-fete-des-lumieres-2026 : **5 au 8 décembre 2026**, samedi 19–23 h, dimanche 18–22 h, lundi et mardi 19–23 h, horaires particuliers pour le Parc de la Tête d'Or. Vérifier FAQ et programmation à nouveau le 03/11 : https://www.fetedeslumieres.lyon.fr/fr/faq/foire-aux-questions .
**Valeur originale** : Presqu'île, Vieux Lyon, quartiers connectés par TCL, contraintes de retour après spectacles, marche et accessibilité ; aucun hôtel, prix ou disponibilité imaginé.
**URL candidate** : `/fr/voyage/fete-lumieres-lyon-2026-hotels-quartiers/`; `Article` saisonnier.

## 19:00 — AVOCAT #3 — paiement fractionné

**Titre candidat** : « Paiement en plusieurs fois : ce qui change en Belgique à partir du 20 novembre 2026 »
**Texte légal exact identifié le 02/11** : loi belge du **20 juillet 2026**, publiée le **4 août 2026**, Moniteur n° **2026005817**, ELI https://www.ejustice.just.fgov.be/eli/loi/2026/07/20/2026005817/moniteur ; fiche Refli https://refli.be/fr/lex/2026005817 . Le texte intégral ELI n'a pas pu être récupéré par un lecteur web le 02/11 : **ne pas considérer ses articles et exceptions comme vérifiés dans le texte intégral**. Analyses disponibles : https://www.medenam.be/credit-a-la-consommation-mieux-proteger-les-utilisateurs/ et https://observatoire-credit.be/fr/nos-formations/421/nouveau-fc17-la-reforme-du-credit-a-la-consommation-a-la-lumiere-de-la-nouvelle-loi-du-20-juillet-2026-quelles-consequences-et-quel-impact-pour-le-consommateur-visioconference . Ces sources indiquent entrée en vigueur de la majorité des dispositions le **20 novembre 2026**, mais certaines plus tôt. Re-vérifier dans le Moniteur le régime transitoire, exceptions vendeur direct, BNPL tiers, crédit inférieur à 200 €, solvabilité et mineurs avant publication.
**Valeur originale** : scénarios BNPL tiers vs paiement direct sans frais, informations précontractuelles, droit de rétractation, impact pratique, et réserves d'application.
**URL candidate** : `/actualites/paiement-plusieurs-fois-belgique-novembre-2026/`; `Article`.

## 19:00 — FREEHOTELS #3 — Bruxelles

**Titre candidat** : « Bruxelles : Plaisirs d'Hiver 2026 du 27 novembre au 3 janvier, où dormir ? »
**Sources primaires vérifiées le 02/11** : organisateur https://www.plaisirsdhiver.be/infos-pratiques et Ville de Bruxelles https://www.bruxelles.be/plaisirs-dhiver : du **27 novembre 2026 au 3 janvier 2027**, 12–22 h en principe, fermeture à **18 h les 24 et 31 décembre et le 3 janvier** selon organisateur, sans spectacle Grand-Place ces jours-là.
**Valeur originale** : Grand-Place, Sainte-Catherine/Vismet, De Brouckère, Bruxelles-Central, accès à pied ou en transport selon localisation, hébergement et coût global sans prix en temps réel.
**URL candidate** : `/fr/voyage/bruxelles-plaisirs-hiver-2026-ou-dormir/`; `Article` saisonnier.

## Contrôle de publication 03/11 (par paire, sans duplication)

1. Relire branche et LIVE; sources primaires datées; vérifier photographie Wikimedia Commons réelle, licence, auteur, URL et largeur ≥1200 px (deux photos par article si possible); ne pas réutiliser une photo d'archive comme photographie de l'édition 2026.
2. Rédiger une analyse originale substantielle, titre honnête, datePublished au moment réel, auteur, sources, self-canonical, robots index/follow/max-image-preview:large, OG image et Article JSON-LD, liens internes.
3. Créer les fichiers HTML uniques, mettre à jour les hubs et `sitemap-editorial.xml` **sans altérer** les sitemaps historiques, les archives /blog/, ni le routage existant. Ne placer dans le News sitemap que les vraies NewsArticle publiées depuis moins de 48 heures.
4. Mettre à jour les pointeurs GitHub CDN au SHA **final** dans les routes Vercel ciblées, comparer staging aux règles LIVE, promouvoir, relire les pages et leurs canonicals depuis le domaine public. Noter PASS/PARTIAL/FAIL/UNVERIFIED par preuve ; Google Discover, Search Console et SEMrush restent UNVERIFIED sans mesures.

**Point bloquant à lever demain** : la route éditoriale française FreeHotels n'existe pas dans le projet LIVE consulté le 02/11; elle devra être ajoutée de façon isolée avant la première page FR, sans écraser les cinq routes existantes.
