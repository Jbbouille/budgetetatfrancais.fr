#!/usr/bin/env python3
"""Génère les images du site : aperçus de partage et icônes.

    pip install Pillow
    python scripts/build_images.py

Produit, à la racine du dépôt :
  og-depenses.png, og-recettes.png  aperçus de partage 1200 x 630 (Open Graph)
  apple-touch-icon.png              icône d'écran d'accueil iOS, 180 x 180
  favicon.ico                       16, 32 et 48 px pour les navigateurs anciens
  favicon.svg                       icône vectorielle

Les camemberts des aperçus sont calculés depuis data/cofog.json et
data/recettes.json, avec les mêmes règles que le site (cinq parts + « Autres »,
ordre de la dernière année). Relancer ce script après une mise à jour des
données pour que les aperçus restent justes.

Les polices viennent de Windows (Georgia, Segoe UI) ; à défaut, Pillow utilise
sa police intégrée et le rendu est moins soigné.
"""

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
FONTS = Path("C:/Windows/Fonts")

# Palette catégorielle du site, mode clair (assets/style.css, --s1 à --s6).
COULEURS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300"]
ENCRE, ENCRE_2, ENCRE_3, FILET = "#111111", "#4a4a4a", "#767676", "#dcdcdc"
FOND = "#ffffff"
SUR = 3  # suréchantillonnage, pour des bords de camembert lisses


def police(nom, taille):
    try:
        return ImageFont.truetype(str(FONTS / nom), taille * SUR)
    except OSError:
        return ImageFont.load_default(taille * SUR)


def nf(x, d=1):
    """Nombre au format français : espace insécable pour les milliers, virgule.

    Pas d'espace fine (U+202F) : Georgia ne la contient pas et l'affiche comme
    un carré. L'espace insécable ordinaire (U+00A0), elle, y figure."""
    return f"{x:,.{d}f}".replace(",", " ").replace(".", ",")


def parts(codes, valeur, libelle, total_attendu):
    """Cinq plus grandes parts, puis « Autres » — comme slices() sur le site."""
    codes = sorted(codes, key=valeur, reverse=True)
    tete, queue = codes[:5], codes[5:]
    out = [(libelle(c), valeur(c)) for c in tete]
    if queue:
        out.append(("Autres", sum(valeur(c) for c in queue)))
    out = [(l, v) for l, v in out if v > 0]
    total = sum(v for _, v in out)
    assert abs(total - total_attendu) < 1, (total, total_attendu)
    return out, total


def depenses():
    d = json.loads((ROOT / "data/cofog.json").read_text(encoding="utf-8"))
    i = len(d["years"]) - 1
    court = {
        "Services généraux des administrations publiques": "Services généraux",
        "Logements et équipements collectifs": "Logement",
    }
    codes = [k for k in d["apu"] if len(k) == 4]
    p, total = parts(codes, lambda c: d["apu"][c]["v"][i],
                     lambda c: court.get(d["apu"][c]["label"], d["apu"][c]["label"]),
                     d["apu"]["_Z"]["v"][i])
    return d["years"][i], p, total


def recettes():
    d = json.loads((ROOT / "data/recettes.json").read_text(encoding="utf-8"))
    i = len(d["years"]) - 1
    court = {
        "cotisations": "Cotisations sociales", "d2": "Impôts sur la production",
        "d5": "Impôts sur le revenu", "emprunt": "Emprunt",
        "production": "Recettes de production",
    }
    codes = [k for k, p in d["postes"].items() if p["parent"] is None]
    p, total = parts(codes, lambda c: d["postes"][c]["v"][i] or 0,
                     lambda c: court.get(c, d["postes"][c]["label"]),
                     d["total"]["v"][i])
    return d["years"][i], p, total


def anneau(draw, cx, cy, r, trou, valeurs):
    """Camembert en anneau, départ à midi, sens horaire, liseré blanc de 2 px."""
    total = sum(valeurs)
    a0 = -90.0
    boite = [cx - r, cy - r, cx + r, cy + r]
    for v, c in zip(valeurs, COULEURS):
        a1 = a0 + 360 * v / total
        draw.pieslice(boite, a0, a1, fill=c, outline=FOND, width=2 * SUR)
        a0 = a1
    draw.ellipse([cx - trou, cy - trou, cx + trou, cy + trou], fill=FOND)


