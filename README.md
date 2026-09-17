# budgetetatfrancais.fr

Site statique qui visualise les dépenses publiques françaises à partir des
comptes nationaux de l'Insee. Un camembert cliquable, et toutes les sources
affichées en lecture seule sous forme de feuilles de calcul.

## Ce que le site montre

- **Le camembert** : la dépense publique 2024 ventilée selon la nomenclature
  COFOG. Chaque part s'ouvre pour révéler son détail (« Protection sociale » →
  vieillesse, maladie, famille, chômage…). Au-delà de six parts, le reste est
  replié dans « Autres », lui-même cliquable.
- **Les feuilles** : sources, fichiers Excel de l'Insee, données du graphique
  au niveau affiché, et chiffres clés 2025.

## Périmètre — à ne pas confondre avec « le budget de l'État »

Le total affiché (1 714 Md€ en 2025) couvre **l'ensemble des administrations
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

Le site affiche donc la dernière donnée disponible pour chaque question, et le
dit explicitement sous le graphique.

## Structure

```
index.html            page unique
assets/style.css      styles (fond blanc, sans dépendance externe)
assets/app.js         camembert SVG + feuilles, sans bibliothèque
data/cofog.json       généré par scripts/build_data.py
data/meta.json        agrégats 2025 + table des sources (maintenu à la main)
scripts/build_data.py régénère data/cofog.json depuis insee.fr
scripts/check_links.py vérifie que chaque lien cité répond encore
CNAME                 budgetetatfrancais.fr
```

Aucune dépendance d'exécution : pas de CDN, pas de bibliothèque de graphiques,
pas d'étape de build. Les fichiers sont servis tels quels.

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
les 37 URL citées et sort en erreur si l'une ne répond pas 200.

## Mise à jour annuelle

1. Repérer la nouvelle page Insee « Dépenses des administrations publiques
   ventilées par fonction en AAAA ».
2. Changer `BASE` dans `scripts/build_data.py` vers le nouvel identifiant de page.
   Attention : la casse des noms de fichiers varie d'un millésime à l'autre
   (`T_3301.xlsx` en 2024, `t_3301.xlsx` en 2023).
3. Relancer `build_data.py`, puis mettre à jour `data/meta.json` (bloc `macro`,
   `ratios`, et une entrée `cnAAAA` dans `sources`).
4. Relancer `check_links.py`.

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
