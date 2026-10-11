/* budgetetatfrancais.fr — recherche d'une catégorie ou d'une sous-catégorie.

   Module partagé par les deux pages à camembert. Il ne navigue pas lui-même :
   choisir un résultat écrit l'URL (#niveau=… ou #poste=…), et c'est la lecture
   d'URL de chaque page qui ouvre le bon niveau, y compris à travers les replis
   « Autres ». La recherche et les liens partagés suivent donc le même chemin.

   Usage :
     installerRecherche({
       racine,            // élément qui accueille le champ
       entrees,           // [{ code, label, chemin, emoji, ouvrable, motsCles }]
       annee,             // () => année à conserver dans l'URL, ou null
       appliquer,         // () => relit l'URL et redessine
     });
*/

'use strict';

window.installerRecherche = function ({ racine, entrees, annee, appliquer }) {
  // Comparaison sans accents ni casse : « sante » trouve « Santé ».
  const plat = (s) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  // Les mots-clés couvrent le vocabulaire courant que la nomenclature n'emploie
  // pas : on cherche « retraite », l'Insee écrit « Vieillesse ».
  const index = entrees.map((e) => ({
    ...e, cle: plat(`${e.label} ${e.chemin} ${e.motsCles || ''}`),
  }));
  // Pluriel toléré : « retraites » cherche « retraite ».
  const singulier = (m) => (m.length > 4 ? m.replace(/[sx]$/, '') : m);

  racine.innerHTML = `
    <label class="recherche-label" for="recherche-champ">Rechercher une catégorie</label>
    <input id="recherche-champ" type="search" autocomplete="off" spellcheck="false"
           placeholder="Ex. retraites, hôpital, TVA, carburant…"
           role="combobox" aria-expanded="false" aria-autocomplete="list"
           aria-controls="recherche-liste">
    <ul id="recherche-liste" role="listbox" hidden></ul>`;

  const champ = racine.querySelector('input');
  const liste = racine.querySelector('ul');
  let resultats = [];
  let actif = -1;

  function chercher(texte) {
    const mots = plat(texte).split(/\s+/).filter(Boolean).map(singulier);
    if (!mots.length) return [];
    const dansLibelle = (e) => mots.every((m) => plat(e.label).includes(m));
    return index
      .filter((e) => mots.every((m) => e.cle.includes(m)))
      // D'abord les libellés qui contiennent la recherche (plutôt qu'un simple
      // mot-clé ou la définition), puis ceux qui commencent par elle, puis les
      // catégories avant les sous-catégories.
      .sort((a, b) =>
        (dansLibelle(b) - dansLibelle(a)) ||
        (plat(b.label).startsWith(mots[0]) - plat(a.label).startsWith(mots[0])) ||
        (a.chemin ? 1 : 0) - (b.chemin ? 1 : 0) ||
        a.label.localeCompare(b.label, 'fr'))
      .slice(0, 8);
  }

  function afficher() {
    liste.innerHTML = '';
    if (!champ.value.trim()) { fermer(); return; }
    if (!resultats.length) {
      liste.innerHTML = '<li class="vide" role="option" aria-disabled="true">Aucune catégorie trouvée</li>';
    }
    resultats.forEach((e, i) => {
      const li = document.createElement('li');
      li.id = `recherche-option-${i}`;
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', String(i === actif));
      li.innerHTML = `<span class="emo">${e.emoji}</span>` +
        `<span class="nom">${e.label}</span>` +
        (e.chemin ? `<span class="chemin">${e.chemin}</span>` : '');
      // mousedown plutôt que click : le champ perdrait le focus avant le clic.
      li.addEventListener('mousedown', (ev) => { ev.preventDefault(); choisir(e); });
      li.addEventListener('mousemove', () => { if (actif !== i) { actif = i; marquer(); } });
      liste.appendChild(li);
    });
    liste.hidden = false;
    champ.setAttribute('aria-expanded', 'true');
    marquer();
  }

  function marquer() {
    [...liste.children].forEach((li, i) => li.setAttribute('aria-selected', String(i === actif)));
    if (actif >= 0) champ.setAttribute('aria-activedescendant', `recherche-option-${actif}`);
    else champ.removeAttribute('aria-activedescendant');
  }

  function fermer() {
    liste.hidden = true;
    actif = -1;
    champ.setAttribute('aria-expanded', 'false');
    champ.removeAttribute('aria-activedescendant');
  }

  function choisir(e) {
    // Une catégorie qui a des sous-catégories s'ouvre ; une sous-catégorie
    // est sélectionnée dans le camembert de son parent.
    const q = new URLSearchParams();
    q.set(e.ouvrable ? 'niveau' : 'poste', e.code);
    const a = annee();
    if (a) q.set('annee', a);
    const hash = '#' + q.toString();
    champ.value = '';
    fermer();
    champ.blur();
    // Même hash qu'actuellement : aucun événement hashchange, on applique à la main.
    if (location.hash === hash) appliquer();
    else location.hash = hash;
  }

  champ.addEventListener('input', () => {
    resultats = chercher(champ.value);
    actif = resultats.length ? 0 : -1;
    afficher();
  });

  champ.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowDown' && resultats.length) {
      ev.preventDefault(); actif = (actif + 1) % resultats.length; marquer();
    } else if (ev.key === 'ArrowUp' && resultats.length) {
      ev.preventDefault(); actif = (actif - 1 + resultats.length) % resultats.length; marquer();
    } else if (ev.key === 'Enter' && actif >= 0) {
      ev.preventDefault(); choisir(resultats[actif]);
    } else if (ev.key === 'Escape') {
      champ.value = ''; fermer();
    }
  });

  champ.addEventListener('blur', fermer);
  champ.addEventListener('focus', () => { if (champ.value.trim()) afficher(); });
};
