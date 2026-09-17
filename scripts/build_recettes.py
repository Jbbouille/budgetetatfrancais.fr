#!/usr/bin/env python3
"""Construit data/recettes.json : d'ou vient l'argent depense.

    pip install openpyxl requests
    python scripts/build_recettes.py

Le camembert des recettes est construit pour totaliser EXACTEMENT le meme
montant que celui des depenses. Il ajoute pour cela une part « emprunt », egale
au besoin de financement (depenses moins recettes) : c'est ce qui manque, et
qui est effectivement emprunte sur les marches.

Deux tableaux de l'Insee sont combines :
  - 3.201, pour les grandes categories de recettes et le solde ;
  - 3.217, pour le detail impot par impot (TVA, TICPE, tabac, CSG...).

Les raccords entre les deux sont verifies a l'execution ; le script echoue
plutot que d'ecrire des chiffres qui ne se recoupent pas.
"""

import datetime
import json
import re
import sys
from pathlib import Path

try:
    import openpyxl
    import requests
    from openpyxl.utils import get_column_letter
except ImportError:  # pragma: no cover
    sys.exit("Dependances manquantes : pip install openpyxl requests")

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / ".cache"
OUT = ROOT / "data" / "recettes.json"

PAGE = "https://www.insee.fr/fr/statistiques/8574705"
BASE = "https://www.insee.fr/fr/statistiques/fichier/8574705"

# Libelles reperes dans chaque tableau. On cherche par texte et non par numero
# de ligne : l'Insee insere des lignes d'une campagne a l'autre.
T1, T17 = ("t_3201.xlsx", "t_3201"), ("t_3217.xlsx", "T_3217")

REPERES_3201 = {
    "cotisations": "Cotisations sociales nettes (D61)",
    "d2": "Impots sur la production et les importations (D2)",
    "d5": "Impots courants sur le revenu et le patrimoine (D5)",
    "production": "Recettes de production",
    "transferts": "Autres transferts",
    "propriete": "Revenus de la propriete",
    "capital": "Impots en capital a recevoir (D91r)",
    "non_recouvrables": "Impots et cotisations dus non recouvrables nets (D995r)",
    "total_recettes": "Total des recettes",
    "total_depenses": "Total des depenses",
    "solde": "Capacite (+) ou besoin (-) de financement",
}

# Groupes de niveau 1 de 3.217, et le poste de 3.201 sous lequel les ranger.
GROUPES_3217 = {
    "Taxe sur la valeur ajoutee (TVA) (D211)": "d2",
    "Impots et droits sur les importations (D212)": "d2",
    "Impots sur les produits (D214)": "d2",
    "Impots sur les salaires et la main d'oeuvre (D291)": "d2",
    "Impots divers sur la production (D292)": "d2",
    "Impots courants sur le revenu (D51)": "d5",
    "Autres impots courants (D59)": "d5",
}
# Les droits d'importation reverses a l'Union europeenne ne sont pas une
# recette des administrations francaises : 3.201 les exclut de D2, pas 3.217.
HORS_PERIMETRE = "Droits d'importation au profit de l'Union Europeenne"


def plat(s: str) -> str:
    """Compare des libelles sans se soucier des accents ni des espaces."""
    # « œuvre » doit devenir « oeuvre » : la ligature vaut deux lettres, ce que
    # str.maketrans ne sait pas faire (correspondance 1 pour 1 uniquement).
    s = s.replace("œ", "oe").replace("Œ", "OE")
    s = s.translate(str.maketrans("àâäéèêëîïôöùûüç", "aaaeeeeiioouuuc"))
    return re.sub(r"\s+", " ", s).strip().lower()


def download(nom: str) -> Path:
    CACHE.mkdir(exist_ok=True)
    path = CACHE / nom
    if not path.exists():
        print(f"  telechargement {BASE}/{nom}")
        r = requests.get(f"{BASE}/{nom}", timeout=120)
        r.raise_for_status()
        path.write_bytes(r.content)
    return path


def lire(fichier, feuille):
    """Retourne (annees, colonne de depart, lignes) d'un tableau."""
    ws = openpyxl.load_workbook(download(fichier), data_only=True)[feuille]
    rows = list(ws.iter_rows(values_only=True))
    entete = next(r for r in rows
                  if sum(isinstance(c, (int, float)) and 1900 < c < 2100 for c in r) > 10)
    annees = [int(c) for c in entete if isinstance(c, (int, float)) and 1900 < c < 2100]
    col0 = next(i for i, c in enumerate(entete) if c == annees[0])

    lignes = []
    for n, row in enumerate(rows, start=1):
        lib = row[1]
        if not isinstance(lib, str) or not lib.strip():
            continue
        valeurs = [round(float(c), 1) if isinstance(c, (int, float)) else None
                   for c in row[col0:col0 + len(annees)]]
        if any(v is not None for v in valeurs):
            lignes.append({
                "label": re.sub(r"\s*\(\*+\)\s*$", "", lib.strip()),
                "indent": len(lib) - len(lib.lstrip()),
                "v": valeurs, "r": n,
            })
    return annees, col0, lignes


def trouver(lignes, libelle, depuis=0):
    """Premiere ligne dont le libelle commence par `libelle`, a partir de `depuis`.

    Le tableau 3.201 empile DEPENSES puis RECETTES, avec des libelles quasi
    identiques des deux cotes (« Impots courants sur le revenu... » vaut 0,1 en
    depense et 366,0 en recette). Chercher depuis le debut ramene donc la
    mauvaise moitie : les postes de recettes sont cherches apres le total des
    depenses, qui separe les deux sections.
    """
    cible = plat(libelle)
    for l in lignes[depuis:]:
        if plat(l["label"]).startswith(cible):
            return l
    sys.exit(f"ECHEC : ligne introuvable dans le tableau : {libelle!r}")


