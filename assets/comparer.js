/* budgetetatfrancais.fr — comparer deux catégories, dans l'encart du bas.

   Module partagé par les deux pages à camembert. Il fabrique le bloc à
   insérer dans l'encart : un bouton, puis une liste de catégories, puis le
   rapport entre les deux pour l'année affichée (« A représente 4,7 fois B »).

   Avertissements :
     - l'une contient l'autre (Protection sociale / Vieillesse) : le rapport est
       une part du tout, pas une comparaison entre deux postes distincts ;
     - niveaux différents (Protection sociale / Défense civile) : une catégorie
       entière face à une sous-catégorie.

   Usage :
     blocComparaison({
       code,          // poste affiché dans l'encart
       cible,         // poste de comparaison, ou null
       entrees,       // [{ code, label, emoji, ancetres: [codes du plus haut au plus bas] }]
       valeur,        // (code) => montant de l'année affichée
       annee,         // année affichée
       surChange,     // (code | null) => changer la cible
     }) -> HTMLElement
*/

'use strict';

(() => {
  // Le bloc reste déplié d'un rendu à l'autre une fois qu'on l'a ouvert.
  let deplie = false;

  const nf = (n, d = 1) =>
    Number(n).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const fois = (r) => `${nf(r, r >= 100 ? 0 : 1)} fois`;

  window.blocComparaison = function ({ code, cible, entrees, valeur, annee, surChange }) {
    const parCode = Object.fromEntries(entrees.map((e) => [e.code, e]));
    const bloc = document.createElement('div');
    bloc.className = 'comparer';

    if (!deplie && !cible) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'comparer-bouton';
      b.textContent = '⚖️ Comparer avec une autre catégorie';
      b.addEventListener('click', () => {
        deplie = true;
        bloc.replaceWith(window.blocComparaison({ code, cible, entrees, valeur, annee, surChange }));
        document.getElementById('comparer-choix')?.focus();
      });
      bloc.appendChild(b);
      return bloc;
    }

    // Liste groupée par catégorie de premier niveau : la catégorie entière,
    // puis ses sous-catégories.
    const select = document.createElement('select');
    select.id = 'comparer-choix';
    select.innerHTML = '<option value="">— choisir une catégorie —</option>';
    const racines = entrees.filter((e) => !e.ancetres.length);
    racines.forEach((r) => {
      const g = document.createElement('optgroup');
      g.label = r.label;
      const membres = [r, ...entrees.filter((e) => e.ancetres[0] === r.code)];
      membres.forEach((e) => {
        const o = document.createElement('option');
        o.value = e.code;
        o.textContent = e.ancetres.length
          ? `${'  '.repeat(e.ancetres.length)}${e.label}`
          : `${e.label} (ensemble)`;
        o.disabled = e.code === code || !(valeur(e.code) > 0);
        o.selected = e.code === cible;
        g.appendChild(o);
      });
      select.appendChild(g);
    });
    select.addEventListener('change', () => surChange(select.value || null));

    const ligne = document.createElement('label');
    ligne.className = 'comparer-ligne';
    ligne.htmlFor = 'comparer-choix';
    ligne.append('⚖️ Comparer avec ', select);
    bloc.appendChild(ligne);

    if (cible && parCode[cible] && cible !== code) {
      bloc.appendChild(resultat(parCode[code], parCode[cible], valeur, annee));
    }

    if (cible) {
      const x = document.createElement('button');
      x.type = 'button';
      x.className = 'comparer-fermer';
      x.textContent = 'Retirer la comparaison';
      x.addEventListener('click', () => { deplie = false; surChange(null); });
      bloc.appendChild(x);
    }
    return bloc;
  };

  function resultat(a, b, valeur, annee) {
    const p = document.createElement('div');
    p.className = 'comparer-resultat';
    const va = valeur(a.code), vb = valeur(b.code);
    const nomA = `${a.emoji} <b>${a.label}</b>`, nomB = `${b.emoji} <b>${b.label}</b>`;

    if (!(va > 0) || !(vb > 0)) {
      p.innerHTML = `Pas de comparaison possible en ${annee}&nbsp;: l'un des deux postes est nul.`;
      return p;
    }

    const r = va / vb;
    const phrase = r >= 1
      ? `${nomA} représente <strong>${fois(r)}</strong> ${nomB}.`
      // Pas de « N fois plus », qui se lit souvent comme N + 1 fois autant.
      : `${nomA} représente <strong>${nf(100 * r)} %</strong> de ${nomB}. ` +
        `Autrement dit, ${nomB} représente <strong>${fois(1 / r)}</strong> ${nomA}.`;
    p.innerHTML = `<p>${phrase}</p>` +
      `<p class="comparer-montants">${annee}&nbsp;: ${nf(va)} Md€ contre ${nf(vb)} Md€</p>`;

    const avert = avertissement(a, b);
    if (avert) {
      const w = document.createElement('p');
      w.className = 'comparer-avertissement';
      w.setAttribute('role', 'note');
      w.innerHTML = `⚠️ ${avert}`;
      p.appendChild(w);
    }
    return p;
  }

  function avertissement(a, b) {
    if (a.ancetres.includes(b.code)) {
      return `<b>${a.label}</b> fait partie de <b>${b.label}</b>&nbsp;: ce rapport est une ` +
        `part du tout, pas une comparaison entre deux postes distincts.`;
    }
    if (b.ancetres.includes(a.code)) {
      return `<b>${b.label}</b> fait partie de <b>${a.label}</b>&nbsp;: ce rapport est une ` +
        `part du tout, pas une comparaison entre deux postes distincts.`;
    }
    if (a.ancetres.length !== b.ancetres.length) {
      const [cat, sous] = a.ancetres.length < b.ancetres.length ? [a, b] : [b, a];
      return `Vous comparez une catégorie entière (<b>${cat.label}</b>) à une ` +
        `sous-catégorie (<b>${sous.label}</b>)&nbsp;: les deux ne sont pas au même ` +
        `niveau de détail.`;
    }
    return '';
  }
})();