def apercu(fichier, titre, sous_titre, annee, p, total, legende_total):
    W, H = 1200 * SUR, 630 * SUR
    img = Image.new("RGB", (W, H), FOND)
    dr = ImageDraw.Draw(img)
    s = lambda x: x * SUR

    # Camembert à gauche
    cx, cy, r = s(315), s(315), s(235)
    anneau(dr, cx, cy, r, int(r * 0.5), [v for _, v in p])
    f_total, f_legende = police("georgia.ttf", 40), police("segoeui.ttf", 17)
    dr.text((cx, cy - s(8)), f"{nf(total, 0)} Md€", font=f_total, fill=ENCRE, anchor="ms")
    dr.text((cx, cy + s(26)), legende_total, font=f_legende, fill=ENCRE_3, anchor="ms")

    # Titre et légende à droite
    x = s(620)
    dr.text((x, s(70)), titre, font=police("georgiab.ttf", 52), fill=ENCRE, anchor="ls")
    dr.text((x, s(112)), sous_titre, font=police("segoeui.ttf", 24), fill=ENCRE_3, anchor="ls")

    f_nom, f_val = police("segoeui.ttf", 24), police("segoeuib.ttf", 24)
    y = s(185)
    for (libelle, v), c in zip(p, COULEURS):
        dr.line([x, y - s(28), x + s(520), y - s(28)], fill=FILET, width=s(1))
        dr.rounded_rectangle([x, y - s(17), x + s(16), y - s(1)], radius=s(3), fill=c)
        dr.text((x + s(30), y), libelle, font=f_nom, fill=ENCRE, anchor="ls")
        dr.text((x + s(520), y), f"{nf(100 * v / total)} %", font=f_val, fill=ENCRE, anchor="rs")
        y += s(58)
    dr.line([x, y - s(28), x + s(520), y - s(28)], fill=FILET, width=s(1))

    dr.text((x, s(600)), f"budgetetatfrancais.fr · données Insee {annee}",
            font=police("segoeui.ttf", 20), fill=ENCRE_3, anchor="ls")

    img.resize((1200, 630), Image.LANCZOS).save(ROOT / fichier, optimize=True)
    print(f"  {fichier}")


def icone(taille, fond=None, marge=0.0):
    """Le logo du site : disque bleu, quart orange (reprend l'ancien favicon)."""
    T = taille * 4
    img = Image.new("RGBA", (T, T), fond or (0, 0, 0, 0))
    dr = ImageDraw.Draw(img)
    m = T * marge
    r = (T - 2 * m) / 2 * (44 / 50)
    c = T / 2
    boite = [c - r, c - r, c + r, c + r]
    dr.ellipse(boite, fill=COULEURS[0])
    dr.pieslice(boite, -90, -90 + 360 * 0.29, fill=COULEURS[1])
    return img.resize((taille, taille), Image.LANCZOS)


def main():
    print("Images :")
    an, p, t = depenses()
    apercu("og-depenses.png", "Dépenses publiques", "Où va l'argent public en France",
           an, p, t, "DÉPENSE TOTALE")
    an, p, t = recettes()
    apercu("og-recettes.png", "Recettes publiques", "D'où vient l'argent public en France",
           an, p, t, "À FINANCER")

    # iOS n'accepte pas la transparence : fond blanc et marge.
    icone(180, fond="#ffffff", marge=0.1).convert("RGB").save(ROOT / "apple-touch-icon.png")
    print("  apple-touch-icon.png")
    icone(48).save(ROOT / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
    print("  favicon.ico")
    (ROOT / "favicon.svg").write_text(
        "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'>"
        "<circle cx='50' cy='50' r='44' fill='#2a78d6'/>"
        "<path d='M50 50 L50 6 A44 44 0 0 1 93 59 Z' fill='#eb6834'/></svg>\n",
        encoding="utf-8")
    print("  favicon.svg")


if __name__ == "__main__":
    main()
