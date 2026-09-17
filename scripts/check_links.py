#!/usr/bin/env python3
"""Verifie que chaque lien cite par le site repond encore.

    python scripts/check_links.py

Le site affiche ses sources ; un lien mort est donc un bug visible. Ce script
teste toutes les URL de index.html et de data/meta.json, et sort en erreur si
l'une d'elles ne repond pas 200. Il est lance par .github/workflows/liens.yml.

Le domaine du site lui-meme est exclu : il ne resout que depuis la production.
"""

import json
import re
import sys
from pathlib import Path

try:
    import requests
except ImportError:  # pragma: no cover
    sys.exit("Dependance manquante : pip install requests")

ROOT = Path(__file__).resolve().parent.parent
META = json.loads((ROOT / "data" / "meta.json").read_text(encoding="utf-8"))

SELF = "budgetetatfrancais.fr"
UA = {"User-Agent": f"Mozilla/5.0 (verification de liens, https://{SELF})"}


def collect():
    """Les URL citees, nommees par leur origine, sans doublon."""
    urls = {}

    # 1. le registre de sources
    for key, src in META["sources"].items():
        for field in ("page", "donnees", "pdf"):
            if src.get(field):
                urls.setdefault(src[field], f"meta:{key}.{field}")
        for t in src.get("tableaux", []):
            urls.setdefault(t["url"], f"meta:{key}.{t['id']}")

    # 2. les liens des definitions de postes
    defs = json.loads((ROOT / "data" / "definitions.json").read_text(encoding="utf-8"))
    for poste, entrees in defs.get("liens", {}).items():
        for l in entrees:
            urls.setdefault(l["url"], f"definitions:{poste}")
    if defs.get("source", {}).get("url"):
        urls.setdefault(defs["source"]["url"], "definitions:source")

    # 3. les liens reellement affiches sur les pages
    for page in ("index.html", "debat.html", "recettes.html"):
        html = (ROOT / page).read_text(encoding="utf-8")
        for url in re.findall(r"""https://[^"'<> )]+""", html):
            urls.setdefault(url.rstrip(".,)"), page)

    # On exclut le site lui-meme (il ne resout que depuis la production), mais
    # en comparant l'origine : le depot GitHub s'appelle aussi
    # "budgetetatfrancais.fr", et une recherche de sous-chaine l'ecarterait.
    return sorted(
        ((nom, url) for url, nom in urls.items()
         if not url.startswith(f"https://{SELF}")),
        key=lambda t: t[1],
    )


def main() -> None:
    urls = collect()
    print(f"{len(urls)} liens a verifier\n")
    bad = []
    for name, url in urls:
        try:
            r = requests.head(url, headers=UA, timeout=45, allow_redirects=True)
            if r.status_code >= 400:  # certains serveurs refusent HEAD
                r = requests.get(url, headers=UA, timeout=45, stream=True)
            code = r.status_code
        except Exception as exc:  # pragma: no cover
            code, exc_txt = 0, str(exc)[:60]
            print(f"  ERREUR {name:24s} {url}\n         {exc_txt}")
            bad.append((name, url, "exception"))
            continue
        flag = "ok  " if code == 200 else "HS  "
        print(f"  {flag} {code} {name:24s} {url}")
        if code != 200:
            bad.append((name, url, code))

    print()
    if bad:
        print(f"{len(bad)} lien(s) en echec :")
        for name, url, code in bad:
            print(f"  {name} -> {code} {url}")
        sys.exit(1)
    print("Tous les liens repondent.")


if __name__ == "__main__":
    main()
