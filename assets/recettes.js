/* budgetetatfrancais.fr — d'où vient l'argent : camembert cliquable des recettes.
   Même mécanique que la page des dépenses, avec deux différences :
   - une part « emprunt » qui n'est dans aucun fichier, mais calculée ;
   - des postes négatifs (crédits d'impôt, impôts non recouvrables) qu'un
     secteur de camembert ne peut pas représenter : ils sont listés sous la
     légende plutôt que dessinés. */

(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const SVGNS = 'http://www.w3.org/2000/svg';

  const nf = (n, d = 1) =>
    Number(n).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const md = (n, d = 1) => nf(n, d) + ' Md€';
  const pct = (n, d = 1) => nf(n, d) + ' %';

  const SLOTS = 6;
  let COLORS = [];
  const readColors = () => {
    const cs = getComputedStyle(document.documentElement);
    COLORS = [1, 2, 3, 4, 5, 6].map((i) => cs.getPropertyValue(`--s${i}`).trim());
  };

  const svgEl = (tag, attrs = {}) => {
    const e = document.createElementNS(SVGNS, tag);
    for (const k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    return e;
  };

  let DATA = null, stack = [], hovered = null, yi = 0, cellule = null;

  const last = (a) => a[a.length - 1];
  const P = (k) => DATA.postes[k];
  const val = (k) => P(k).v[yi] ?? 0;
  const year = () => DATA.years[yi];

  /* Emoji par poste : d'abord une clé exacte, sinon un mot-clé du libellé. */
  const EMOJI = {
    cotisations: '\u{1F3E5}', d2: '\u{1F6D2}', d5: '\u{1F4B0}',
    production: '\u{1F3E2}', transferts: '\u{1F501}', propriete: '\u{1F4C8}',
    capital: '\u{1F3DB}️', non_recouvrables: '\u{274C}', emprunt: '\u{1F4B3}',
    AUTRES: '\u{1F4E6}',
  };
  const MOTS = [
    ['valeur ajoutée', '\u{1F6D2}'], ['tva', '\u{1F6D2}'],
    ['énergétiques', '\u{26FD}'], ['ticpe', '\u{26FD}'],
    ['électricité', '\u{1F50C}'], ['gaz', '\u{1F525}'],
    ['tabac', '\u{1F6AC}'], ['alcool', '\u{1F377}'],
    ['immatriculation', '\u{1F697}'], ['malus', '\u{1F697}'],
    ['véhicule', '\u{1F697}'], ['transport', '\u{1F686}'],
    ['assurance', '\u{1F6E1}️'], ['jeux', '\u{1F3B0}'],
    ['foncière', '\u{1F3E1}'], ['habitation', '\u{1F3E1}'],
    ['logement', '\u{1F3E1}'], ['salaires', '\u{1F4BC}'],
    ['csg', '\u{1F3E5}'], ['crds', '\u{1F3E5}'],
    ['sociétés', '\u{1F3ED}'], ['revenu des personnes', '\u{1F9D1}'],
    ['crédits d’impôt', '\u{2702}️'], ["crédits d'impôt", '\u{2702}️'],
    ['fortune', '\u{1F48E}'], ['mutation', '\u{1F381}'],
    ['importation', '\u{1F6A2}'], ['polluantes', '\u{1F332}'],
    ['eau', '\u{1F4A7}'], ['carbone', '\u{1F332}'],
    ['numérique', '\u{1F4F1}'], ['pharmaceutique', '\u{1F48A}'],
    ['séjour', '\u{1F3D6}️'], ['formation', '\u{1F393}'],
  ];
  function emo(k) {
    if (!k) return EMOJI.AUTRES;
    if (EMOJI[k]) return EMOJI[k];
    const l = (P(k)?.label || '').toLowerCase();
    for (const [mot, e] of MOTS) if (l.includes(mot)) return e;
    const parent = P(k)?.parent;
    return parent && EMOJI[parent] ? EMOJI[parent] : '\u{1F4B6}';
  }

  const court = (s) => s
    .replace(' (besoin de financement)', '')
    .replace('Impôts sur la production et les importations (D2)', 'Impôts sur la production')
    .replace('Impôts courants sur le revenu et le patrimoine (D5)', 'Impôts sur le revenu')
    .replace('Cotisations sociales nettes (D61)', 'Cotisations sociales')
    .replace('Impôts et cotisations dus non recouvrables nets (D995r)', 'Impôts non recouvrables')
    .replace('Impôts en capital à recevoir (D91r)', 'Impôts en capital')
    .replace(/\s*\(D\d+\w*\)$/, '');

  const enfants = (k) =>
    Object.keys(DATA.postes).filter((c) => DATA.postes[c].parent === (k ?? null));

  const REF = () => DATA.years.length - 1;
  const at = (k, i) => P(k).v[i] ?? 0;
  const utile = (k) => P(k).v.some((x) => x != null && x !== 0);
  const ouvrable = (k) => k && enfants(k).some((c) => val(c) > 0);

  /* Ordre et couleurs figés sur l'année de référence, comme pour les dépenses :
     déplacer le curseur ne doit pas repeindre les parts. */
  function slices() {
    const node = last(stack) || null;
    const ref = REF();
    let codes = (node && node.kind === 'rest' ? node.codes.slice() : enfants(node?.code))
      .filter(utile);
    codes.sort((a, b) => at(b, ref) - at(a, ref));

    let items;
    if (codes.length > SLOTS) {
      const tail = codes.slice(SLOTS - 1);
      items = codes.slice(0, SLOTS - 1).map((c) => ({ code: c, label: court(P(c).label), v: val(c) }));
      items.push({ code: null, rest: tail, label: 'Autres',
                   v: tail.reduce((a, c) => a + val(c), 0), count: tail.length });
    } else {
      items = codes.map((c) => ({ code: c, label: court(P(c).label), v: val(c) }));
    }

    // Un secteur ne peut pas avoir une aire négative : on met ces postes de côté.
    const negatifs = items.filter((d) => d.v < 0);
    const positifs = items.filter((d) => d.v >= 0);
    const total = positifs.reduce((a, d) => a + d.v, 0);
    return {
      parts: positifs.map((d, i) => ({ ...d, i, color: COLORS[i], share: (d.v / total) * 100 })),
      negatifs, total,
    };
  }

  const totalNiveau = () => {
    const node = last(stack);
    if (!node) return P('emprunt').v[yi] != null ? DATA.total.v[yi] : 0;
    if (node.kind === 'rest') return node.codes.reduce((a, c) => a + val(c), 0);
    return val(node.code);
  };

  let PARTS = [];

  function draw() {
    readColors();
    drawYear();
    const d = slices();
    PARTS = d.parts;
    drawPie(d);
    drawKeys(d);
    drawCrumb();
    drawCellule();
    repaint();
  }

  function drawYear() {
    $('#y-out').textContent = year();
    $('#champ-annee').textContent = year();
    $('#sub').textContent =
      `${year()} · ${nf(DATA.total.v[yi])} milliards d'euros à financer · ` +
      `dont ${nf(P('emprunt').v[yi])} empruntés`;
    const r = $('#y-range');
    if (r.value !== String(yi)) r.value = String(yi);
    $('#y-prev').disabled = yi === 0;
    $('#y-next').disabled = yi === DATA.years.length - 1;
  }

  function setupYears() {
    const r = $('#y-range');
    // On ne propose que les années où le détail par impôt existe (1995+).
    const debut = DATA.years.findIndex((y) => y >= 1995);
    r.min = String(debut);
    r.max = String(DATA.years.length - 1);
    yi = DATA.years.length - 1;
    r.value = String(yi);
    $('#y-ticks').innerHTML = DATA.years
      .map((y, i) => (i >= debut && y % 5 === 0 ? `<option value="${i}" label="${y}"></option>` : ''))
      .join('');
    const go = (i) => {
      const n = Math.max(debut, Math.min(DATA.years.length - 1, i));
      if (n === yi) return;
      yi = n; hovered = null; draw();
    };
    r.addEventListener('input', () => go(+r.value));
    $('#y-prev').addEventListener('click', () => go(yi - 1));
    $('#y-next').addEventListener('click', () => go(yi + 1));
  }

  /* D'où sort le chiffre : une cellule de classeur, ou bien une soustraction
     quand le poste n'existe dans aucun fichier (c'est le cas de l'emprunt). */
  function drawCellule() {
    const el = $('#cellule');
    const p = cellule && P(cellule);
    if (!p) { el.hidden = true; el.innerHTML = ''; return; }
    const montant = p.v[yi] ?? 0;
    const part = (montant / DATA.total.v[yi]) * 100;
    let ou;

    if (p.calcule) {
      ou = `<span class="ou">Ce montant n'est lu dans aucun fichier&nbsp;: c'est une ` +
        `soustraction — <code>${nf(DATA.total.v[yi])}</code> de dépenses moins ` +
        `<code>${nf(DATA.recettes[yi])}</code> de recettes = ` +
        `<code>${nf(montant)}</code> Md€ à emprunter.</span>`;
    } else {
      const s = DATA.sources[DATA.source_de[cellule]];
      const col = s.colonnes[yi - (s.decalage || 0)];
      ou = `<span class="ou"><a href="${s.url}">${s.fichier}</a> · feuille ` +
        `<code>${s.feuille}</code> · ligne <code>${p.r}</code> · colonne ` +
        `<code>${col}</code> · cellule <code>${col}${p.r}</code></span>`;
    }
    el.hidden = false;
    el.innerHTML = `<span class="emo">${emo(cellule)}</span><b>${p.label}</b> — ` +
      `${md(montant)} en ${year()}, soit <b>${pct(part)}</b> du total à financer${ou}`;
  }

  function drawPie(d) {
    const node = $('#pie');
    node.innerHTML = '';
    const tip = document.createElement('div');
    tip.className = 'tooltip';
    node.appendChild(tip);

    const S = 320, cx = S / 2, cy = S / 2, R = 148, hole = 74;
    const svg = svgEl('svg', { viewBox: `0 0 ${S} ${S}`, role: 'img' });
    svg.setAttribute('aria-label', "Répartition de ce qui finance la dépense publique : " +
      d.parts.map((p) => `${p.label} ${pct(p.share)}`).join(', '));
    const pt = (a, r) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    let a0 = -Math.PI / 2;

    d.parts.forEach((p) => {
      const a1 = a0 + (p.share / 100) * Math.PI * 2;
      const big = a1 - a0 > Math.PI ? 1 : 0;
      const [x0, y0] = pt(a0, R), [x1, y1] = pt(a1, R);
      const [u0, v0] = pt(a0, hole), [u1, v1] = pt(a1, hole);
      const path = svgEl('path', {
        d: `M${x0},${y0}A${R},${R} 0 ${big} 1 ${x1},${y1}L${u1},${v1}A${hole},${hole} 0 ${big} 0 ${u0},${v0}Z`,
        fill: p.color, stroke: 'var(--bg)', 'stroke-width': 2,
      });
      path.setAttribute('tabindex', '0');
      path.setAttribute('role', 'button');
      path.setAttribute('aria-label', `${p.label}, ${md(p.v)}, ${pct(p.share)}`);
      const enter = () => { hovered = p.i; repaint(); showTip(p); };
      const leave = () => { hovered = null; repaint(); tip.classList.remove('on'); };
      path.addEventListener('pointerenter', enter);
      path.addEventListener('pointerleave', leave);
      path.addEventListener('focus', enter);
      path.addEventListener('blur', leave);
      path.addEventListener('click', () => open(p));
      path.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(p); }
      });
      svg.appendChild(path);
      a0 = a1;
    });

    const kv = svgEl('text', { x: cx, y: cy - 2, class: 'center-v' });
    kv.textContent = nf(totalNiveau(), 0) + ' Md€';
    const kk = svgEl('text', { x: cx, y: cy + 16, class: 'center-k' });
    kk.textContent = stack.length ? 'ce poste' : 'à financer';
    svg.append(kv, kk);
    node.appendChild(svg);

    function showTip(p) {
      const peut = p.rest || ouvrable(p.code);
      tip.innerHTML = `<strong>${emo(p.code)} ${p.label}</strong>
        <div class="r"><span>Montant</span><b>${md(p.v)}</b></div>
        <div class="r"><span>Part</span><b>${pct(p.share)}</b></div>
        <div class="r" style="margin-top:.3rem"><span>${peut ? 'Cliquer pour ouvrir' : "Cliquer pour voir l'origine"}</span></div>`;
      tip.classList.add('on');
      const r = node.getBoundingClientRect();
      tip.style.left = Math.max(0, r.width / 2 - 80) + 'px';
      tip.style.top = '0px';
    }
  }

  function drawKeys(d) {
    const ul = $('#keys');
    ul.innerHTML = '';
    d.parts.forEach((p) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      const suffix = p.rest ? ` <span class="leaf">(${p.count} postes)</span>` : '';
      b.innerHTML = `<i style="background:${p.color}"></i>
        <span class="name"><span class="emo">${emo(p.code)}</span>${p.label}${suffix}</span>
        <span class="md">${md(p.v)}</span>
        <span class="pc">${pct(p.share)}</span>`;
      b.addEventListener('pointerenter', () => { hovered = p.i; repaint(); });
      b.addEventListener('pointerleave', () => { hovered = null; repaint(); });
      b.addEventListener('click', () => open(p));
      li.appendChild(b);
      ul.appendChild(li);
    });

    // Postes négatifs : affichés, mais hors du camembert.
    d.negatifs.forEach((p) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = `<i style="background:transparent;border:1px dashed var(--ink-3)"></i>
        <span class="name"><span class="emo">${emo(p.code)}</span>${p.label}
          <span class="leaf">(se soustrait)</span></span>
        <span class="md">${md(p.v)}</span>
        <span class="pc">—</span>`;
      b.addEventListener('click', () => open(p));
      li.appendChild(b);
      ul.appendChild(li);
    });
  }

  /* La part cliquée reste en avant, comme au survol : sans cela, l'encart du
     bas parle d'un poste qu'on ne distingue plus dans le camembert. */
  const actif = () => (hovered != null
    ? hovered
    : PARTS.findIndex((d) => d.code && d.code === cellule));

  function repaint() {
    const a = actif();
    [...document.querySelectorAll('#pie path')].forEach((p, i) =>
      p.classList.toggle('dim', a >= 0 && i !== a));
    [...document.querySelectorAll('#keys button')].forEach((b, i) =>
      b.classList.toggle('on', i === a));
  }

  function open(p) {
    if (p.rest) {
      stack.push({ kind: 'rest', codes: p.rest, label: 'Autres postes', code: null });
    } else if (ouvrable(p.code)) {
      stack.push({ kind: 'fn', code: p.code, label: court(P(p.code).label) });
    } else {
      cellule = cellule === p.code ? null : p.code;
      drawCellule();
      repaint();
      return;
    }
    cellule = null;
    hovered = null;
    draw();
  }

  function drawCrumb() {
    const c = $('#crumb');
    c.innerHTML = '';
    const add = (label, depth, dernier) => {
      if (dernier) {
        const s = document.createElement('span');
        s.className = 'here';
        s.textContent = label;
        c.appendChild(s);
      } else {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = label;
        b.addEventListener('click', () => {
          stack = stack.slice(0, depth); hovered = null; cellule = null; draw();
        });
        c.appendChild(b);
        const sep = document.createElement('span');
        sep.className = 'sep';
        sep.textContent = '›';
        c.appendChild(sep);
      }
    };
    add("Tout ce qui finance", 0, stack.length === 0);
    stack.forEach((n, i) => add(`${emo(n.code)} ${n.label}`, i + 1, i === stack.length - 1));
  }

  fetch('data/recettes.json')
    .then((r) => r.json())
    .then((d) => {
      DATA = d;
      setupYears();
      $('#maj').textContent = new Date(d.genere)
        .toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
      draw();
      matchMedia('(prefers-color-scheme: dark)').addEventListener('change', draw);
    })
    .catch((err) => {
      console.error(err);
      $('#pie').innerHTML =
        '<p style="color:var(--ink-2)">Les données n\'ont pas pu être chargées.</p>';
    });
})();
