# budgetetatfrancais.fr

Site statique qui visualise les dépenses publiques françaises à partir des
comptes nationaux de l'Insee. Un camembert cliquable, et toutes les sources
affichées en lecture seule sous forme de feuilles de calcul.

## Ce que le site montre

- **Le camembert** : la dépense publique ventilée selon la nomenclature COFOG,
  **année par année de 1995 à 2024** (curseur au-dessus du graphique). Chaque
  part s'ouvre pour révéler son détail (« Protection sociale » → vieillesse,
  maladie, famille, chômage…). Au-delà de six parts, le reste est replié dans
  « Autres », lui-même cliquable.

  L'ordre des parts et leurs couleurs sont figés sur l'année de référence (la
  plus récente), jamais sur le classement de l'année affichée : une couleur
  désigne donc toujours la même fonction quand on déplace le curseur.
- **L'état est dans l'URL** : le poste ouvert et l'année vivent dans le hash,
  `#poste=GF1002&annee=2010`. Un lien mène donc directement au bon niveau, et
  l'adresse se met à jour au fil de la navigation. L'écriture passe par
  `replaceState` : le bouton « précédent » ramène à la page d'avant, pas à la
  part précédente.
- **Un emoji par poste** : les sous-fonctions héritent de l'emoji de leur
  fonction parente, sauf exceptions listées dans `EMOJI` (app.js).
- **La cellule d'origine** : cliquer sur un poste qui n'a plus de sous-niveau
  affiche d'où sort le chiffre dans le classeur Insee — fichier, feuille,
  ligne, colonne et référence de cellule (par exemple `AH78` pour la
  vieillesse en 2024). Les coordonnées sont relevées par `build_data.py` au
  moment de la lecture du .xlsx, jamais saisies.

## Périmètre — à ne pas confondre avec « le budget de l'État »

Le total affiché (1 671,8 Md€ en 2024) couvre **l'ensemble des administrations
publiques** au sens de la comptabilité nationale : l'État et ses opérateurs, la
Sécurité sociale et les collectivités locales. C'est bien plus large que le
budget général de l'État voté au Parlement (~500 Md€), qui ignore la Sécurité
sociale et les collectivités.

## Deux millésimes, et pourquoi

L'Insee publie les grands agrégats et la ventilation par fonction à des rythmes
différents :

| Donnée | Année | Publication |
|---|---|---|
| Dépense totale, déficit, dette | 2025 | mai 2026 |
| Ventilation par fonction (COFOG) | 2024 | 2026 |
| Ventilation par fonction | 2025 | annoncée pour décembre 2026 |

Le camembert porte donc sur 1995-2024.

## Structure

```
index.html                      le camembert
debat.html                      pourquoi ce site existe (chiffres lus dans cofog.json)
recettes.html                   d'où vient l'argent — en cours de construction
assets/style.css                styles (fond blanc, sans dépendance externe)
assets/app.js                   camembert SVG, sans bibliothèque
assets/debat.js                 remplit les chiffres de debat.html
data/cofog.json                 LES DONNÉES — généré par scripts/build_data.py
data/meta.json                  registre des sources (pour check_links.py)
scripts/build_data.py           régénère data/cofog.json depuis insee.fr
scripts/check_links.py          vérifie que chaque lien cité répond encore
.github/workflows/donnees.yml   régénère les données, mensuel
.github/workflows/liens.yml     vérifie les liens, mensuel
CNAME                           budgetetatfrancais.fr
```

Aucune dépendance d'exécution : pas de CDN, pas de bibliothèque de graphiques,
pas d'étape de build. Les fichiers sont servis tels quels.

## D'où viennent les données

**Rien n'est récupéré depuis insee.fr au chargement de la page.** Le navigateur
lit un seul fichier, `data/cofog.json`, versionné dans le dépôt.

Ce fichier n'est pas saisi à la main : il est **généré** par
`scripts/build_data.py`, qui télécharge les .xlsx de l'Insee, les lit avec
openpyxl et écrit le JSON. Le pipeline est donc :