def aligner(serie, n):
    """Cale une serie plus courte (3.217 demarre en 1995) sur l'axe de 3.201."""
    return [None] * (n - len(serie)) + serie


def main() -> None:
    print("Construction de data/recettes.json")
    annees1, col1, l1 = lire(*T1)
    annees17, col17, l17 = lire(*T17)
    n = len(annees1)
    dernier = n - 1

    # tout ce qui suit le total des depenses appartient a la section recettes
    dep_ligne = trouver(l1, REPERES_3201["total_depenses"])
    i_rec = l1.index(dep_ligne) + 1
    rep = {"total_depenses": dep_ligne}
    for k, v in REPERES_3201.items():
        if k != "total_depenses":
            rep[k] = trouver(l1, v, depuis=i_rec)
    solde = rep["solde"]["v"]
    depenses = rep["total_depenses"]["v"]

    # --- niveau 1 : les categories de 3.201, plus l'emprunt ---
    postes, source_de = {}, {}
    for cle in ("cotisations", "d2", "d5", "production", "transferts",
                "propriete", "capital", "non_recouvrables"):
        l = rep[cle]
        postes[cle] = {"label": l["label"], "v": l["v"], "r": l["r"], "parent": None}
        source_de[cle] = "t_3201"

    # L'emprunt n'est pas dans un tableau : c'est depenses moins recettes.
    postes["emprunt"] = {
        "label": "Emprunt (besoin de financement)",
        "v": [None if s is None else round(-s, 1) for s in solde],
        "parent": None,
        "calcule": "depenses moins recettes",
    }

    # --- niveau 2 : le detail de 3.217 sous d2 et d5 ---
    groupes = {plat(k): v for k, v in GROUPES_3217.items()}
    parent_courant = None
    for l in l17:
        cle_parent = groupes.get(plat(l["label"]))
        if l["indent"] == 0:
            parent_courant = cle_parent  # None si le groupe ne nous interesse pas
            if cle_parent is None:
                continue
            cle = f"g{l['r']}"
            postes[cle] = {"label": l["label"], "v": aligner(l["v"], n),
                           "r": l["r"], "parent": cle_parent}
            source_de[cle] = "t_3217"
            parent_courant = cle
        elif parent_courant and plat(l["label"]) == plat(HORS_PERIMETRE):
            # Reversee a l'Union europeenne : 3.217 la compte dans son groupe,
            # 3.201 l'exclut de D2. On la retranche du groupe pour que les deux
            # tableaux se recoupent.
            hors = aligner(l["v"], n)
            cible = postes[parent_courant]["v"]
            postes[parent_courant]["v"] = [
                None if a is None else round(a - (b or 0), 1)
                for a, b in zip(cible, hors)
            ]
            postes[parent_courant]["hors_perimetre"] = l["label"]
        elif parent_courant:
            cle = f"g{l['r']}"
            postes[cle] = {"label": l["label"], "v": aligner(l["v"], n),
                           "r": l["r"], "parent": parent_courant}
            source_de[cle] = "t_3217"

    # --- controles ---
    racines = [k for k, p in postes.items() if p["parent"] is None]
    somme = sum(postes[k]["v"][dernier] or 0 for k in racines)
    cible = depenses[dernier]
    print(f"  annees {annees1[0]}-{annees1[-1]}")
    for k in racines:
        print(f"    {postes[k]['label'][:52]:54s} {postes[k]['v'][dernier]:8.1f}")
    print(f"  somme des parts       : {somme:.1f} Md EUR")
    print(f"  total des depenses    : {cible} Md EUR")
    if abs(somme - cible) > 0.3:
        sys.exit(f"ECHEC : ecart de {abs(somme - cible):.1f} Md avec le total des depenses")

    for cle in ("d2", "d5"):
        enfants = [p for p in postes.values() if p["parent"] == cle]
        s = sum(e["v"][dernier] or 0 for e in enfants)
        ecart = abs(s - postes[cle]["v"][dernier])
        print(f"  {cle} : {len(enfants)} composantes, somme {s:.1f} "
              f"vs {postes[cle]['v'][dernier]:.1f} (ecart {ecart:.1f})")
        if ecart > 0.3:
            sys.exit(f"ECHEC : le detail de {cle} ne retombe pas sur son total")

    data = {
        "genere": datetime.date.today().isoformat(),
        "millesime": annees1[-1],
        "years": annees1,
        "total": {"label": "Total", "v": depenses},
        "recettes": rep["total_recettes"]["v"],
        "postes": postes,
        "source_de": source_de,
        "sources": {
            "t_3201": {"fichier": "t_3201.xlsx", "feuille": "t_3201",
                       "url": f"{BASE}/t_3201.xlsx", "page": PAGE,
                       "colonnes": [get_column_letter(col1 + 1 + i) for i in range(n)]},
            "t_3217": {"fichier": "t_3217.xlsx", "feuille": "T_3217",
                       "url": f"{BASE}/t_3217.xlsx", "page": PAGE,
                       "colonnes": [get_column_letter(col17 + 1 + i) for i in range(len(annees17))],
                       "decalage": n - len(annees17)},
        },
    }
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")),
                   encoding="utf-8")
    print(f"  ecrit {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
