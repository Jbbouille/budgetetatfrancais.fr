/* budgetetatfrancais.fr — camembert cliquable + feuilles de sources.
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

  let DATA = null, META = null;
  let stack = [];          // pile de navigation : [] = racine
  let hovered = null;

  const last = (a) => a[a.length - 1];
  const L1 = () => Object.keys(DATA.apu).filter((k) => k.length === 4).sort();
  const val = (code) => last(DATA.apu[code].v);

  const shortLabel = (s) => s
    .replace('Services généraux des administrations publiques', 'Services généraux')
    .replace('Logements et équipements collectifs', 'Logement et équipements collectifs')
    .replace("Protection de l'environnement", 'Environnement');

  /* ---------- construction du niveau affiché ---------- */

  function children(code) {
    if (!code) return L1();
    return Object.keys(DATA.apu).filter((k) => k.length === 6 && k.startsWith(code));
  }

  /* Renvoie les parts du niveau courant, triées, repliées à SLOTS éléments. */
  function slices() {
    const node = last(stack) || null;
    const codeOf = node && node.kind === 'fn' ? node.code : null;

    let items;
    if (node && node.kind === 'rest') {
      items = node.codes.map((c) => ({ code: c, label: shortLabel(DATA.apu[c].label), v: val(c) }));
    } else {
      items = children(codeOf)
        .map((c) => ({ code: c, label: shortLabel(DATA.apu[c].label), v: val(c) }))
        .filter((d) => d.v > 0);
    }
    items.sort((a, b) => b.v - a.v);

    if (items.length > SLOTS) {
      const head = items.slice(0, SLOTS - 1);
      const tail = items.slice(SLOTS - 1);
      head.push({
        code: null, rest: tail.map((t) => t.code), label: 'Autres',
        v: tail.reduce((a, t) => a + t.v, 0), count: tail.length,
      });
      items = head;
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

  function draw() {
    readColors();
    const data = slices();
    drawPie(data);
    drawKeys(data);
    drawCrumb();
    drawLecture(data);
    drawSheet();
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

      const enter = () => { hovered = d.i; paint(); showTip(d); };
      const leave = () => { hovered = null; paint(); tip.classList.remove('on'); };
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

    function paint() {
      [...svg.querySelectorAll('path')].forEach((p, i) =>
        p.classList.toggle('dim', hovered != null && i !== hovered));
      [...document.querySelectorAll('#keys button')].forEach((b, i) =>
        b.classList.toggle('on', hovered === i));
    }

    function showTip(d) {
      const openable = d.rest || hasChildren(d.code);
      tip.innerHTML = `<strong>${d.label}</strong>
        <div class="r"><span>Montant</span><b>${md(d.v)}</b></div>
        <div class="r"><span>Part</span><b>${pct(d.share)}</b></div>
        ${openable ? '<div class="r" style="margin-top:.3rem"><span>Cliquer pour ouvrir</span></div>' : ''}`;
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
        <span class="name">${d.label}${suffix}</span>
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

  function repaint() {
    [...document.querySelectorAll('#pie path')].forEach((p, i) =>
      p.classList.toggle('dim', hovered != null && i !== hovered));
    [...document.querySelectorAll('#keys button')].forEach((b, i) =>
      b.classList.toggle('on', hovered === i));
  }

  function open(d) {
    if (d.rest) stack.push({ kind: 'rest', codes: d.rest, label: 'Autres fonctions' });
    else if (hasChildren(d.code)) stack.push({ kind: 'fn', code: d.code, label: d.label });
    else return;
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
        b.addEventListener('click', () => { stack = stack.slice(0, depth); hovered = null; draw(); });
        c.appendChild(b);
        const sep = document.createElement('span');
        sep.className = 'sep';
        sep.textContent = '›';
        c.appendChild(sep);
      }
    };
    add('Toutes les fonctions', 0, stack.length === 0);
    stack.forEach((n, i) => add(n.label, i + 1, i === stack.length - 1));
  }

  function drawLecture(data) {
    const top = data[0];
    const node = last(stack);
    const total = parentTotal();
    $('#lecture').textContent = node
      ? `au sein du poste « ${node.label} » (${md(total)}), ${top.label.toLowerCase()} pèse ${md(top.v)}, soit ${pct(top.share)}.`
      : `en 2024, la dépense publique atteint ${md(total)}. La protection sociale — retraites, maladie, famille, chômage — en représente à elle seule ${pct(data.find((d) => d.code === 'GF10')?.share ?? 0)}.`;
  }

  /* ---------- feuilles « tableur » ---------- */

  const COL = (n) => String.fromCharCode(65 + n);

  function sheetTable(headers, rows, widths = {}) {
    const ncol = headers.length;
    let h = '<table><thead><tr><th></th>' +
      headers.map((_, i) => `<th>${COL(i)}</th>`).join('') + '</tr></thead><tbody>';
    h += '<tr><th>1</th>' + headers.map((t, i) =>
      `<td class="hd${widths[i] || ''}">${t}</td>`).join('') + '</tr>';
    rows.forEach((r, ri) => {
      h += `<tr><th>${ri + 2}</th>` + r.map((cell, i) => {
        const c = typeof cell === 'object' ? cell : { t: cell };
        return `<td class="${c.n ? 'n' : ''}${widths[i] || ''}">${c.t}</td>`;
      }).join('') + '</tr>';
    });
    return h + '</tbody></table>';
  }

  const SHEETS = {
    sources: {
      nom: 'Sources',
      build() {
        const s = META.sources;
        const order = ['ip2106', 'cn2024', 'ip2093', 'cn2023', 'cn2022', 'cn2025', 'cofog', 'demo', 'ir78'];
        const rows = order.filter((k) => s[k]).map((k) => {
          const x = s[k];
          const nFiles = (x.tableaux || []).length;
          return [
            x.coll,
            { t: x.titre },
            x.date || '—',
            `<a href="${x.page}">Ouvrir la page Insee</a>`,
            x.donnees
              ? `<a href="${x.donnees}">${x.donnees.split('/').pop()}</a>` +
                (nFiles > 1 ? ` <span class="leaf">+ ${nFiles - 1} autres</span>` : '')
              : (x.note ? '<span class="leaf">pas encore publié</span>' : '—'),
            x.pdf ? `<a href="${x.pdf}">PDF</a>` : '—',
          ];
        });
        return {
          html: sheetTable(
            ['Publication', 'Titre', 'Date', 'Page Insee', 'Fichier Excel', 'PDF'],
            rows, { 1: ' wrap-cell' }),
          info: `${rows.length} sources · tous les liens pointent vers insee.fr`,
        };
      },
    },

    fichiers: {
      nom: 'Fichiers Excel',
      build() {
        const s = META.sources;
        const rows = [];
        ['cn2024', 'cn2023', 'cn2022'].forEach((k) => {
          const x = s[k];
          (x.tableaux || []).forEach((f) => {
            rows.push([
              String(x.millesime),
              f.id,
              { t: f.nom },
              `<a href="${f.url}">${f.fichier}</a>`,
              `<a href="${x.page}">page ${x.millesime}</a>`,
              f.utilise ? 'oui' : '—',
            ]);
          });
        });
        return {
          html: sheetTable(
            ['Millésime', 'Tableau', 'Contenu', 'Fichier Excel', 'Page Insee', 'Utilisé ici'],
            rows, { 2: ' wrap-cell' }),
          info: `${rows.length} fichiers · le graphique est construit sur le tableau 3.301 du millésime 2024`,
        };
      },
    },

    donnees: {
      nom: 'Données du graphique',
      build() {
        const data = slices();
        const rows = data.map((d) => [
          { t: `<span class="sw" style="background:${d.color}"></span>${d.label}` },
          { t: nf(d.v), n: true },
          { t: nf(d.share), n: true },
          { t: d.code || '—' },
        ]);
        rows.push([{ t: '<b>Total</b>' }, { t: `<b>${nf(parentTotal())}</b>`, n: true },
          { t: '<b>100,0</b>', n: true }, { t: '' }]);
        const node = last(stack);
        return {
          html: sheetTable(['Poste', 'Md€', '% du niveau', 'Code COFOG'], rows, { 0: ' wrap-cell' }),
          info: `niveau affiché : ${node ? node.label : 'toutes les fonctions'} · année 2024`,
        };
      },
    },

    cles: {
      nom: 'Chiffres clés 2025',
      build() {
        const m = META.macro;
        const d = META.deficit_secteurs;
        const rows = [
          ['Dépenses publiques', { t: nf(m.depenses_md), n: true }, { t: nf(m.depenses_pib), n: true }, 'Insee Première 2106'],
          ['Recettes publiques', { t: nf(m.recettes_md), n: true }, { t: nf(m.recettes_pib), n: true }, 'Insee Première 2106'],
          ['Déficit public', { t: nf(m.deficit_md), n: true }, { t: nf(m.deficit_pib), n: true }, 'Insee Première 2106'],
          ['Dette publique (Maastricht)', { t: nf(m.dette_md), n: true }, { t: nf(m.dette_pib), n: true }, 'Insee Première 2106'],
          ['Prélèvements obligatoires', { t: '—', n: true }, { t: nf(m.prelevements_pib), n: true }, 'Insee Première 2106'],
          ...d.items.map((it) => [`Besoin de financement — ${it.nom}`,
            { t: nf(it.v), n: true }, { t: '—', n: true }, 'Insee Première 2106, figure 3']),
        ];
        return {
          html: sheetTable(['Agrégat', 'Md€', '% du PIB', 'Source'], rows, { 0: ' wrap-cell' }),
          info: 'année 2025 · comptes nationaux base 2020',
        };
      },
    },
  };

  let sheet = 'sources';

  function drawSheet() {
    const tabs = $('#tabs');
    tabs.innerHTML = '';
    Object.entries(SHEETS).forEach(([k, s]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(k === sheet));
      b.textContent = s.nom;
      b.addEventListener('click', () => { sheet = k; drawSheet(); });
      tabs.appendChild(b);
    });
    const { html, info } = SHEETS[sheet].build();
    $('#sheet').innerHTML = html;
    $('#sheet-info').textContent = info;
  }

  /* ---------- démarrage ---------- */

  Promise.all([
    fetch('data/cofog.json').then((r) => r.json()),
    fetch('data/meta.json').then((r) => r.json()),
  ])
    .then(([d, m]) => {
      DATA = d; META = m;
      $('#maj').textContent = new Date(m.maj)
        .toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
      draw();
      matchMedia('(prefers-color-scheme: dark)').addEventListener('change', draw);
    })
    .catch((err) => {
      console.error(err);
      $('#pie').innerHTML =
        '<p style="color:var(--ink-2)">Les données n\'ont pas pu être chargées. ' +
        'Les fichiers sources restent accessibles ci-dessous.</p>';
    });
})();