```
insee.fr (.xlsx)  --build_data.py-->  data/cofog.json  --fetch-->  page
      ^ manuel, à la main, une fois par an        ^ versionné      ^ à l'exécution
```

Pourquoi pas un appel direct à l'Insee depuis le navigateur : l'Insee ne publie
pas ces tableaux via une API JSON, les fichiers sont des .xlsx (qu'il faudrait
parser côté client), et le site est servi depuis un autre domaine sans en-têtes
CORS permettant de les lire. Un JSON figé est aussi plus rapide et reste
consultable si insee.fr est indisponible.

`data/meta.json` n'est plus lu par la page ; il sert uniquement de registre de
sources à `scripts/check_links.py`.

## Régénérer les données

```bash
pip install openpyxl requests
python scripts/build_data.py
```

Le script télécharge les tableaux 3.301 à 3.306 depuis insee.fr, les convertit,
et **échoue** si la somme des dix fonctions ne retombe pas sur le total publié.
Aucune valeur n'est saisie à la main dans les graphiques.

## Vérifier les liens

```bash
python scripts/check_links.py
```

Le site affiche ses sources : un lien mort est un bug visible. Le script teste
les URL de `index.html` et de `data/meta.json`, et sort en erreur si l'une ne
répond pas 200.

## Automatisation (GitHub Actions)

Les deux scripts tournent seuls, une fois par mois, et se lancent aussi à la
demande depuis l'onglet Actions :

| Workflow | Quand | Ce qu'il fait |
|---|---|---|
| `liens.yml` | le 1er du mois, et à chaque modification des liens | lance `check_links.py` ; échoue si une source ne répond plus |
| `donnees.yml` | le 15 du mois | relance `build_data.py` et commite `data/cofog.json` **uniquement si les chiffres ont changé** |

`donnees.yml` ignore le champ `genere`, qui change à chaque exécution : sans
cela le dépôt recevrait un commit vide de sens tous les mois.

Limite à connaître : ces workflows gardent le site synchronisé avec la page
Insee configurée dans `build_data.py`. Ils ne détectent pas l'arrivée d'un
nouveau millésime, qui vit à une autre adresse — voir la section suivante.

## Mise à jour annuelle

1. Repérer la nouvelle page Insee « Dépenses des administrations publiques
   ventilées par fonction en AAAA ».
2. Changer `BASE` dans `scripts/build_data.py` vers le nouvel identifiant de page.
   Attention : la casse des noms de fichiers varie d'un millésime à l'autre
   (`T_3301.xlsx` en 2024, `t_3301.xlsx` en 2023).
3. Relancer `build_data.py`, puis mettre à jour `data/meta.json` (bloc `macro`,
   `ratios`, et une entrée `cnAAAA` dans `sources`).
4. Relancer `check_links.py`.

## Images de partage et icônes

`scripts/build_images.py` génère `og-depenses.png` et `og-recettes.png` (aperçus
affichés quand un lien est partagé), `apple-touch-icon.png`, `favicon.ico` et
`favicon.svg`. Les camemberts des aperçus sont calculés depuis les données :
**relancer le script après chaque mise à jour des données**, sinon les aperçus
montrent les chiffres de l'année précédente. Il utilise les polices de Windows
(Georgia, Segoe UI).

```bash
pip install Pillow
python scripts/build_images.py
```

## Cache du navigateur

Les pages chargent `assets/*.js?v=N` et `assets/style.css?v=N`. Après une
modification de ces fichiers, **incrémenter le `v=`** dans les trois pages,
sinon les navigateurs (et le serveur intégré de l'IDE) continuent de servir
l'ancienne version. C'est la cause la plus fréquente d'un « ça ne marche pas »
alors que le code est correct.

## Développement local

```bash
python -m http.server 4173
```

## Déploiement

GitHub Pages sert la racine du dépôt. `CNAME` porte le domaine et `.nojekyll`
empêche Jekyll de filtrer les fichiers.

## Données

Données Insee reproduites sous
[Licence Ouverte / Open Licence](https://www.etalab.gouv.fr/licence-ouverte-open-licence).
Site indépendant, sans affiliation avec l'Insee ni aucune administration.
