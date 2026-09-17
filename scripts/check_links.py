#!/usr/bin/env python3
"""Verifie que chaque lien cite par le site repond encore.

    python scripts/check_links.py

Le site affiche ses sources ; un lien mort est donc un bug visible. Ce script
teste toutes les URL de data/meta.json et sort en erreur si l'une d'elles ne
repond pas 200, pour pouvoir etre branche sur une verification periodique.
"""

import json
import sys
from pathlib import Path

try:
    import requests
except ImportError:  # pragma: no cover
    sys.exit("Dependance manquante : pip install requests")

ROOT = Path(__file__).resolve().parent.parent
META = json.loads((ROOT / "data" / "meta.json").read_text(encoding="utf-8"))

UA = {"User-Agent": "Mozilla/5.0 (verification de liens, site budgetetatfrancais.fr)"}


def collect():
    urls = []
    for key, src in META["sources"].items():
        for field in ("page", "donnees", "pdf"):
            if src.get(field):
                urls.append((f"{key}.{field}", src[field]))
        for t in src.get("tableaux", []):
            urls.append((f"{key}.{t['id']}", t["url"]))
    return urls


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
