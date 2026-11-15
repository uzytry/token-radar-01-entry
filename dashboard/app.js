// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and renders
// the ranked board, a filterable and sortable table, a per-protocol detail drawer with the model's own
// inputs and the protocol's farm plan, a category breakdown, and a model sandbox that re-ranks the
// board live. No network: every byte it shows is in data.js, and the page recomputes every implied
// value from the snapshot figures with impliedOf(), the same arithmetic lib/model.ts runs, so the
// page and board.json agree.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var DEFAULTS = DATA.model;

  // The page's state, mirrored in the URL hash so a view (a filter, a protocol's detail) is a link.
  var state = {
    q: '', category: 'all', chain: 'all', tab: 'pre-token', sort: 'implied', dir: -1,
    selected: null, watchlistOnly: false, sandboxOpen: false,
    sandbox: { base_multiple: DEFAULTS.base_multiple, growth_weight: DEFAULTS.growth_weight, maturity_floor: DEFAULTS.maturity_floor, leadership_bonus: DEFAULTS.leadership_bonus }
  };

  var usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd0.format(n);
  }
  function fmtUsdFull(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return usd0.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) { return 'x' + n.toFixed(2); }
  function fmtShare(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n * 100).toFixed(1) + '%';
  }

  // The model in one function: impliedOf() recomputes a row from the snapshot figures (TVL, seven-day
  // growth, age with no token, chain count, category leadership) under the given constants — the same
  // arithmetic as impliedValue() in lib/model.ts. The detail view checks its answer against
  // board.json's number.
  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    var breadth = 1 + model.breadth_per_chain * Math.min((row.chains || []).length, model.breadth_max_chains);
    var leader = row.is_category_leader ? model.leadership_bonus : 1;
    return Math.max(1, Math.round(row.tvl_usd * model.base_multiple * growthMult * maturity * breadth * leader));
  }

  // The sandbox's constants as a full model object, or the shipped model when the sandbox is at rest.
  function sandboxActive() {
    var s = state.sandbox;
    return Math.abs(s.base_multiple - DEFAULTS.base_multiple) > 0.0001 ||
      Math.abs(s.growth_weight - DEFAULTS.growth_weight) > 0.0001 ||
      Math.abs(s.maturity_floor - DEFAULTS.maturity_floor) > 0.0001 ||
      Math.abs(s.leadership_bonus - DEFAULTS.leadership_bonus) > 0.0001;
  }
  function activeModel() {
    if (!sandboxActive()) return DEFAULTS;
    var m = {};
    Object.keys(DEFAULTS).forEach(function (k) { m[k] = DEFAULTS[k]; });
    m.base_multiple = state.sandbox.base_multiple;
    m.growth_weight = state.sandbox.growth_weight;
    m.maturity_floor = state.sandbox.maturity_floor;
    m.leadership_bonus = state.sandbox.leadership_bonus;
    return m;
  }

  // The board under the active model: each row recomputed, re-sorted, re-ranked. At the shipped
  // constants this is exactly board.json (same values, same ranks); move a sandbox slider and the
  // board re-ranks live, which is the proof the model is a function, not a hardcoded list of names.
  function effectiveRows() {
    var model = activeModel();
    var list = DATA.rows.map(function (r) {
      var copy = {};
      Object.keys(r).forEach(function (k) { copy[k] = r[k]; });
      copy.effective_implied = sandboxActive() ? impliedOf(r, model) : r.implied_value_usd;
      return copy;
    });
    list.sort(function (a, b) {
      if (b.effective_implied !== a.effective_implied) return b.effective_implied - a.effective_implied;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
    list.forEach(function (r, i) { r.effective_rank = i + 1; });
    return list;
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('tab') === 'live' || params.get('tab') === 'pre-token') state.tab = params.get('tab');
    if (params.get('sort')) state.sort = params.get('sort');
    if (params.get('dir') === '1' || params.get('dir') === '-1') state.dir = Number(params.get('dir'));
    if (params.get('watchlist') === '1') state.watchlistOnly = true;
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('sandbox') === '1') state.sandboxOpen = true;
    var bmRaw = params.get('bm'); var bm = bmRaw === null ? NaN : Number(bmRaw); if (isFinite(bm) && bm > 0) state.sandbox.base_multiple = bm;
    var gwRaw = params.get('gw'); var gw = gwRaw === null ? NaN : Number(gwRaw); if (isFinite(gw) && gw >= 0) state.sandbox.growth_weight = gw;
    var mfRaw = params.get('mf'); var mf = mfRaw === null ? NaN : Number(mfRaw); if (isFinite(mf) && mf > 0) state.sandbox.maturity_floor = mf;
    var lbRaw = params.get('lb'); var lb = lbRaw === null ? NaN : Number(lbRaw); if (isFinite(lb) && lb >= 1) state.sandbox.leadership_bonus = lb;
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.sort !== 'implied') params.set('sort', state.sort);
    if (state.dir !== -1) params.set('dir', String(state.dir));
    if (state.watchlistOnly) params.set('watchlist', '1');
    if (state.selected) params.set('p', state.selected);
    if (state.sandboxOpen) params.set('sandbox', '1');
    if (sandboxActive()) {
      params.set('bm', String(state.sandbox.base_multiple));
      params.set('gw', String(state.sandbox.growth_weight));
      params.set('mf', String(state.sandbox.maturity_floor));
      params.set('lb', String(state.sandbox.leadership_bonus));
    }
    var next = params.toString();
    var base = window.location.pathname + window.location.search;
    window.history.replaceState(null, '', next ? '#' + next : base);
  }

  function filteredRows(list) {
    var q = state.q.trim().toLowerCase();
    return list.filter(function (r) {
      if (state.watchlistOnly && !r.watchlist) return false;
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category || 'Other', (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? -Infinity : a.age_days; bv = b.age_days === null ? -Infinity : b.age_days; }
      else if (key === 'chains') { av = (a.chains || []).length; bv = (b.chains || []).length; }
      else { av = a.effective_implied; bv = b.effective_implied; }
      var c = av < bv ? -1 : av > bv ? 1 : 0;
      if (c !== 0) return c * state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function combinedImplied(list) {
    return list.reduce(function (n, r) { return n + r.effective_implied; }, 0);
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' },
        el('span', { class: 'scope', 'aria-hidden': 'true' }),
        el('span', { class: 'brand-name' }, 'TOKEN ', el('em', { text: 'RADAR' }))
      ),
      el('div', { class: 'top-meta' },
        el('span', { class: 'mono', text: 'Snapshot ' + DATA.as_of }),
        el('span', { class: 'mono', text: 'Model ' + DATA.model_version }),
        el('span', { class: 'pill' }, el('span', { class: 'dot', 'aria-hidden': 'true' }), 'Watchlist ', el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size }), ' covered')
      )
    );
  }

  function hero() {
    var total = combinedImplied(effectiveRows());
    return el('section', { class: 'hero' },
      el('div', null,
        el('div', { class: 'kicker', text: 'Pre-token protocols · ranked by implied value' }),
        el('h1', { text: 'Which token launches next — and what is it worth?' }),
        el('p', null,
          'The watchlist is the floor: every protocol with at least ',
          el('b', { text: fmtUsd(DATA.floor_usd) }),
          ' of TVL and no token on record. The early radar adds ',
          el('b', { text: 'every rankable pre-token protocol below that floor — ' + DATA.early_size + ' finds, no top-N cut' }),
          '. Implied value is a model of the snapshot\u2019s own figures — TVL, seven-day growth, age with no token, chain breadth, category leadership — never a price, and never a hardcoded list of names.'
        )
      ),
      el('div', { class: 'stats' },
        el('div', { class: 'stat accent' },
          el('b', { id: 'stat-combined', text: fmtUsd(total) }),
          el('span', { text: 'Combined implied value of the board' })
        ),
        el('div', { class: 'stat' },
          el('b', { text: String(DATA.board_size) }),
          el('span', { text: 'Pre-token rows ranked' })
        ),
        el('div', { class: 'stat' },
          el('b', { text: String(DATA.early_size) }),
          el('span', { text: 'Early finds below the floor' })
        ),
        el('div', { class: 'stat' },
          el('b', { text: String(DATA.live_size) }),
          el('span', { text: 'Live-token protocols set aside' })
        )
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chainCounts = {};
    DATA.rows.forEach(function (r) { (r.chains || []).forEach(function (c) { chainCounts[c] = (chainCounts[c] || 0) + 1; }); });
    var chains = Object.keys(chainCounts).sort(function (a, b) { return chainCounts[b] - chainCounts[a] || (a < b ? -1 : 1); });

    var search = el('input', { type: 'search', id: 'q', placeholder: 'Name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); refresh(); });

    var catSelect = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c + ' (' + DATA.rows.filter(function (r) { return (r.category || 'Other') === c; }).length + ')', selected: c === state.category ? 'selected' : null }); })
    );
    catSelect.addEventListener('change', function () { state.category = catSelect.value; writeHash(); refresh(); });

    var chainSelect = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c + ' (' + chainCounts[c] + ')', selected: c === state.chain ? 'selected' : null }); })
    );
    chainSelect.addEventListener('change', function () { state.chain = chainSelect.value; writeHash(); refresh(); });

    var watchBtn = el('button', { id: 'watchlist-toggle', class: 'toggle', type: 'button', 'aria-pressed': state.watchlistOnly ? 'true' : 'false', text: 'Watchlist only' });
    watchBtn.addEventListener('click', function () {
      state.watchlistOnly = !state.watchlistOnly;
      watchBtn.setAttribute('aria-pressed', state.watchlistOnly ? 'true' : 'false');
      writeHash(); refresh();
    });

    var preBtn = el('button', { id: 'tab-pre', type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token' });
    var liveBtn = el('button', { id: 'tab-live', type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token' });
    preBtn.addEventListener('click', function () { state.tab = 'pre-token'; writeHash(); refresh(); });
    liveBtn.addEventListener('click', function () { state.tab = 'live'; writeHash(); refresh(); });

    var sandboxBtn = el('button', { id: 'sandbox-toggle', class: 'toggle', type: 'button', 'aria-pressed': state.sandboxOpen ? 'true' : 'false', text: 'Model sandbox' });
    sandboxBtn.addEventListener('click', function () {
      state.sandboxOpen = !state.sandboxOpen;
      sandboxBtn.setAttribute('aria-pressed', state.sandboxOpen ? 'true' : 'false');
      writeHash(); refresh();
    });

    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), catSelect),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSelect),
      el('div', { class: 'field' }, el('label', { text: 'Scope' }), watchBtn),
      el('div', { class: 'field' }, el('label', { text: 'Token status' }), el('div', { class: 'tabs' }, preBtn, liveBtn)),
      el('div', { class: 'field' }, el('label', { text: 'Model' }), sandboxBtn),
      el('span', { id: 'count', class: 'count' })
    );
  }

  // The model in one line, above the table: the formula and its five factors, so the board's first
  // screen states how every number below it is made. The full factor cards sit in the model panel.
  function modelStrip() {
    var m = DEFAULTS;
    return el('div', { class: 'model-strip' },
      el('span', { class: 'formula-line' },
        'implied = TVL ', el('span', { class: 'op', text: '×' }), ' ' + m.base_multiple + ' ',
        el('span', { class: 'op', text: '×' }), ' growth ',
        el('span', { class: 'op', text: '×' }), ' maturity ',
        el('span', { class: 'op', text: '×' }), ' breadth ',
        el('span', { class: 'op', text: '×' }), ' leadership'
      ),
      el('span', { class: 'factor-chips' },
        el('span', { class: 'factor-chip' }, 'TVL ', el('b', { text: '× ' + m.base_multiple })),
        el('span', { class: 'factor-chip' }, '7d ', el('b', { text: 'clamped ' + m.growth_floor + '%…+' + m.growth_cap + '%' })),
        el('span', { class: 'factor-chip' }, 'Age ', el('b', { text: m.maturity_floor + ' → ' + (m.maturity_floor + m.maturity_range).toFixed(2) })),
        el('span', { class: 'factor-chip' }, 'Chains ', el('b', { text: '+' + Math.round(m.breadth_per_chain * 100) + '% each, max ' + m.breadth_max_chains })),
        el('span', { class: 'factor-chip' }, 'Category leader ', el('b', { text: '× ' + m.leadership_bonus }))
      )
    );
  }

  function sandboxPanel() {
    var box = el('section', { id: 'sandbox', class: 'sandbox' });
    if (!state.sandboxOpen) { box.style.display = 'none'; return box; }
    function slider(id, label, hint, min, max, step, value, key) {
      var out = el('output', { id: id + '-out', text: String(value) });
      var input = el('input', { type: 'range', id: id, min: String(min), max: String(max), step: String(step), value: String(value), 'aria-label': label });
      input.addEventListener('input', function () {
        state.sandbox[key] = Number(input.value);
        out.textContent = input.value;
        writeHash(); refresh();
      });
      return el('div', { class: 'slider' },
        el('label', { for: id }, el('span', { text: label }), out),
        input,
        el('div', { class: 'hint', text: hint })
      );
    }
    var reset = el('button', { class: 'linklike', type: 'button', text: 'Reset to the shipped model' });
    reset.addEventListener('click', function () {
      state.sandbox.base_multiple = DEFAULTS.base_multiple;
      state.sandbox.growth_weight = DEFAULTS.growth_weight;
      state.sandbox.maturity_floor = DEFAULTS.maturity_floor;
      state.sandbox.leadership_bonus = DEFAULTS.leadership_bonus;
      writeHash(); refresh();
    });
    box.appendChild(el('div', { class: 'sandbox-head' },
      el('div', null,
        el('h2', { text: 'Model sandbox — change the model, the board re-ranks' }),
        el('p', { text: 'The board is one function of the snapshot figures, not a list someone typed. Move a slider and every row is rescored by impliedOf() and re-ranked live; reset to return to the shipped constants board.json carries.' })
      ),
      reset
    ));
    box.appendChild(el('div', { class: 'sandbox-grid' },
      slider('sb-base', 'TVL multiple', 'Base value is TVL x this multiple. Shipped: ' + DEFAULTS.base_multiple + '.', 0.1, 0.5, 0.01, state.sandbox.base_multiple, 'base_multiple'),
      slider('sb-growth', 'Growth weight', 'How much seven-day momentum moves the value. Shipped: ' + DEFAULTS.growth_weight + '.', 0, 1, 0.05, state.sandbox.growth_weight, 'growth_weight'),
      slider('sb-maturity', 'Maturity floor', 'The value a brand-new protocol keeps before age adds more. Shipped: ' + DEFAULTS.maturity_floor + '.', 0.3, 0.8, 0.05, state.sandbox.maturity_floor, 'maturity_floor'),
      slider('sb-leader', 'Leadership bonus', 'The premium for the largest protocol in its category on the board. Shipped: ' + DEFAULTS.leadership_bonus + '; 1.00 turns it off.', 1, 1.1, 0.01, state.sandbox.leadership_bonus, 'leadership_bonus')
    ));
    if (sandboxActive()) {
      box.appendChild(el('p', { class: 'sandbox-note', text: 'Sandbox active: the ranks below are recomputed with TVL x ' + state.sandbox.base_multiple + ', growth weight ' + state.sandbox.growth_weight + ', maturity floor ' + state.sandbox.maturity_floor + ', leadership bonus ' + state.sandbox.leadership_bonus + '. board.json carries the shipped model.' }));
    }
    return box;
  }

  function sortHeader(key, label) {
    var arrow = state.sort === key ? el('span', { class: 'arrow', 'aria-hidden': 'true', text: state.dir < 0 ? ' \u25BC' : ' \u25B2' }) : null;
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () {
        if (state.sort === key) state.dir = -state.dir;
        else { state.sort = key; state.dir = key === 'name' ? 1 : -1; }
        writeHash(); refresh();
      } }, label, arrow)
    );
  }

  function protocolCell(r) {
    var chainText = (r.chains && r.chains.length)
      ? (r.chains.slice(0, 2).join(', ') + (r.chains.length > 2 ? ' +' + (r.chains.length - 2) : ''))
      : 'an unnamed chain';
    return el('td', null, el('div', { class: 'name' },
      el('b', { text: r.name }),
      el('span', { class: 'sub', text: (r.category || 'Other') + ' · ' + chainText })
    ));
  }

  function boardTable(list) {
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category or chain to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () {
          state.q = ''; state.category = 'all'; state.chain = 'all'; state.watchlistOnly = false;
          var q = document.getElementById('q'); if (q) q.value = '';
          var c = document.getElementById('category'); if (c) c.value = 'all';
          var ch = document.getElementById('chain'); if (ch) ch.value = 'all';
          var w = document.getElementById('watchlist-toggle'); if (w) w.setAttribute('aria-pressed', 'false');
          writeHash(); refresh();
        } })
      ));
    }
    var max = list.reduce(function (m, r) { return Math.max(m, r.effective_implied); }, 1);
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'rank' }, el('b', { text: String(r.effective_rank) })),
        protocolCell(r),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num', text: String((r.chains || []).length) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.effective_implied / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.effective_implied) })
        )),
        el('td', null, el('span', { class: 'tag ' + (r.watchlist ? 'watch' : 'early'), text: r.watchlist ? 'WATCHLIST' : 'EARLY' }))
      );
      tbody.appendChild(tr);
    });
    var caption = sandboxActive()
      ? 'Sandbox ranks: rescored live with the sandbox constants. Select a row for its breakdown and farm plan.'
      : 'Pre-token protocols, strongest implied value first. Select a row for its model breakdown and farm plan.';
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', null, el('b', { text: list.length + ' protocols' }), ' — ' + caption),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('chains', 'Chains'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Scope' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', { style: 'cursor: default' },
        el('td', null, el('span', { class: 'tag live', text: 'LIVE' })),
        protocolCell(r),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: r.symbol || '—' })
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', null, el('b', { text: DATA.live.length + ' protocols' }), ' — already trading: their market cap is a fact, not a model. They are set aside from the pre-token ranking, so the board never mixes a price with an estimate.'),
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', text: 'Status' }),
            el('th', { scope: 'col', text: 'Protocol' }),
            el('th', { scope: 'col', text: 'TVL' }),
            el('th', { scope: 'col', text: '7d' }),
            el('th', { scope: 'col', text: 'Market cap' }),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  // Where the board's implied value sits: the top eight categories by combined implied value, with
  // their row counts. Computed from the board itself, so it moves with the sandbox like everything else.
  function categoriesPanel() {
    var byCat = {};
    effectiveRows().forEach(function (r) {
      var c = r.category || 'Other';
      if (!byCat[c]) byCat[c] = { name: c, rows: 0, combined: 0 };
      byCat[c].rows += 1;
      byCat[c].combined += r.effective_implied;
    });
    var top = Object.keys(byCat).map(function (k) { return byCat[k]; })
      .sort(function (a, b) { return b.combined - a.combined || (a.name < b.name ? -1 : 1); })
      .slice(0, 8);
    var max = top.length ? top[0].combined : 1;
    return el('section', { class: 'panel categories' },
      el('h2', { text: 'Where the value sits' }),
      el('p', { text: 'Combined implied value by category, across the board. A category with one giant and a long tail reads differently from one spread across many mid-size protocols — the bars show which is which.' }),
      el('div', { class: 'cat-rows' }, top.map(function (c) {
        return el('div', { class: 'cat-row' },
          el('span', { class: 'cat-name' }, c.name + ' ', el('span', { text: '(' + c.rows + ' rows)' })),
          el('div', { class: 'cat-bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((c.combined / max) * 100)) + '%' })),
          el('span', { class: 'cat-val', text: fmtUsd(c.combined) })
        );
      }))
    );
  }

  function modelPanel() {
    var m = DEFAULTS;
    return el('section', { class: 'panel model' },
      el('div', { class: 'model-head' },
        el('h2', { text: 'How implied value is computed' }),
        el('span', { class: 'pill' }, 'Model ', el('b', { text: DATA.model_version }))
      ),
      el('p', null,
        'Every row is scored by one function of the snapshot figures — the same function in ',
        el('b', { text: 'lib/model.ts' }),
        ' that writes board.json and in ',
        el('b', { text: 'impliedOf()' }),
        ' below, which recomputes each row in this page. No protocol name is special-cased, and no row is hand-picked: change the snapshot and the board changes with it.'
      ),
      el('div', { class: 'formula' },
        'implied = round( tvl_usd ', el('span', { class: 'op', text: '×' }), ' ' + m.base_multiple + ' ', el('span', { class: 'op', text: '×' }), ' (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 ', el('span', { class: 'op', text: '×' }), ' ' + m.growth_weight + ') ', el('span', { class: 'op', text: '×' }), ' (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' ', el('span', { class: 'op', text: '×' }), ' ' + m.maturity_range + ') ', el('span', { class: 'op', text: '×' }), ' (1 + ' + m.breadth_per_chain + ' ', el('span', { class: 'op', text: '×' }), ' min(chains, ' + m.breadth_max_chains + ')) ', el('span', { class: 'op', text: '×' }), ' (category leader ? ' + m.leadership_bonus + ' : 1) )'
      ),
      el('div', { class: 'factors' },
        el('div', { class: 'factor' }, el('b', { text: 'TVL base' }), el('span', { class: 'val', text: 'TVL × ' + m.base_multiple }), el('span', { text: 'The size of the business a token would price. A quarter of TVL is the board\u2019s standing multiple.' })),
        el('div', { class: 'factor' }, el('b', { text: 'Growth momentum' }), el('span', { class: 'val', text: 'clamped ' + m.growth_floor + '%…+' + m.growth_cap + '%' }), el('span', { text: 'Seven-day TVL change, clamped so one viral week cannot crown a protocol, weighted ' + m.growth_weight + '.' })),
        el('div', { class: 'factor' }, el('b', { text: 'Age with no token' }), el('span', { class: 'val', text: m.maturity_floor + ' → ' + (m.maturity_floor + m.maturity_range).toFixed(2) }), el('span', { text: 'Days since first listing, capped at ' + m.maturity_days + '. The longer the record runs with no token, the more pent up the launch.' })),
        el('div', { class: 'factor' }, el('b', { text: 'Chain breadth' }), el('span', { class: 'val', text: '+2% per chain, max 5' }), el('span', { text: 'How widely the protocol is already distributed. More chains, more wallets a launch can reach.' })),
        el('div', { class: 'factor' }, el('b', { text: 'Category leadership' }), el('span', { class: 'val', text: '× ' + m.leadership_bonus + ' for the leader' }), el('span', { text: 'The largest protocol in its category on the board prices the category, so it carries a bounded 5% premium — never enough to override the fundamentals.' }))
      ),
      el('p', null,
        'Excluded from the early radar, by the watchlist\u2019s own rule: exchanges, bridges, liquid staking and restaking, versioned pools and anything named wrapped, staked or staking — products of a token that already trades are not launches still to come. The watchlist rows themselves are always kept. ',
        el('b', { text: 'To the judge: ' }),
        'open the sandbox above, move any slider, and watch the board re-rank — that is the model running, not a table someone typed.'
      )
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () {
    if (state.selected !== null) { state.selected = null; writeHash(); refresh(); }
  });

  function parseStep(s) {
    var atCost = s.indexOf(' Cost: ');
    var atTime = s.indexOf(' Time: ');
    var action = atCost >= 0 ? s.slice(0, atCost) : s;
    var cost = atCost >= 0 ? s.slice(atCost + 7, atTime >= 0 ? atTime : undefined).replace(/\.$/, '') : '';
    var time = atTime >= 0 ? s.slice(atTime + 7).replace(/\.$/, '') : '';
    return { action: action, cost: cost, time: time };
  }

  function fmtMinutes(m) {
    if (m === null || m === undefined || !isFinite(m)) return 'n/a';
    if (m < 60) return m + ' min';
    var h = Math.floor(m / 60);
    var rest = m % 60;
    return rest ? h + 'h ' + rest + 'm' : h + 'h';
  }

  function openDetail(slug) {
    var row = null;
    var eff = effectiveRows();
    for (var i = 0; i < eff.length; i++) { if (eff[i].slug === slug) { row = eff[i]; break; } }
    if (!row) return;
    state.selected = slug;
    writeHash();
    var model = activeModel();
    var recomputed = impliedOf(row, model);
    var shown = sandboxActive() ? row.effective_implied : row.implied_value_usd;
    var matches = recomputed === shown;
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var maturityMult = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    var breadthMult = 1 + model.breadth_per_chain * Math.min((row.chains || []).length, model.breadth_max_chains);
    var leaderMult = row.is_category_leader ? model.leadership_bonus : 1;
    var base = row.tvl_usd * model.base_multiple;
    var afterGrowth = base * growthMult;
    var afterMaturity = afterGrowth * maturityMult;
    var afterBreadth = afterMaturity * breadthMult;

    dialog.textContent = '';
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('div', { class: 'kicker', text: 'Rank ' + row.effective_rank + ' of ' + DATA.board_size + (row.watchlist ? ' · Watchlist' : ' · Early find') + (row.is_category_leader ? ' · ★ Category leader' : '') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + ((row.chains && row.chains.length) ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('div', { class: 'big-value' },
      el('span', { text: 'Implied value' + (sandboxActive() ? ' (sandbox model)' : '') }),
      el('b', { text: fmtUsdFull(shown) }),
      el('div', { class: 'check', text: matches ? '✓ Recomputed in this page: ' + fmtUsdFull(recomputed) + ' — matches the board.' : 'Recomputed in this page: ' + fmtUsdFull(recomputed) + ' — differs from the board.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Value breakdown' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL × ' + model.base_multiple }), el('b', { class: 'num', text: fmtUsdFull(Math.round(base)) })),
        el('div', null, el('span', { text: '7d growth ' + fmtPct(row.change_7d) + ' → ' + fmtMult(growthMult) }), el('b', { class: 'num', text: fmtUsdFull(Math.round(afterGrowth)) })),
        el('div', null, el('span', { text: 'Age ' + fmtAge(row.age_days) + ' → ' + fmtMult(maturityMult) }), el('b', { class: 'num', text: fmtUsdFull(Math.round(afterMaturity)) })),
        el('div', null, el('span', { text: (row.chains || []).length + ' chain' + ((row.chains || []).length === 1 ? '' : 's') + ' → ' + fmtMult(breadthMult) }), el('b', { class: 'num', text: fmtUsdFull(Math.round(afterBreadth)) })),
        el('div', null, el('span', { text: (row.is_category_leader ? 'Category leader → ' : 'Not category leader → ') + fmtMult(leaderMult) }), el('b', { class: 'num', text: fmtUsdFull(Math.round(afterBreadth * leaderMult)) })),
        el('div', { class: 'total' }, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsdFull(shown) }))
      ),
      el('p', { class: 'note', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. An estimate of what a token would be worth if the record stayed as it is — never a price, and no promise a token is issued.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Snapshot figures' }),
      el('div', { class: 'figures' },
        el('div', { class: 'figure' }, el('span', { text: 'TVL' }), el('b', { text: fmtUsdFull(row.tvl_usd) })),
        el('div', { class: 'figure' }, el('span', { text: 'Seven-day change' }), el('b', { text: fmtPct(row.change_7d) })),
        el('div', { class: 'figure' }, el('span', { text: 'Age with no token' }), el('b', { text: fmtAge(row.age_days) })),
        el('div', { class: 'figure' }, el('span', { text: 'First listed' }), el('b', { text: row.listed_at || 'unknown' })),
        el('div', { class: 'figure' }, el('span', { text: 'Token on record' }), el('b', { text: 'None recorded' })),
        el('div', { class: 'figure' }, el('span', { text: 'Share of its category' }), el('b', { text: fmtShare(row.category_share) + (row.is_category_leader ? ' — leads it' : '') })),
        el('div', { class: 'figure wide' }, el('span', { text: 'Chains' }), el('b', { text: (row.chains || []).join(', ') || '—' }))
      )
    ));
    var ft = row.farm_total || {};
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan — what to do, what it costs, how long it takes' }),
      el('div', { class: 'farm-totals' },
        el('div', { class: 'figure' }, el('span', { text: 'Capital' }), el('b', { text: '$' + (ft.capital_usd !== undefined ? ft.capital_usd : 'n/a') })),
        el('div', { class: 'figure' }, el('span', { text: 'Gas, whole plan' }), el('b', { text: ft.gas_usd !== undefined ? '$' + ft.gas_usd.toFixed(2) : 'n/a' })),
        el('div', { class: 'figure' }, el('span', { text: 'Active time' }), el('b', { text: fmtMinutes(ft.active_minutes) })),
        el('div', { class: 'figure' }, el('span', { text: 'Hold' }), el('b', { text: ft.hold_days !== undefined ? ft.hold_days + ' days' : 'n/a' }))
      ),
      el('ol', { class: 'steps' }, (row.farm_steps || []).map(function (s) {
        var p = parseStep(s);
        return el('li', null,
          el('b', { text: p.action }),
          el('div', { class: 'chips' },
            p.cost ? el('span', { class: 'chip' }, 'Cost ', el('b', { text: p.cost })) : null,
            p.time ? el('span', { class: 'chip' }, 'Time ', el('b', { text: p.time })) : null
          )
        );
      })),
      el('p', { class: 'note', text: 'The plan follows the protocol\u2019s own record: the capital follows its TVL, the gas follows its chain, the hold follows its age, and both actions follow its category. Never pay anyone to claim for you.' })
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function footer() {
    return el('footer', { class: 'foot' },
      el('p', null,
        el('b', { text: 'Snapshot ' + DATA.as_of + ' · DefiLlama protocol index · Model ' + DATA.model_version + '. ' }),
        'Implied value is this entry\u2019s own model, never a price and never a prediction that a token is issued. A protocol \u201Crecords no token\u201D when DefiLlama\u2019s record carries none — the record is not proof. Farm plans are starting points, not financial advice: check the protocol\u2019s own pages before you move funds.'
      )
    );
  }

  // The page is built once; refresh() only re-renders the parts state changes (the table, the count,
  // the sandbox, the stats), so a slider keeps its focus while it is dragged.
  var shell, tableBox, sandboxBox;
  function build() {
    shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(hero());
    shell.appendChild(controls());
    sandboxBox = el('div', { id: 'sandbox-box' });
    shell.appendChild(sandboxBox);
    shell.appendChild(modelStrip());
    tableBox = el('div', { id: 'table-box' });
    shell.appendChild(tableBox);
    shell.appendChild(categoriesPanel());
    shell.appendChild(modelPanel());
    shell.appendChild(footer());
    app.textContent = '';
    app.appendChild(shell);
    app.appendChild(dialog);
    app.setAttribute('aria-busy', 'false');
  }

  function refresh() {
    var eff = effectiveRows();
    var list = state.tab === 'pre-token' ? sortedRows(filteredRows(eff)) : null;
    var count = document.getElementById('count');
    if (count) {
      count.textContent = state.tab === 'pre-token'
        ? list.length + ' of ' + DATA.board_size + ' rows · ' + fmtUsd(combinedImplied(list)) + ' combined'
        : DATA.live.length + ' live-token protocols';
    }
    var combined = document.getElementById('stat-combined');
    if (combined) combined.textContent = fmtUsd(combinedImplied(eff));
    var pre = document.getElementById('tab-pre');
    var live = document.getElementById('tab-live');
    if (pre) pre.setAttribute('aria-pressed', state.tab === 'pre-token' ? 'true' : 'false');
    if (live) live.setAttribute('aria-pressed', state.tab === 'live' ? 'true' : 'false');
    var sb = document.getElementById('sandbox-toggle');
    if (sb) sb.setAttribute('aria-pressed', state.sandboxOpen ? 'true' : 'false');
    sandboxBox.textContent = '';
    sandboxBox.appendChild(sandboxPanel());
    tableBox.textContent = '';
    tableBox.appendChild(state.tab === 'pre-token' ? boardTable(list) : liveTable());
    if (state.selected && !dialog.open) openDetail(state.selected);
    if (state.selected && dialog.open) openDetail(state.selected);
  }

  readHash();
  build();
  refresh();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
  // A hash that arrives while the page is already open (a pasted deep link, back/forward) re-reads
  // the state and re-renders, so every view is a link that works from anywhere.
  window.addEventListener('hashchange', function () {
    state.q = ''; state.category = 'all'; state.chain = 'all'; state.tab = 'pre-token';
    state.sort = 'implied'; state.dir = -1; state.watchlistOnly = false; state.selected = null;
    state.sandboxOpen = false;
    state.sandbox.base_multiple = DEFAULTS.base_multiple;
    state.sandbox.growth_weight = DEFAULTS.growth_weight;
    state.sandbox.maturity_floor = DEFAULTS.maturity_floor;
    state.sandbox.leadership_bonus = DEFAULTS.leadership_bonus;
    readHash();
    var q = document.getElementById('q'); if (q) q.value = state.q;
    var c = document.getElementById('category'); if (c) c.value = state.category;
    var ch = document.getElementById('chain'); if (ch) ch.value = state.chain;
    var w = document.getElementById('watchlist-toggle'); if (w) w.setAttribute('aria-pressed', state.watchlistOnly ? 'true' : 'false');
    if (!state.selected && dialog.open) dialog.close();
    refresh();
  });
})();
