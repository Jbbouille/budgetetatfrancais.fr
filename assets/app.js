/* budgetetatfrancais.fr — camembert cliquable des dépenses publiques.
   Aucune dépendance externe : SVG construit à la main. */

(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const SVGNS = 'http://www.w3.org/2000/svg';

  const nf = (n, d = 1) =>
    Number(n).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const md = (n, d = 1) => nf(n, d) + ' Md€';
  const pct = (n, d = 1) => nf(n, d) + ' %';

  /* Palette catégorielle validée (séparation daltonisme sur paires adjacentes,
     ce qui est exactement le cas d'un camembert). Six parts au maximum : au-delà,
     le reste est replié dans « Autres », lui-même cliquable. */
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

  let DATA = null, DEFS = null;
  let stack = [];          // pile de navigation : [] = racine
  let hovered = null;
  let yi = 0;              // index de l'année affichée dans DATA.years
  let cellule = null;      // code du poste terminal dont on montre la cellule Excel

  const last = (a) => a[a.length - 1];
  const val = (code) => DATA.apu[code].v[yi] ?? 0;
  const year = () => DATA.years[yi];


  /* Un emoji par poste. Les sous-fonctions héritent de celui de leur fonction
     parente sauf mention explicite ci-dessous. L'emoji complète le libellé et
     la pastille de couleur, il ne les remplace pas. */
  const EMOJI = {
    GF01: '\u{1F3DB}️',  // services généraux
    GF02: '\u{1F6E1}️',  // défense
    GF03: '\u{1F693}',        // ordre et sécurité publics
    GF04: '\u{1F3D7}️',  // affaires économiques
    GF05: '\u{1F331}',        // environnement
    GF06: '\u{1F3E0}',        // logement et équipements collectifs
    GF07: '\u{1F3E5}',        // santé
    GF08: '\u{1F3AD}',        // loisirs, culture et culte
    GF09: '\u{1F393}',        // enseignement
    GF10: '\u{1F91D}',        // protection sociale
    // sous-fonctions notables
    GF0104: '\u{1F9EA}',       // recherche fondamentale
    GF0107: '\u{1F4B8}',       // opérations concernant la dette publique
    GF0405: '\u{1F69C}',       // agriculture, sylviculture, pêche
    GF0406: '⚡',          // combustibles et énergie
    GF0409: '\u{1F6E3}️', // transports
    GF0701: '\u{1F48A}',       // produits et appareils médicaux
    GF0703: '\u{1F6CF}️', // services hospitaliers
    GF0901: '\u{1F9F8}',       // enseignement préscolaire et primaire
    GF0902: '\u{1F4DA}',       // enseignement secondaire
    GF0904: '\u{1F3EB}',       // enseignement supérieur
    GF1001: '\u{1FA7A}',       // maladie et invalidité
    GF1002: '\u{1F475}',       // vieillesse
    GF1003: '\u{1F54A}️', // survivants
    GF1004: '\u{1F476}',       // famille et enfants
    GF1005: '\u{1F4BC}',       // chômage
    GF1006: '\u{1F3E0}',       // logement
    GF1007: '\u{1F91A}',       // exclusion sociale
    AUTRES: '\u{1F4E6}',
  };
  const emo = (code) =>
    code ? (EMOJI[code] || EMOJI[code.slice(0, 4)] || '') : EMOJI.AUTRES;

  const shortLabel = (s) => s
    .replace('Services généraux des administrations publiques', 'Services généraux')
    .replace('Logements et équipements collectifs', 'Logement et équipements collectifs')
    .replace("Protection de l'environnement", 'Environnement');

  /* ---------- construction du niveau affiché ---------- */

  /* Les codes COFOG encodent la profondeur dans leur longueur : GF10 (niveau 1),
     GF1002 (niveau 2). Un enfant fait donc exactement deux caractères de plus
     que son parent — sans cette contrainte de longueur, un code se retrouverait
     dans sa propre liste d'enfants et on pourrait descendre indéfiniment. */
  function children(code) {
    const n = code ? code.length + 2 : 4;
    return Object.keys(DATA.apu)
      .filter((k) => k.length === n && (!code || k.startsWith(code)))
      .sort();
  }

  /* L'ordre des parts et leur couleur sont fixés par une année de référence (la
     dernière disponible), jamais par le classement de l'année affichée : sinon
     déplacer le curseur repeindrait les parts et une couleur ne désignerait plus
     la même fonction d'une année à l'autre. Seules les valeurs suivent l'année. */
  const REF = () => DATA.years.length - 1;
  const at = (code, i) => DATA.apu[code].v[i] ?? 0;
  const everPositive = (code) => DATA.apu[code].v.some((x) => x > 0);

  function slices() {
    const node = last(stack) || null;
    const codeOf = node && node.kind === 'fn' ? node.code : null;
    const ref = REF();

    let codes = node && node.kind === 'rest'
      ? node.codes.slice()
      : children(codeOf).filter(everPositive);

    codes.sort((a, b) => at(b, ref) - at(a, ref));

    let items;
    if (codes.length > SLOTS) {
      const tail = codes.slice(SLOTS - 1);
      items = codes.slice(0, SLOTS - 1)
        .map((c) => ({ code: c, label: shortLabel(DATA.apu[c].label), v: val(c) }));
      items.push({
        code: null, rest: tail, label: 'Autres',
        v: tail.reduce((a, c) => a + val(c), 0), count: tail.length,
      });
    } else {
      items = codes.map((c) => ({ code: c, label: shortLabel(DATA.apu[c].label), v: val(c) }));
    }

    const total = items.reduce((a, d) => a + d.v, 0);
    return items.map((d, i) => ({ ...d, i, color: COLORS[i], share: (d.v / total) * 100, total }));
  }

  const parentTotal = () => {
    const node = last(stack);
    if (!node) return val('_Z');
    if (node.kind === 'rest') return node.codes.reduce((a, c) => a + val(c), 0);
    return val(node.code);
  };

  const hasChildren = (code) => code && children(code).some((c) => val(c) > 0);

  /* ---------- rendu ---------- */


  /* ---------- état dans l'URL ---------- */

  /* Le hash porte le poste ouvert et l'année : #poste=GF1002&annee=2015. On y
     écrit avec replaceState pour ne pas remplir l'historique à chaque survol de
     curseur — le bouton « précédent » ramène donc à la page d'avant, pas à la
     part précédente. */
  const ancetres = (code) => {
    const out = [];
    for (let n = 4; n < code.length; n += 2) out.push(code.slice(0, n));
    return out;
  };

  /* Deux paramètres, parce qu'il y a deux états distincts :
       - `poste` : la part est SÉLECTIONNÉE dans le camembert de son parent,
         mise en avant, avec son encart — c'est ce qu'on attend d'un lien ;
       - `niveau` : la part est OUVERTE, le camembert montre ses composantes.
     Sans cette distinction, #poste=GF03 ouvrait la fonction au lieu de la
     désigner, et rien n'était surligné. */
  function lireURL() {
    const q = new URLSearchParams(location.hash.slice(1));
    const annee = parseInt(q.get('annee'), 10);
    if (annee) {
      const i = DATA.years.indexOf(annee);
      if (i >= 0) yi = i;
    }
    stack = []; cellule = null;
    readColors();

    const niveau = q.get('niveau');
    const poste = q.get('poste');
    const cible = poste || niveau;
    if (!cible || !DATA.apu[cible]) return;

    for (const a of ancetres(cible)) {
      if (DATA.apu[a]) stack.push({ kind: 'fn', code: a, label: shortLabel(DATA.apu[a].label) });
    }

    if (!poste) {
      // niveau seul : on ouvre la fonction
      stack.push({ kind: 'fn', code: niveau, label: shortLabel(DATA.apu[niveau].label) });
      return;
    }

    cellule = poste;
    // Un poste replié dans « Autres » n'est pas dessiné : on ouvre ce repli,
    // sinon l'encart décrirait une part absente du camembert.
    const parts = slices();
    if (!parts.some((d) => d.code === poste)) {
      const repli = parts.find((d) => d.rest && d.rest.includes(poste));
      if (repli) {
        stack.push({ kind: 'rest', codes: repli.rest, label: 'Autres fonctions', code: null });
      }
    }
  }

  function ecrireURL() {
    const node = last(stack);
    const q = new URLSearchParams();
    if (cellule) q.set('poste', cellule);
    else if (node && node.kind === 'fn') q.set('niveau', node.code);
    if (yi !== DATA.years.length - 1) q.set('annee', DATA.years[yi]);
    const hash = q.toString();
    const url = location.pathname + location.search + (hash ? '#' + hash : '');
    if (url !== location.pathname + location.search + location.hash) {
      history.replaceState(null, '', url);
    }
  }

  let PARTS = [];

  function draw() {
    readColors();
    drawYear();
    const data = slices();
    PARTS = data;
    drawPie(data);
    drawKeys(data);
    drawCrumb();
    drawCellule();
    repaint();
    ecrireURL();
  }

  /* ---------- sélecteur d'année ---------- */

  function drawYear() {
    $('#y-out').textContent = year();
    $('#champ-annee').textContent = year();
    $('#sub').textContent =
      `${year()} · ${nf(val('_Z'), 1)} milliards d'euros · ensemble des administrations ` +
      `publiques (État, Sécurité sociale, collectivités locales)`;
    const r = $('#y-range');
    if (r.value !== String(yi)) r.value = String(yi);
    $('#y-prev').disabled = yi === 0;
    $('#y-next').disabled = yi === DATA.years.length - 1;
  }

  function setupYears() {
    const r = $('#y-range');
    r.max = String(DATA.years.length - 1);
    yi = DATA.years.length - 1;
    r.value = String(yi);
    $('#y-ticks').innerHTML = DATA.years
      .map((y, i) => (y % 5 === 0 ? `<option value="${i}" label="${y}"></option>` : ''))
      .join('');
    const go = (i) => {
      const n = Math.max(0, Math.min(DATA.years.length - 1, i));
      if (n === yi) return;
      yi = n; hovered = null; draw();
    };
    r.addEventListener('input', () => go(+r.value));
    $('#y-prev').addEventListener('click', () => go(yi - 1));
    $('#y-next').addEventListener('click', () => go(yi + 1));
  }

  /* Depliant : ce que recouvre un poste. Replie par defaut pour ne pas gener
     la lecture, et toujours accompagne du lien vers la definition de reference. */
  function definition(code) {
    if (!DEFS || !code) return '';
    const texte = DEFS.postes[code];
    if (!texte) return '';
    const liens = (DEFS.liens[code] || [DEFS.source])
      .map((l) => `<a href="${l.url}">${l.label}</a>`).join(' · ');
    return `<details class="def"><summary>Que recouvre ce poste&nbsp;?</summary>` +
      `<p>${texte}</p><p class="liens">${liens}</p>` +
      `<p class="src">${DEFS.source.note}</p></details>`;
  }

  /* Encart du bas. Il porte, selon le cas :
       - le poste terminal qu'on vient de cliquer : montant, part, cellule du
         classeur d'origine, puis sa définition ;
       - sinon le niveau ouvert : montant, part et définition, sans cellule,
         puisqu'on n'a pas désigné de chiffre précis.
     Rien à la racine. */
  function drawCellule() {
    const el = $('#cellule');
    const node = last(stack);
    const code = cellule || (node && node.kind === 'fn' ? node.code : null);
    const p = code && DATA.apu[code];
    if (!p) { el.hidden = true; el.innerHTML = ''; return; }

    const montant = p.v[yi] ?? 0;
    const partTotale = (montant / val('_Z')) * 100;

    let ou = '';
    if (cellule && p.r != null) {
      const s = DATA.source;
      const ref = s.colonnes[yi] + p.r;
      ou = `<span class="ou"><a href="${s.url}">${s.fichier}</a> · feuille ` +
        `<code>${s.feuille}</code> · ligne <code>${p.r}</code> · colonne ` +
        `<code>${s.colonnes[yi]}</code> · cellule <code>${ref}</code></span>`;
    }

    el.hidden = false;
    el.innerHTML =
      `<span class="emo">${emo(code)}</span>` +
      `<b>${p.label}</b> — ${md(montant)} en ${year()}, soit ` +
      `<b>${pct(partTotale)}</b> de la dépense publique totale` +
      ou + definition(code);
  }

  function drawPie(data) {
    const node = $('#pie');
    node.innerHTML = '';
    const tip = document.createElement('div');
    tip.className = 'tooltip';
    node.appendChild(tip);

    const S = 320, cx = S / 2, cy = S / 2, R = 148, hole = 74;
    const svg = svgEl('svg', { viewBox: `0 0 ${S} ${S}`, role: 'img' });
    svg.setAttribute('aria-label',
      'Répartition de la dépense publique : ' + data.map((d) => `${d.label} ${pct(d.share)}`).join(', '));

    const pt = (a, r) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    let a0 = -Math.PI / 2;

    data.forEach((d) => {
      const a1 = a0 + (d.share / 100) * Math.PI * 2;
      const big = a1 - a0 > Math.PI ? 1 : 0;
      const [x0, y0] = pt(a0, R), [x1, y1] = pt(a1, R);
      const [u0, v0] = pt(a0, hole), [u1, v1] = pt(a1, hole);
      const path = svgEl('path', {
        d: `M${x0},${y0}A${R},${R} 0 ${big} 1 ${x1},${y1}L${u1},${v1}A${hole},${hole} 0 ${big} 0 ${u0},${v0}Z`,
        fill: d.color,
        /* le liseré de 2px sépare les parts voisines */
        stroke: 'var(--bg)', 'stroke-width': 2,
      });
      path.setAttribute('tabindex', '0');
      path.setAttribute('role', 'button');
      path.setAttribute('aria-label', `${d.label}, ${md(d.v)}, ${pct(d.share)}`);

      const enter = () => { hovered = d.i; repaint(); showTip(d); };
      const leave = () => { hovered = null; repaint(); tip.classList.remove('on'); };
      path.addEventListener('pointerenter', enter);
      path.addEventListener('pointerleave', leave);
      path.addEventListener('focus', enter);
      path.addEventListener('blur', leave);
      path.addEventListener('click', () => open(d));
      path.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(d); }
      });
      svg.appendChild(path);
      a0 = a1;
    });

    const total = parentTotal();
    const kv = svgEl('text', { x: cx, y: cy - 2, class: 'center-v' });
    kv.textContent = nf(total, 0) + ' Md€';
    const kk = svgEl('text', { x: cx, y: cy + 16, class: 'center-k' });
    kk.textContent = stack.length ? 'ce poste' : 'dépense totale';
    svg.append(kv, kk);
    node.appendChild(svg);

    function paint() { repaint(); }

    function showTip(d) {
      const openable = d.rest || hasChildren(d.code);
      tip.innerHTML = `<strong>${emo(d.code)} ${d.label}</strong>
        <div class="r"><span>Montant</span><b>${md(d.v)}</b></div>
        <div class="r"><span>Part</span><b>${pct(d.share)}</b></div>
        <div class="r" style="margin-top:.3rem"><span>${openable ? 'Cliquer pour ouvrir' : 'Cliquer pour voir la cellule Excel'}</span></div>`;
      tip.classList.add('on');
      const r = node.getBoundingClientRect();
      tip.style.left = Math.max(0, r.width / 2 - 80) + 'px';
      tip.style.top = '0px';
    }
  }

  function drawKeys(data) {
    const ul = $('#keys');
    ul.innerHTML = '';
    data.forEach((d) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      const openable = d.rest || hasChildren(d.code);
      const suffix = d.rest ? ` <span class="leaf">(${d.count} postes)</span>` : '';
      b.innerHTML = `<i style="background:${d.color}"></i>
        <span class="name"><span class="emo">${emo(d.code)}</span>${d.label}${suffix}</span>
        <span class="md">${md(d.v)}</span>
        <span class="pc">${pct(d.share)}</span>`;
      b.addEventListener('pointerenter', () => { hovered = d.i; repaint(); });
      b.addEventListener('pointerleave', () => { hovered = null; repaint(); });
      b.addEventListener('click', () => open(d));
      if (!openable) b.style.cursor = 'default';
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

  function open(d) {
    if (d.rest) {
      stack.push({ kind: 'rest', codes: d.rest, label: 'Autres fonctions', code: null });
    } else if (hasChildren(d.code)) {
      stack.push({ kind: 'fn', code: d.code, label: d.label });
    } else {
      // Poste terminal : plus rien à ouvrir, on montre d'où vient le chiffre.
      cellule = cellule === d.code ? null : d.code;
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
    const add = (label, depth, isLast) => {
      if (isLast) {
        const s = document.createElement('span');
        s.className = 'here';
        s.textContent = label;
        c.appendChild(s);
      } else {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = label;
        b.addEventListener('click', () => { stack = stack.slice(0, depth); hovered = null; cellule = null; draw(); });
        c.appendChild(b);
        const sep = document.createElement('span');
        sep.className = 'sep';
        sep.textContent = '›';
        c.appendChild(sep);
      }
    };
    add('Toutes les fonctions', 0, stack.length === 0);
    stack.forEach((n, i) => add(`${emo(n.code)} ${n.label}`, i + 1, i === stack.length - 1));

  }

  /* ---------- démarrage ---------- */

  Promise.all([
    fetch('data/cofog.json').then((r) => r.json()),
    // Les definitions sont facultatives : si le fichier manque, la page
    // fonctionne, le depliant « que recouvre ce poste » ne s'affiche pas.
    fetch('data/definitions.json').then((r) => r.json()).catch(() => null),
  ])
    .then(([d, defs]) => {
      DATA = d; DEFS = defs;
      setupYears();
      lireURL();
      $('#maj').textContent = new Date(d.genere)
        .toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
      draw();
      matchMedia('(prefers-color-scheme: dark)').addEventListener('change', draw);
      addEventListener('hashchange', () => { lireURL(); hovered = null; draw(); });
    })
    .catch((err) => {
      console.error(err);
      $('#pie').innerHTML =
        '<p style="color:var(--ink-2)">Les données n\'ont pas pu être chargées.</p>';
    });
})();
