/* Remplit les chiffres de debat.html depuis data/cofog.json, pour que la page
   ne contienne aucun montant écrit en dur et suive les mises à jour de l'Insee.
   Les valeurs présentes dans le HTML servent de repli si le fichier ne charge
   pas : la page reste lisible, avec les chiffres du dernier millésime connu. */

(() => {
  'use strict';

  const nf = (n, d = 1) =>
    Number(n).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const md = (n) => nf(n) + ' Md€';
  const pct = (n) => nf(n) + ' %';

  fetch('data/cofog.json')
    .then((r) => r.json())
    .then((d) => {
      const i = d.years.length - 1;
      const v = (code) => d.apu[code].v[i] ?? 0;

      const total = v('_Z');
      const ps = v('GF10');             // protection sociale
      const vieillesse = v('GF1002');
      const survivants = v('GF1003');   // pensions de réversion
      const retraites = vieillesse + survivants;

      const champs = {
        annee: d.years[i],
        total: md(total),
        ps: md(ps),
        vieillesse: md(vieillesse),
        survivants: md(survivants),
        retraites: md(retraites),
        'pct-total': pct((retraites / total) * 100),
        'pct-ps': pct((retraites / ps) * 100),
        'vs-sante': nf(retraites / v('GF07')) + ' fois',
        'vs-enseignement': nf(retraites / v('GF09')) + ' fois',
      };

      for (const [cle, valeur] of Object.entries(champs)) {
        document.querySelectorAll(`[data-f="${cle}"]`)
          .forEach((el) => { el.textContent = valeur; });
      }
    })
    .catch((err) => console.error(err));
})();
