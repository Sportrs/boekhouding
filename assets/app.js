/* =====================================================================
 *  BV BOEKHOUDING — frontend (vanilla JS)
 *  Praat met api.php. Same-origin sessie-cookie voor auth.
 * ===================================================================== */
(function () {
  'use strict';

  // ---------------- Helpers ----------------
  const app = document.getElementById('app');
  const toastsEl = document.getElementById('toasts');
  const euroFmt = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 });
  const euro = (n) => euroFmt.format(Number(n) || 0);
  const euro0Fmt = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const euro0 = (n) => euro0Fmt.format(Math.round(Number(n) || 0)); // hele euro's, voor rapporten
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function datumNL(iso) {
    if (!iso) return '';
    const p = String(iso).slice(0, 10).split('-');
    return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : iso;
  }
  function vandaag() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

  async function api(actie, params = {}, method = 'GET') {
    let url = 'api.php?actie=' + encodeURIComponent(actie);
    const opts = { method, credentials: 'same-origin', headers: {} };
    if (method === 'GET') {
      for (const k in params) if (params[k] != null && params[k] !== '') url += '&' + k + '=' + encodeURIComponent(params[k]);
    } else {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(params);
    }
    const res = await fetch(url, opts);
    let data = null;
    const txt = await res.text();
    if (txt) { try { data = JSON.parse(txt); } catch { data = txt; } }
    if (!res.ok) {
      if (res.status === 401) { state.authed = false; renderLogin(); }
      const e = new Error((data && data.fout) || 'Fout ' + res.status);
      e.status = res.status;
      throw e;
    }
    return data;
  }

  function toast(msg, type = 'success') {
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.textContent = msg;
    toastsEl.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }

  // ---------------- State ----------------
  const state = { authed: false, settings: null, accounts: [] };

  async function loadSettings() { state.settings = await api('instellingen'); }
  async function loadAccounts() { state.accounts = await api('rekeningen'); }

  // ---------------- Boot ----------------
  async function boot() {
    try {
      const me = await api('me');
      state.authed = !!me.authenticated;
    } catch { state.authed = false; }
    if (state.authed) {
      await loadSettings().catch(() => {});
      renderShell();
    } else {
      renderLogin();
    }
  }

  // ---------------- Login ----------------
  function renderLogin() {
    app.innerHTML = `
      <div class="login-wrap"><form class="login-card" id="loginForm">
        <h1 style="margin:0;font-size:18px;font-weight:600">BV Boekhouding</h1>
        <p class="mut" style="margin:4px 0 0;font-size:14px">Log in om verder te gaan.</p>
        <label class="field" style="margin-top:24px"><span>Wachtwoord</span>
          <input type="password" id="ww" autofocus /></label>
        <div class="dan" id="loginErr" style="margin-top:12px;font-size:14px"></div>
        <button class="btn btn-brand" style="width:100%;margin-top:20px" type="submit">Inloggen</button>
      </form></div>`;
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const errEl = document.getElementById('loginErr');
      errEl.textContent = '';
      try {
        await api('login', { wachtwoord: document.getElementById('ww').value }, 'POST');
        state.authed = true;
        await loadSettings().catch(() => {});
        location.hash = '#/';
        renderShell();
      } catch (err) { errEl.textContent = err.message; }
    });
  }

  // ---------------- Shell + routing ----------------
  const ROUTES = [
    { hash: '#/', label: 'Dashboard', ic: '▤', page: pageDashboard },
    { hash: '#/facturen', label: 'Facturen invoeren', ic: '＋', page: pageFacturen },
    { hash: '#/journaal', label: 'Journaal', ic: '≣', page: pageJournaal },
    { hash: '#/btw', label: 'BTW-aangifte', ic: '％', page: pageBTW },
    { hash: '#/jaarverslag', label: 'Jaarverslag', ic: '▦', page: pageJaarverslag },
    { hash: '#/import', label: 'Import', ic: '⇪', page: pageImport },
    { hash: '#/instellingen', label: 'Instellingen', ic: '⚙', page: pageInstellingen },
  ];

  function renderShell() {
    const s = state.settings || {};
    app.innerHTML = `
      <div class="app">
        <aside class="sidebar">
          <div class="sidebar-head">
            <div class="naam">${esc(s.bedrijfsnaam || 'BV Boekhouding')}</div>
            <div class="jaar">Boekjaar ${esc(s.boekjaar || '')}</div>
          </div>
          <nav class="nav" id="nav">
            ${ROUTES.map((r) => `<a data-hash="${r.hash}"><span class="ic">${r.ic}</span>${r.label}</a>`).join('')}
          </nav>
          <div class="sidebar-foot"><button id="logout">⎋ Uitloggen</button></div>
        </aside>
        <main class="main"><div class="container" id="view"></div></main>
      </div>`;
    document.getElementById('nav').addEventListener('click', (e) => {
      const a = e.target.closest('a[data-hash]');
      if (a) { location.hash = a.dataset.hash; }
    });
    document.getElementById('logout').addEventListener('click', async () => {
      await api('logout', {}, 'POST').catch(() => {});
      state.authed = false;
      renderLogin();
    });
    renderRoute();
  }

  function renderRoute() {
    if (!state.authed) return;
    const hash = location.hash || '#/';
    const route = ROUTES.find((r) => r.hash === hash) || ROUTES[0];
    document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.hash === route.hash));
    const view = document.getElementById('view');
    if (view) { view.innerHTML = '<div class="mut">Laden…</div>'; route.page(view); }
  }

  window.addEventListener('hashchange', () => { if (state.authed) renderRoute(); });

  // ---------------- Pagina: Dashboard ----------------
  async function pageDashboard(view) {
    let d;
    try { d = await api('dashboard'); } catch (e) { view.innerHTML = `<div class="dan">${esc(e.message)}</div>`; return; }
    const q = d.huidigKwartaal;
    const teBetalen = q.saldo >= 0;
    const rows = d.recenteBoekingen.length
      ? d.recenteBoekingen.map((t) => {
          const bedrag = t.regels.reduce((s, r) => s + Number(r.debet), 0);
          return `<tr><td class="num" style="text-align:left">${datumNL(t.datum)}</td><td>${esc(t.omschrijving)}</td><td class="num" style="color:var(--ink)">${euro(bedrag)}</td></tr>`;
        }).join('')
      : `<tr><td colspan="3" class="empty">Nog geen boekingen.</td></tr>`;
    view.innerHTML = `
      ${pageHead('Dashboard', 'Boekjaar ' + esc(d.boekjaar))}
      <div class="grid grid-4">
        ${stat('Banksaldo', euro(d.banksaldo), 'brand')}
        ${stat('Omzet boekjaar', euro(d.omzetBoekjaar), 'suc')}
        ${stat('Kosten boekjaar', euro(d.kostenBoekjaar), 'warn')}
        ${stat('Resultaat boekjaar', euro(d.resultaatBoekjaar), d.resultaatBoekjaar >= 0 ? 'suc' : 'dan')}
      </div>
      <div class="grid grid-3" style="margin-top:24px">
        <div class="card">
          <div class="card-head">Recente boekingen</div>
          <table><thead><tr><th>Datum</th><th>Omschrijving</th><th class="r">Bedrag</th></tr></thead><tbody>${rows}</tbody></table>
        </div>
        <div class="card p5">
          <div class="mut" style="font-size:14px;font-weight:500;color:var(--inkdim)">BTW Q${q.kwartaal} ${q.jaar}</div>
          <div class="num ${teBetalen ? 'dan' : 'suc'}" style="font-size:24px;font-weight:600;margin-top:12px;text-align:left">${euro(Math.abs(q.saldo))}</div>
          <div class="mut" style="font-size:14px;margin-top:4px">${teBetalen ? 'Te betalen' : 'Te ontvangen'}</div>
          <button class="btn btn-ghost" style="margin-top:16px" onclick="location.hash='#/btw'">Naar aangifte →</button>
        </div>
      </div>`;
  }

  // ---------------- Pagina: Facturen ----------------
  async function pageFacturen(view) {
    try { await loadAccounts(); } catch (e) { view.innerHTML = `<div class="dan">${esc(e.message)}</div>`; return; }
    view.innerHTML = `
      ${pageHead('Facturen invoeren', 'Upload een PDF om automatisch uit te lezen, of voer handmatig in.',
        `<button class="btn btn-ghost" id="handmatig">Handmatig invoeren</button>`)}
      <div class="card dropzone" id="drop">
        <div class="big">📄</div>
        <div id="dropText"><div style="color:var(--ink)">Sleep een PDF-factuur hierheen of klik om te kiezen</div>
        <div class="mut" style="font-size:14px;margin-top:4px">De gegevens worden automatisch voorinvuld.</div></div>
        <input type="file" id="file" accept="application/pdf" style="display:none" />
      </div>`;
    const drop = document.getElementById('drop');
    const fileInput = document.getElementById('file');
    const dropText = document.getElementById('dropText');
    document.getElementById('handmatig').addEventListener('click', () => openBoeking(null, 'inkoop'));
    drop.addEventListener('click', () => fileInput.click());
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); if (e.dataTransfer.files[0]) verwerkPdf(e.dataTransfer.files[0]); });
    fileInput.addEventListener('change', () => { if (fileInput.files[0]) verwerkPdf(fileInput.files[0]); });

    function fileToB64(file) {
      return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(',')[1] || '');
        r.onerror = reject;
        r.readAsDataURL(file);
      });
    }
    async function verwerkPdf(file) {
      if (file.type !== 'application/pdf') return toast('Alleen PDF-bestanden worden ondersteund', 'error');
      dropText.innerHTML = '<div class="brand">Factuur wordt uitgelezen door de AI…</div>';
      try {
        const b64 = await fileToB64(file);
        const data = await api('factuur_lezen', { pdf: b64 }, 'POST');
        toast('Factuur uitgelezen ✓');
        openBoeking(data, 'inkoop');
      } catch (e) { toast(e.message, 'error'); }
      finally { dropText.innerHTML = '<div style="color:var(--ink)">Sleep een PDF-factuur hierheen of klik om te kiezen</div><div class="mut" style="font-size:14px;margin-top:4px">De gegevens worden automatisch voorinvuld.</div>'; fileInput.value = ''; }
    }
  }

  // ---------------- Pagina: Journaal ----------------
  async function pageJournaal(view) {
    const st = { from: '', to: '' };
    async function load() {
      let tx;
      try { tx = await api('transacties', { from: st.from, to: st.to }); } catch (e) { return `<div class="dan">${esc(e.message)}</div>`; }
      const rows = tx.length ? tx.map((t) => {
        const incl = t.regels.reduce((s, r) => s + Number(r.debet), 0);
        return `<tr>
          <td class="num" style="text-align:left">${datumNL(t.datum)}</td>
          <td class="mut">${esc(t.factuurNummer || '—')}</td>
          <td>${esc(t.omschrijving)}</td>
          <td class="num">${t.btwGrondslag != null ? euro(t.btwGrondslag) : '—'}</td>
          <td class="num">${t.btwBedrag != null ? euro(t.btwBedrag) : '—'}</td>
          <td class="num" style="color:var(--ink)">${euro(incl)}</td>
          <td class="r"><button class="linkbtn del" data-del="${t.id}" title="Verwijderen">🗑</button></td>
        </tr>`;
      }).join('') : `<tr><td colspan="7" class="empty">Geen boekingen gevonden.</td></tr>`;
      return `<div class="card"><table>
        <thead><tr><th>Datum</th><th>Factuurnr.</th><th>Omschrijving</th><th class="r">Excl. BTW</th><th class="r">BTW</th><th class="r">Incl. BTW</th><th></th></tr></thead>
        <tbody id="jrows">${rows}</tbody></table></div>`;
    }
    async function rerender() {
      const filter = `<div class="page-actions">
        <input type="date" id="from" value="${st.from}" style="width:auto" />
        <span class="mut">t/m</span>
        <input type="date" id="to" value="${st.to}" style="width:auto" />
        ${st.from || st.to ? '<button class="linkbtn" id="wis">wissen</button>' : ''}
      </div>`;
      view.innerHTML = pageHead('Journaal', 'Alle boekingen, nieuwste eerst.', filter) + (await load());
      document.getElementById('from').addEventListener('change', (e) => { st.from = e.target.value; rerender(); });
      document.getElementById('to').addEventListener('change', (e) => { st.to = e.target.value; rerender(); });
      const wis = document.getElementById('wis');
      if (wis) wis.addEventListener('click', () => { st.from = ''; st.to = ''; rerender(); });
      view.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
        if (!confirm('Deze boeking verwijderen?')) return;
        try { await api('transactie_verwijder', { id: Number(b.dataset.del) }, 'POST'); toast('Boeking verwijderd'); rerender(); }
        catch (e) { toast(e.message, 'error'); }
      }));
    }
    rerender();
  }

  // ---------------- Pagina: BTW ----------------
  async function pageBTW(view) {
    let jaar = Number((state.settings && state.settings.boekjaar) || new Date().getFullYear());
    let kwartaal = 1;
    async function load() {
      let d;
      try { d = await api('btw', { quarter: kwartaal, year: jaar }); } catch (e) { return `<div class="dan">${esc(e.message)}</div>`; }
      const teBetalen = d.saldo >= 0;
      const rij = (label, g, b) => `<tr><td>${label}</td><td class="num mut">${g != null ? euro(g) : ''}</td><td class="num" style="color:var(--ink)">${euro(b)}</td></tr>`;
      const txRows = d.transacties.length ? d.transacties.map((t) => `<tr>
          <td class="num" style="text-align:left">${datumNL(t.datum)}</td><td>${esc(t.omschrijving)}</td>
          <td class="mut" style="font-size:12px">${t.btwRichting === 'afdracht' ? 'afdracht' : 'vordering'} ${esc(t.btwCode)}%</td>
          <td class="num" style="color:var(--ink)">${euro(t.btwBedrag || 0)}</td></tr>`).join('')
        : `<tr><td colspan="4" class="empty">Geen boekingen.</td></tr>`;
      return `<div class="grid grid-2">
        <div class="card">
          <div class="card-head">Rubrieken (${datumNL(d.from)} t/m ${datumNL(d.to)})</div>
          <table><thead><tr><th>Rubriek</th><th class="r">Grondslag</th><th class="r">BTW</th></tr></thead><tbody>
            ${rij('1a — Omzet hoog (21%)', d.rubriek1a.grondslag, d.rubriek1a.btw)}
            ${rij('1b — Omzet laag (9%)', d.rubriek1b.grondslag, d.rubriek1b.btw)}
            ${rij('1c — Overige tarieven', d.rubriek1c.grondslag, d.rubriek1c.btw)}
            ${rij('1d — Privégebruik', d.rubriek1d.grondslag, d.rubriek1d.btw)}
            <tr style="background:rgba(38,52,73,.4)"><td style="font-weight:500;color:var(--inkdim)">Verschuldigde BTW</td><td></td><td class="num" style="font-weight:500;color:var(--ink)">${euro(d.verschuldigd)}</td></tr>
            ${rij('5b — Voorbelasting', null, d.rubriek5b)}
          </tbody></table>
        </div>
        <div>
          <div class="card p5">
            <div style="font-size:14px;font-weight:500;color:var(--inkdim)">Saldo aangifte</div>
            <div class="num ${teBetalen ? 'dan' : 'suc'}" style="font-size:30px;font-weight:700;margin-top:8px;text-align:left">${euro(Math.abs(d.saldo))}</div>
            <div class="mut" style="font-size:14px;margin-top:4px">${teBetalen ? 'Te betalen aan de Belastingdienst' : 'Te ontvangen van de Belastingdienst'}</div>
          </div>
          <div class="card" style="margin-top:24px">
            <div class="card-head">Boekingen met BTW in dit kwartaal</div>
            <table><tbody>${txRows}</tbody></table>
          </div>
        </div>
      </div>`;
    }
    async function rerender() {
      const tabs = `<div class="tabs page-actions">${[1, 2, 3, 4].map((q) => `<button data-q="${q}" class="${q === kwartaal ? 'active' : ''}">Q${q}</button>`).join('')}</div>`;
      view.innerHTML = pageHead('BTW-aangifte', `Omzetbelasting per kwartaal — ${jaar}`, tabs) + (await load());
      view.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => { kwartaal = Number(b.dataset.q); rerender(); }));
    }
    rerender();
  }

  // ---------------- Pagina: Jaarverslag ----------------
  async function pageJaarverslag(view) {
    let s, balans, wenv, jaarcijfers;
    try {
      s = state.settings || (await api('instellingen'));
      [balans, wenv, jaarcijfers] = await Promise.all([api('balans'), api('wenv'), api('jaarcijfers')]);
    } catch (e) { view.innerHTML = `<div class="dan">${esc(e.message)}</div>`; return; }

    const lijst = (arr) => arr.map((p) => { const nm = `${esc(p.nummer)} — ${esc(p.naam)}`; return `<tr><td class="naam" title="${nm}">${nm}</td><td class="num" style="color:var(--ink)">${euro0(p.saldo)}</td></tr>`; }).join('');

    let vergelijkendHtml = '';
    if (jaarcijfers && jaarcijfers.length) {
      const jaren = [...new Set(jaarcijfers.map((r) => Number(r.jaar)))].sort((a, b) => b - a);
      const pivot = new Map();
      jaarcijfers.forEach((r) => {
        const k = r.soort + '|' + r.sectie + '|' + r.omschrijving;
        if (!pivot.has(k)) pivot.set(k, { soort: r.soort, sectie: r.sectie, oms: r.omschrijving, vals: {} });
        pivot.get(k).vals[Number(r.jaar)] = Number(r.bedrag);
      });
      const rowsFor = (soort, sectie) => [...pivot.values()].filter((p) => p.soort === soort && p.sectie === sectie)
        .map((p) => `<tr><td class="naam" title="${esc(p.oms)}">${esc(p.oms)}</td>${jaren.map((j) => `<td class="num jaar">${euro0(p.vals[j] || 0)}</td>`).join('')}</tr>`).join('');
      const th = `<tr><th class="post">Post</th>${jaren.map((j) => `<th class="num jaar">${j}</th>`).join('')}</tr>`;
      const blok = (titel, soort, secties) => `<div><h4>${titel}</h4><table class="jl"><thead>${th}</thead><tbody>${secties.map((s) => rowsFor(soort, s)).join('')}</tbody></table></div>`;
      vergelijkendHtml = `<div class="card" style="margin-bottom:24px">
        <div class="card-head">Vergelijkende cijfers uit geïmporteerde jaarrekening(en)</div>
        <div class="split">
          ${blok('Balans', 'balans', ['activa', 'passiva'])}
          ${blok('Winst &amp; verlies', 'wenv', ['opbrengsten', 'kosten'])}
        </div></div>`;
    }

    view.innerHTML = `
      ${pageHead('Jaarverslag', `${esc(s.bedrijfsnaam || 'BV')} — boekjaar ${esc(s.boekjaar)}`, `<button class="btn btn-ghost no-print" id="print">🖨 Printen</button>`)}
      <div class="card" style="margin-bottom:24px">
        <div class="card-head"><span>Balans per ${datumNL(balans.datum)}</span><span class="${balans.inBalans ? 'suc' : 'dan'}" style="font-size:12px">${balans.inBalans ? '✓ In balans' : '✗ Niet in balans'}</span></div>
        <div class="split">
          <div><h4>Activa</h4><table class="jl"><tbody>${lijst(balans.activa)}</tbody>
            <tfoot><tr><td class="naam" style="font-weight:500;color:var(--inkdim)">Totaal activa</td><td class="num">${euro0(balans.totaalActiva)}</td></tr></tfoot></table></div>
          <div><h4>Passiva</h4><table class="jl"><tbody>${lijst(balans.passiva)}
            <tr><td class="naam">Resultaat boekjaar</td><td class="num ${balans.resultaatBoekjaar >= 0 ? 'suc' : 'dan'}">${euro0(balans.resultaatBoekjaar)}</td></tr></tbody>
            <tfoot><tr><td class="naam" style="font-weight:500;color:var(--inkdim)">Totaal passiva</td><td class="num">${euro0(balans.totaalPassiva)}</td></tr></tfoot></table></div>
        </div>
      </div>
      <div class="card" style="margin-bottom:24px">
        <div class="card-head">Winst- &amp; verliesrekening (${datumNL(wenv.from)} t/m ${datumNL(wenv.to)})</div>
        <div class="split">
          <div><h4>Opbrengsten</h4><table class="jl"><tbody>${lijst(wenv.opbrengsten)}</tbody>
            <tfoot><tr><td class="naam" style="font-weight:500;color:var(--inkdim)">Totaal opbrengsten</td><td class="num">${euro0(wenv.totaalOpbrengsten)}</td></tr></tfoot></table></div>
          <div><h4>Kosten</h4><table class="jl"><tbody>${lijst(wenv.kosten)}</tbody>
            <tfoot><tr><td class="naam" style="font-weight:500;color:var(--inkdim)">Totaal kosten</td><td class="num">${euro0(wenv.totaalKosten)}</td></tr></tfoot></table></div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 20px;border-top:1px solid var(--line);background:rgba(38,52,73,.4)">
          <span style="font-weight:500;color:var(--inkdim)">Resultaat boekjaar</span>
          <span class="num ${wenv.resultaat >= 0 ? 'suc' : 'dan'}" style="font-size:18px;font-weight:700">${euro0(wenv.resultaat)}</span>
        </div>
      </div>
      ${vergelijkendHtml}
      <div class="card p5 mut" style="font-size:14px;line-height:1.6">
        Deze rapportage is een interne weergave van de financiële positie van ${esc(s.bedrijfsnaam || 'de vennootschap')} per ${datumNL(balans.datum)}
        en het resultaat over boekjaar ${esc(s.boekjaar)}. Controle: totaal activa (${euro0(balans.totaalActiva)}) is gelijk aan totaal passiva inclusief
        resultaat (${euro0(balans.totaalPassiva)}). Dit betreft geen officieel jaarverslag conform Boek 2 BW.
      </div>`;
    document.getElementById('print').addEventListener('click', () => window.print());
  }

  // ---------------- Pagina: Instellingen ----------------
  async function pageInstellingen(view) {
    let s;
    try { s = await api('instellingen'); await loadAccounts(); } catch (e) { view.innerHTML = `<div class="dan">${esc(e.message)}</div>`; return; }
    state.settings = s;
    const TYPE = { actief: 'Actief', passief: 'Passief', kosten: 'Kosten', opbrengsten: 'Opbrengsten' };
    const rekRows = state.accounts.map((a) => `<tr>
        <td class="num" style="text-align:left">${esc(a.nummer)}</td>
        <td>${esc(a.naam)}${a.systeem ? '<span class="badge">systeem</span>' : ''}</td>
        <td class="mut">${TYPE[a.type] || a.type}</td>
        <td class="num">${a.type === 'actief' || a.type === 'passief' ? euro(a.openingSaldo) : '—'}</td>
        <td class="r"><button class="linkbtn" data-edit="${esc(a.nummer)}">bewerken</button>${a.systeem ? '' : ` <button class="linkbtn del" data-del="${esc(a.nummer)}">verwijderen</button>`}</td>
      </tr>`).join('');

    view.innerHTML = `
      ${pageHead('Instellingen')}
      <div class="card p5" style="margin-bottom:24px">
        <h2 style="font-size:14px;font-weight:500;color:var(--inkdim);margin:0 0 16px">Bedrijf</h2>
        <div class="row" style="max-width:520px">
          <label class="field"><span>Bedrijfsnaam</span><input id="bedrijfsnaam" value="${esc(s.bedrijfsnaam)}" /></label>
          <label class="field"><span>Boekjaar</span><input id="boekjaar" value="${esc(s.boekjaar)}" placeholder="2026" /></label>
        </div>
        <button class="btn btn-brand" id="saveBedrijf" style="margin-top:16px">Opslaan</button>
      </div>
      <div class="card p5" style="margin-bottom:24px">
        <h2 style="font-size:14px;font-weight:500;color:var(--inkdim);margin:0 0 4px">Anthropic API-sleutel</h2>
        <p class="mut" style="font-size:12px;margin:0 0 16px">${s.apiKeyFromConfig ? 'Ingesteld via config.php op de server.' : s.apiKeyConfigured ? 'Er is een sleutel opgeslagen. Vul een nieuwe in om te vervangen.' : 'Nog geen sleutel — nodig voor het uitlezen van PDF-facturen.'}</p>
        <div style="display:flex;gap:8px;align-items:flex-end;max-width:520px">
          <label class="field" style="flex:1"><span>Nieuwe sleutel</span><input type="password" id="apiKey" placeholder="sk-ant-…" /></label>
          <button class="btn btn-brand" id="saveKey">Opslaan</button>
        </div>
      </div>
      <div class="card" style="margin-bottom:24px">
        <div class="card-head"><span>Rekeningschema</span><button class="btn btn-brand" id="nieuweRek">+ Nieuwe rekening</button></div>
        <table><thead><tr><th>Nummer</th><th>Naam</th><th>Type</th><th class="r">Beginsaldo</th><th></th></tr></thead><tbody>${rekRows}</tbody></table>
      </div>
      <div class="card p5" style="border-color:rgba(239,68,68,.4)">
        <h2 style="font-size:14px;font-weight:500;color:var(--danger);margin:0 0 4px">Gevaarlijke zone</h2>
        <p class="mut" style="font-size:12px;margin:0 0 16px">Verwijder alle boekingen en niet-systeemrekeningen. Kan niet ongedaan worden gemaakt.</p>
        <button class="btn btn-danger" id="reset">Boekhouding resetten</button>
      </div>`;

    document.getElementById('saveBedrijf').addEventListener('click', async () => {
      try {
        await api('instellingen_opslaan', { bedrijfsnaam: document.getElementById('bedrijfsnaam').value, boekjaar: document.getElementById('boekjaar').value }, 'POST');
        toast('Opgeslagen ✓'); await loadSettings(); renderShell(); location.hash = '#/instellingen';
      } catch (e) { toast(e.message, 'error'); }
    });
    document.getElementById('saveKey').addEventListener('click', async () => {
      const key = document.getElementById('apiKey').value.trim();
      if (!key) return;
      try { await api('apikey_opslaan', { apiKey: key }, 'POST'); toast('API-sleutel opgeslagen ✓'); renderRoute(); }
      catch (e) { toast(e.message, 'error'); }
    });
    document.getElementById('nieuweRek').addEventListener('click', () => openRekening(null));
    view.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => openRekening(state.accounts.find((a) => a.nummer === b.dataset.edit))));
    view.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm(`Rekening ${b.dataset.del} verwijderen?`)) return;
      try { await api('rekening_verwijder', { nummer: b.dataset.del }, 'POST'); toast('Rekening verwijderd'); renderRoute(); }
      catch (e) { toast(e.message, 'error'); }
    }));
    document.getElementById('reset').addEventListener('click', async () => {
      if (prompt('Typ RESET om alle boekingen en niet-systeemrekeningen te verwijderen.') !== 'RESET') return;
      try { await api('reset', { bevestig: 'RESET' }, 'POST'); toast('Boekhouding gereset'); await loadSettings(); renderShell(); location.hash = '#/instellingen'; }
      catch (e) { toast(e.message, 'error'); }
    });
  }

  // ---------------- Pagina: Import (jaarrekening) ----------------
  async function pageImport(view) {
    let data = null; // geëxtraheerde, bewerkbare jaarrekening

    function fileToB64(file) {
      return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(',')[1] || '');
        r.onerror = reject;
        r.readAsDataURL(file);
      });
    }

    const sum = (list, type) =>
      round2(list.filter((p) => p.type === type).reduce((s, p) => s + (Number(p.bedragHuidig) || 0), 0));

    function syncSectie(p) {
      if (p.type === 'actief') p.sectie = 'activa';
      else if (p.type === 'passief') p.sectie = 'passiva';
      else if (p.type === 'kosten') p.sectie = 'kosten';
      else if (p.type === 'opbrengsten') p.sectie = 'opbrengsten';
    }

    function rijHtml(list, i, typeOpties) {
      const p = data[list][i];
      const opts = typeOpties.map((t) => `<option value="${t}" ${p.type === t ? 'selected' : ''}>${t}</option>`).join('');
      return `<tr>
        <td style="padding:4px 8px"><input data-l="${list}" data-i="${i}" data-f="rekeningnummer" value="${esc(p.rekeningnummer)}" style="width:80px" /></td>
        <td style="padding:4px 8px"><input data-l="${list}" data-i="${i}" data-f="omschrijving" value="${esc(p.omschrijving)}" /></td>
        <td style="padding:4px 8px"><select data-l="${list}" data-i="${i}" data-f="type" style="width:120px">${opts}</select></td>
        <td style="padding:4px 8px"><input class="num" data-l="${list}" data-i="${i}" data-f="bedragHuidig" value="${p.bedragHuidig}" style="width:100px" /></td>
        <td style="padding:4px 8px"><input class="num" data-l="${list}" data-i="${i}" data-f="bedragVorig" value="${p.bedragVorig}" style="width:100px" /></td>
        <td style="padding:4px 8px" class="r"><button class="linkbtn del" data-del-l="${list}" data-del-i="${i}">✕</button></td>
      </tr>`;
    }

    function tabel(titel, list, filterType, typeOpties) {
      const idx = data[list].map((p, i) => i).filter((i) => typeOpties.includes(data[list][i].type) && (filterType ? data[list][i].type === filterType : true));
      const rows = idx.map((i) => rijHtml(list, i, typeOpties)).join('') || `<tr><td colspan="6" class="empty">—</td></tr>`;
      return `<div style="margin-bottom:8px"><div class="mut" style="font-size:11px;text-transform:uppercase;letter-spacing:.04em;margin:8px 0 4px">${titel}</div>
        <table><thead><tr><th style="padding:4px 8px">Nr.</th><th style="padding:4px 8px">Omschrijving</th><th style="padding:4px 8px">Type</th><th class="r" style="padding:4px 8px">${data.boekjaar}</th><th class="r" style="padding:4px 8px">${data.vergelijkingsjaar}</th><th></th></tr></thead>
        <tbody>${rows}</tbody></table>
        <button class="linkbtn" data-add="${list}" data-add-type="${typeOpties[0]}" style="margin-top:4px">+ regel</button></div>`;
    }

    function renderPreview() {
      const ta = sum(data.balans, 'actief');
      const tp = sum(data.balans, 'passief');
      const inBalans = Math.abs(ta - tp) < 0.005;
      const to = sum(data.wenv, 'opbrengsten');
      const tk = sum(data.wenv, 'kosten');
      view.innerHTML =
        pageHead('Jaarrekening importeren', `${esc(data.bedrijfsnaam || '')} — boekjaar ${data.boekjaar} (vergelijking ${data.vergelijkingsjaar})`,
          `<button class="btn btn-ghost" id="opnieuw">Ander bestand</button>`) +
        `<div class="card p5" style="margin-bottom:16px">
          <div style="font-size:14px;font-weight:500;color:var(--inkdim);margin-bottom:4px">Balans — beginbalans ${Number(data.boekjaar) + 1} komt uit kolom ${data.boekjaar}</div>
          <p class="mut" style="font-size:12px;margin:0 0 12px">Controleer de posten en bedragen. Balansposten worden aangemaakt als rekening met dit beginsaldo; W&V-posten als kosten-/opbrengstrekening.</p>
          ${tabel('Activa', 'balans', 'actief', ['actief', 'passief'])}
          ${tabel('Passiva', 'balans', 'passief', ['actief', 'passief'])}
          <div style="display:flex;gap:24px;margin-top:8px;font-size:14px">
            <span>Totaal activa: <b class="num">${euro(ta)}</b></span>
            <span>Totaal passiva: <b class="num">${euro(tp)}</b></span>
            <span class="${inBalans ? 'suc' : 'dan'}">${inBalans ? '✓ in balans' : '✗ verschil ' + euro(ta - tp)}</span>
          </div>
        </div>
        <div class="card p5" style="margin-bottom:16px">
          <div style="font-size:14px;font-weight:500;color:var(--inkdim);margin-bottom:8px">Winst- &amp; verliesrekening</div>
          ${tabel('Opbrengsten', 'wenv', 'opbrengsten', ['opbrengsten', 'kosten'])}
          ${tabel('Kosten', 'wenv', 'kosten', ['opbrengsten', 'kosten'])}
          <div style="display:flex;gap:24px;margin-top:8px;font-size:14px">
            <span>Opbrengsten ${data.boekjaar}: <b class="num">${euro(to)}</b></span>
            <span>Kosten ${data.boekjaar}: <b class="num">${euro(tk)}</b></span>
            <span>Resultaat: <b class="num ${to - tk >= 0 ? 'suc' : 'dan'}">${euro(to - tk)}</b></span>
          </div>
        </div>
        <div class="card p5" style="margin-bottom:16px">
          <label class="field" style="max-width:280px"><span>Compensabel verlies (memo)</span><input class="num" id="verlies" value="${data.compensabeleVerliezen || 0}" /></label>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-success" id="importeer">Importeren ✓</button>
          <span class="mut" style="align-self:center;font-size:13px">${inBalans ? '' : 'Let op: balans sluit niet — je kunt toch importeren, maar controleer de posten.'}</span>
        </div>`;

      // Waarde-edits: model bijwerken + totalen live (zonder herteken).
      view.querySelectorAll('input[data-f], select[data-f]').forEach((el) => {
        const upd = () => {
          const p = data[el.dataset.l][Number(el.dataset.i)];
          const f = el.dataset.f;
          if (f === 'bedragHuidig' || f === 'bedragVorig') p[f] = Number(String(el.value).replace(',', '.')) || 0;
          else p[f] = el.value;
          if (f === 'type') { syncSectie(p); renderPreview(); }
          else if (f === 'bedragHuidig') renderPreview();
        };
        el.addEventListener('change', upd);
      });
      view.querySelectorAll('[data-del-l]').forEach((b) => b.addEventListener('click', () => {
        data[b.dataset.delL].splice(Number(b.dataset.delI), 1);
        renderPreview();
      }));
      view.querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', () => {
        const t = b.dataset.addType;
        data[b.dataset.add].push({ sectie: '', omschrijving: '', rekeningnummer: '', type: t, bedragHuidig: 0, bedragVorig: 0 });
        renderPreview();
      }));
      document.getElementById('opnieuw').addEventListener('click', () => { data = null; renderUpload(); });
      document.getElementById('verlies').addEventListener('change', (e) => { data.compensabeleVerliezen = Number(String(e.target.value).replace(',', '.')) || 0; });
      document.getElementById('importeer').addEventListener('click', importeer);
    }

    async function importeer() {
      try {
        const r = await api('jaarrekening_importeren', data, 'POST');
        toast(`Geïmporteerd ✓ — ${r.rekeningen} rekeningen, beginbalans ${Number(r.boekjaar) + 1}`);
        await loadSettings();
        renderShell();
        location.hash = '#/jaarverslag';
      } catch (e) { toast(e.message, 'error'); }
    }

    function renderUpload() {
      view.innerHTML =
        pageHead('Import', 'Lees de jaarrekening van vorig jaar in om beginbalansen, rekeningschema en vergelijkende cijfers over te nemen.') +
        `<div class="card dropzone" id="drop"><div class="big">📑</div>
          <div id="dropText"><div style="color:var(--ink)">Sleep de jaarrekening-PDF hierheen of klik om te kiezen</div>
          <div class="mut" style="font-size:14px;margin-top:4px">De AI leest balans + W&V uit; jij controleert vóór importeren.</div></div>
          <input type="file" id="file" accept="application/pdf" style="display:none" /></div>`;
      const drop = document.getElementById('drop');
      const fi = document.getElementById('file');
      const dt = document.getElementById('dropText');
      drop.addEventListener('click', () => fi.click());
      drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
      drop.addEventListener('dragleave', () => drop.classList.remove('over'));
      drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); if (e.dataTransfer.files[0]) lees(e.dataTransfer.files[0]); });
      fi.addEventListener('change', () => { if (fi.files[0]) lees(fi.files[0]); });
      async function lees(file) {
        if (file.type !== 'application/pdf') return toast('Alleen PDF-bestanden', 'error');
        dt.innerHTML = '<div class="brand">Jaarrekening wordt uitgelezen door de AI… (dit kan ~20 sec duren)</div>';
        try {
          data = await api('jaarrekening_lezen', { pdf: await fileToB64(file) }, 'POST');
          data.balans = data.balans || [];
          data.wenv = data.wenv || [];
          renderPreview();
        } catch (e) { toast(e.message, 'error'); dt.innerHTML = '<div class="dan">' + esc(e.message) + '</div>'; }
      }
    }

    renderUpload();
  }

  // ---------------- Modal: Boeking ----------------
  function openBoeking(initial, initialType) {
    const accounts = state.accounts;
    const kosten = accounts.filter((a) => a.type === 'kosten');
    const omzet = accounts.filter((a) => a.type === 'opbrengsten');
    const banken = accounts.filter((a) => a.type === 'actief' && !a.systeem);
    const naam = (nr) => { const a = accounts.find((x) => x.nummer === nr); return a ? a.naam : nr; };

    const st = {
      type: initialType || 'inkoop',
      datum: (initial && initial.factuurDatum) || vandaag(),
      factuurNummer: (initial && initial.factuurNummer) || '',
      omschrijving: (initial && (initial.omschrijving || initial.leverancier)) || '',
      bedrag: initial && initial.bedragExBTW != null ? String(initial.bedragExBTW) : '',
      pct: initial && initial.btwPercentage != null ? Number(initial.btwPercentage) : 21,
      grootboek: (initial ? kosten[0] : kosten[0]) ? kosten[0].nummer : '',
      betaal: (banken.find((a) => /bank/i.test(a.naam)) || banken[0] || {}).nummer || '',
    };

    const ov = document.createElement('div');
    ov.className = 'overlay';
    document.body.appendChild(ov);
    function close() { ov.remove(); }

    function opties(list, sel) {
      if (!list.length) return '<option value="">— geen rekeningen —</option>';
      return list.map((a) => `<option value="${esc(a.nummer)}" ${a.nummer === sel ? 'selected' : ''}>${esc(a.nummer)} — ${esc(a.naam)}</option>`).join('');
    }
    function preview() {
      const excl = round2(Number(String(st.bedrag).replace(',', '.')) || 0);
      const btw = round2((excl * st.pct) / 100);
      const totaal = round2(excl + btw);
      const rgls = [];
      if (st.type === 'inkoop') {
        rgls.push([st.grootboek, excl, 0]);
        if (btw > 0) rgls.push(['1810', btw, 0]);
        rgls.push([st.betaal, 0, totaal]);
      } else {
        rgls.push([st.betaal, totaal, 0]);
        rgls.push([st.grootboek, 0, excl]);
        if (btw > 0) rgls.push(['1910', 0, btw]);
      }
      return rgls.map((r) => `<tr><td style="padding:4px 16px">${esc(r[0])} — ${esc(naam(r[0]))}</td><td class="num" style="padding:4px 16px;color:var(--ink)">${r[1] ? euro(r[1]) : ''}</td><td class="num" style="padding:4px 16px;color:var(--ink)">${r[2] ? euro(r[2]) : ''}</td></tr>`).join('');
    }
    function render() {
      const gbList = st.type === 'inkoop' ? kosten : omzet;
      if (!gbList.find((a) => a.nummer === st.grootboek)) st.grootboek = (gbList[0] || {}).nummer || '';
      ov.innerHTML = `<div class="modal"><div class="modal-head"><h2>Boeking invoeren</h2><button class="x">✕</button></div>
        <div class="modal-body">
          <div class="toggle">${['inkoop', 'verkoop'].map((t) => `<button data-type="${t}" class="${st.type === t ? 'active' : ''}">${t}factuur</button>`).join('')}</div>
          <div class="row">
            <label class="field"><span>Datum</span><input type="date" id="datum" value="${esc(st.datum)}" /></label>
            <label class="field"><span>Factuurnummer</span><input id="fn" value="${esc(st.factuurNummer)}" /></label>
          </div>
          <label class="field"><span>Omschrijving</span><input id="oms" value="${esc(st.omschrijving)}" /></label>
          <div class="row">
            <label class="field"><span>Bedrag excl. BTW</span><input class="num" id="bedrag" value="${esc(st.bedrag)}" placeholder="0,00" /></label>
            <label class="field"><span>BTW-percentage</span><select id="pct"><option value="21" ${st.pct === 21 ? 'selected' : ''}>21%</option><option value="9" ${st.pct === 9 ? 'selected' : ''}>9%</option><option value="0" ${st.pct === 0 ? 'selected' : ''}>0%</option></select></label>
          </div>
          <div class="row">
            <label class="field"><span>${st.type === 'inkoop' ? 'Kostenrekening' : 'Omzetrekening'}</span><select id="gb">${opties(gbList, st.grootboek)}</select></label>
            <label class="field"><span>Betaald via</span><select id="bet">${opties(banken, st.betaal)}</select></label>
          </div>
          <div class="preview"><div class="h">Journaalpost-preview</div>
            <table><thead><tr><th style="padding:4px 16px">Rekening</th><th class="r" style="padding:4px 16px">Debet</th><th class="r" style="padding:4px 16px">Credit</th></tr></thead>
            <tbody id="prev">${preview()}</tbody></table></div>
        </div>
        <div class="modal-foot"><button class="btn btn-ghost" id="annuleer">Annuleren</button><button class="btn btn-success" id="boek">Boeken ✓</button></div></div>`;

      ov.querySelector('.x').onclick = close;
      ov.querySelector('#annuleer').onclick = close;
      ov.querySelectorAll('[data-type]').forEach((b) => b.onclick = () => { st.type = b.dataset.type; render(); });
      const bind = (id, key, num) => { const el = ov.querySelector('#' + id); el.oninput = () => { st[key] = num ? Number(el.value) : el.value; if (key === 'bedrag' || key === 'pct' || key === 'grootboek' || key === 'betaal') ov.querySelector('#prev').innerHTML = preview(); }; el.onchange = el.oninput; };
      bind('datum', 'datum'); bind('fn', 'factuurNummer'); bind('oms', 'omschrijving');
      bind('bedrag', 'bedrag'); bind('pct', 'pct', true); bind('gb', 'grootboek'); bind('bet', 'betaal');
      ov.querySelector('#boek').onclick = boek;
    }
    async function boek() {
      const excl = round2(Number(String(st.bedrag).replace(',', '.')) || 0);
      if (!(excl > 0)) return toast('Vul een bedrag groter dan 0 in', 'error');
      if (!st.omschrijving.trim()) return toast('Vul een omschrijving in', 'error');
      if (!st.grootboek || !st.betaal) return toast('Kies de rekeningen', 'error');
      try {
        await api('boeking', { datum: st.datum, omschrijving: st.omschrijving, factuurNummer: st.factuurNummer, type: st.type, bedragExBTW: excl, btwPercentage: st.pct, grootboekrekening: st.grootboek, betaalRekening: st.betaal }, 'POST');
        toast('Boeking opgeslagen ✓'); close(); renderRoute();
      } catch (e) { toast(e.message, 'error'); }
    }
    render();
  }

  // ---------------- Modal: Rekening ----------------
  function openRekening(account) {
    const bewerken = !!account;
    const st = {
      nummer: account ? account.nummer : '',
      naam: account ? account.naam : '',
      type: account ? account.type : 'kosten',
      opening: account && account.openingSaldo != null ? String(account.openingSaldo) : '0',
    };
    const TYPES = [['actief', 'Actief (bezitting)'], ['passief', 'Passief (schuld/eigen vermogen)'], ['kosten', 'Kosten'], ['opbrengsten', 'Opbrengsten']];
    const ov = document.createElement('div');
    ov.className = 'overlay';
    document.body.appendChild(ov);
    const close = () => ov.remove();
    function render() {
      const balans = st.type === 'actief' || st.type === 'passief';
      ov.innerHTML = `<div class="modal sm"><div class="modal-head"><h2>${bewerken ? 'Rekening bewerken' : 'Nieuwe rekening'}</h2><button class="x">✕</button></div>
        <div class="modal-body">
          <label class="field"><span>Rekeningnummer</span><input id="nr" value="${esc(st.nummer)}" ${bewerken ? 'disabled' : ''} placeholder="bijv. 4300" /></label>
          <label class="field"><span>Naam</span><input id="naam" value="${esc(st.naam)}" /></label>
          <label class="field"><span>Type</span><select id="type" ${account && account.systeem ? 'disabled' : ''}>${TYPES.map((t) => `<option value="${t[0]}" ${st.type === t[0] ? 'selected' : ''}>${t[1]}</option>`).join('')}</select></label>
          ${balans ? `<label class="field"><span>Beginsaldo (natuurlijk saldo)</span><input class="num" id="opening" value="${esc(st.opening)}" /></label>` : ''}
        </div>
        <div class="modal-foot"><button class="btn btn-ghost" id="annuleer">Annuleren</button><button class="btn btn-brand" id="opslaan">Opslaan</button></div></div>`;
      ov.querySelector('.x').onclick = close;
      ov.querySelector('#annuleer').onclick = close;
      ov.querySelector('#naam').oninput = (e) => st.naam = e.target.value;
      if (!bewerken) ov.querySelector('#nr').oninput = (e) => st.nummer = e.target.value;
      ov.querySelector('#type').onchange = (e) => { st.type = e.target.value; render(); };
      const op = ov.querySelector('#opening'); if (op) op.oninput = (e) => st.opening = e.target.value;
      ov.querySelector('#opslaan').onclick = opslaan;
    }
    async function opslaan() {
      if (!st.nummer.trim()) return toast('Rekeningnummer is verplicht', 'error');
      if (!st.naam.trim()) return toast('Naam is verplicht', 'error');
      const balans = st.type === 'actief' || st.type === 'passief';
      try {
        await api('rekening_opslaan', { nieuw: !bewerken, nummer: st.nummer, naam: st.naam, type: st.type, openingSaldo: balans ? Number(String(st.opening).replace(',', '.')) || 0 : 0 }, 'POST');
        toast('Rekening opgeslagen ✓'); close(); renderRoute();
      } catch (e) { toast(e.message, 'error'); }
    }
    render();
  }

  // ---------------- Kleine HTML-helpers ----------------
  function pageHead(title, sub, actions) {
    return `<div class="page-head"><div><h1>${esc(title)}</h1>${sub ? `<div class="sub">${sub}</div>` : ''}</div>${actions ? `<div class="page-actions">${actions}</div>` : ''}</div>`;
  }
  function stat(label, value, cls) {
    return `<div class="stat"><div class="label">${esc(label)}</div><div class="value ${cls || ''}">${value}</div></div>`;
  }

  boot();
})();
