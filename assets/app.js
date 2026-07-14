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
    { hash: '#/grootboek', label: 'Grootboek', ic: '☰', page: pageGrootboek },
    { hash: '#/bank', label: 'Bank', ic: '⇄', page: pageBank },
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
        <button class="btn btn-ghost" id="memo">+ Memoriaal</button>
        <input type="date" id="from" value="${st.from}" style="width:auto" />
        <span class="mut">t/m</span>
        <input type="date" id="to" value="${st.to}" style="width:auto" />
        ${st.from || st.to ? '<button class="linkbtn" id="wis">wissen</button>' : ''}
      </div>`;
      view.innerHTML = pageHead('Journaal', 'Alle boekingen, nieuwste eerst.', filter) + (await load());
      document.getElementById('memo').addEventListener('click', () => openMemoriaal(rerender));
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

  // ---------------- Pagina: Grootboek ----------------
  async function pageGrootboek(view) {
    let rows;
    try { rows = await api('grootboek'); } catch (e) { view.innerHTML = `<div class="dan">${esc(e.message)}</div>`; return; }
    const groepen = [['actief', 'Activa'], ['passief', 'Passiva'], ['opbrengsten', 'Opbrengsten'], ['kosten', 'Kosten']];
    const kaartFor = (type, label) => {
      const r = rows.filter((a) => a.type === type);
      if (!r.length) return '';
      const body = r.map((a) => `<tr class="klik" data-kaart="${esc(a.nummer)}">
          <td class="num" style="text-align:left">${esc(a.nummer)}</td>
          <td>${esc(a.naam)}${a.systeem ? '<span class="badge">systeem</span>' : ''}${a.isBank ? '<span class="badge" style="color:var(--brand)">bank</span>' : ''}</td>
          <td class="num" style="color:var(--ink)">${euro(a.saldo)}</td></tr>`).join('');
      const tot = r.reduce((s, a) => s + Number(a.saldo), 0);
      return `<div class="card" style="margin-bottom:16px"><div class="card-head">${label}</div>
        <table><thead><tr><th>Nr.</th><th>Rekening</th><th class="r">Saldo</th></tr></thead>
        <tbody>${body}</tbody>
        <tfoot><tr><td></td><td style="font-weight:500;color:var(--inkdim)">Totaal ${esc(label.toLowerCase())}</td><td class="num" style="font-weight:600">${euro(tot)}</td></tr></tfoot></table></div>`;
    };
    const html = groepen.map(([t, l]) => kaartFor(t, l)).join('');
    view.innerHTML = pageHead('Grootboek', 'Klik een rekening om de opbouw te zien (grootboekkaart).') +
      (html || `<div class="card p5 mut">Nog geen rekeningen.</div>`);
    view.querySelectorAll('[data-kaart]').forEach((el) => el.addEventListener('click', () => openKaart(el.dataset.kaart)));
  }

  // ---------------- Pagina: Bank (MT940 + afletteren) ----------------
  async function pageBank(view) {
    let filter = 'open';
    function bankRekening() {
      const b = state.accounts.filter((a) => a.type === 'actief' && !a.systeem);
      return (b.find((a) => a.isBank) || b.find((a) => /bunq|bank/i.test(a.naam)) || b[0] || {}).nummer || '';
    }
    function boekVanBank(line) {
      const regime = line.btw_regime || '21';
      const incl = Number(line.bedrag);
      const initial = { datum: line.datum, omschrijving: line.leverancier_naam || line.tegenrekening_naam || line.omschrijving || '', grootboekrekening: line.standaard_rekening || '' };
      if (regime === 'geen') { initial.btwRegime = 'geen'; initial.bedragExBTW = round2(incl); }
      else if (regime === 'verlegd') { initial.btwPercentage = 'verlegd'; initial.bedragExBTW = round2(incl); }
      else { const p = Number(regime) || 0; initial.btwPercentage = String(regime); initial.bedragExBTW = p > 0 ? round2(incl / (1 + p / 100)) : round2(incl); }
      const type = line.afbij === 'af' ? 'inkoop' : 'verkoop';
      openBoeking(initial, type, { betaal: bankRekening(), onSaved: async (id) => { await api('bank_koppel', { id: line.id, transactieId: id }, 'POST'); toast('Betaling afgeletterd ✓'); laad(); } });
    }
    // Overboeking / memoriaal: bankregel boeken tegen een vrije tegenrekening
    // (bv. rekening-courant privé, BTW-betaling, overboeking tussen banken).
    function memoVanBank(line) {
      const bank = bankRekening();
      const bedrag = round2(Number(line.bedrag));
      const oms = line.leverancier_naam || line.tegenrekening_naam || line.omschrijving || 'Overboeking';
      const regels = line.afbij === 'af'
        ? [{ rekening: '', debet: bedrag, credit: 0 }, { rekening: bank, debet: 0, credit: bedrag }]
        : [{ rekening: bank, debet: bedrag, credit: 0 }, { rekening: '', debet: 0, credit: bedrag }];
      openMemoriaal(laad, { initial: { datum: line.datum, omschrijving: oms, regels }, onSaved: async (id) => { await api('bank_koppel', { id: line.id, transactieId: id }, 'POST'); toast('Afgeletterd ✓'); laad(); } });
    }
    async function laad() {
      let lijst, leveranciers;
      try {
        await loadAccounts();
        [lijst, leveranciers] = await Promise.all([api('bank_lijst', filter === 'alle' ? {} : { status: filter }), api('leveranciers')]);
      } catch (e) { view.innerHTML = `<div class="dan">${esc(e.message)}</div>`; return; }

      const tabs = ['open', 'gekoppeld', 'genegeerd', 'alle'];
      const rows = lijst.length ? lijst.map((r) => {
        const badge = r.status === 'gekoppeld' ? '<span class="badge" style="color:var(--success)">gekoppeld</span>' : r.status === 'genegeerd' ? '<span class="badge">genegeerd</span>' : '';
        const acties = r.status === 'open'
          ? `<button class="btn btn-success" data-boek="${r.id}" style="padding:4px 10px">Boek</button> <button class="linkbtn" data-memo="${r.id}">overboeking</button> <button class="linkbtn" data-koppel="${r.id}">koppel</button> <button class="linkbtn" data-negeer="${r.id}">negeer</button>`
          : r.status === 'gekoppeld'
            ? `<button class="linkbtn" data-ontkoppel="${r.id}">ontkoppel</button>`
            : `<button class="linkbtn" data-open="${r.id}">heropenen</button>`;
        return `<tr>
          <td class="num" style="text-align:left">${datumNL(r.datum)}</td>
          <td class="${r.afbij === 'af' ? 'dan' : 'suc'}">${r.afbij}</td>
          <td class="num" style="color:var(--ink)">${euro(r.bedrag)}</td>
          <td class="naam" title="${esc(r.tegenrekening_naam || '')}">${esc(r.tegenrekening_naam || '—')}${r.leverancier_naam ? ` <span class="mut">→ ${esc(r.leverancier_naam)}</span>` : ''}</td>
          <td class="naam" title="${esc(r.omschrijving || '')}" style="max-width:240px">${esc(r.omschrijving || '')}</td>
          <td>${badge}</td>
          <td class="r" style="white-space:nowrap">${acties}</td></tr>`;
      }).join('') : `<tr><td colspan="7" class="empty">Geen bankregels — importeer een MT940 (.sta) bestand.</td></tr>`;

      const levRows = leveranciers.length ? leveranciers.map((l) => `<tr>
        <td>${esc(l.naam)}</td><td class="mut">${esc(l.zoekterm || '')}</td><td class="mut">${esc(l.land || '')}</td>
        <td>${l.btw_regime === 'geen' ? '<span class="badge">geen BTW</span>' : l.btw_regime + '%'}</td>
        <td class="num" style="text-align:left">${esc(l.standaard_rekening || '')}</td>
        <td class="r"><button class="linkbtn" data-lev-edit="${l.id}">bewerken</button> <button class="linkbtn del" data-lev-del="${l.id}">verwijderen</button></td></tr>`).join('')
        : `<tr><td colspan="6" class="empty">Nog geen leveranciers.</td></tr>`;

      view.innerHTML =
        pageHead('Bank', 'Importeer je MT940-afschrift en letter betalingen af tegen boekingen.',
          `<button class="btn btn-brand" id="mt940">MT940 importeren</button><input type="file" id="mt940file" accept=".sta,.txt,text/plain" style="display:none" />`) +
        `<div class="tabs" style="margin-bottom:16px;display:flex;gap:8px">${tabs.map((t) => `<button data-tab="${t}" class="${filter === t ? 'active' : ''}">${t}</button>`).join('')}</div>
         <div class="card" style="margin-bottom:24px"><table>
           <thead><tr><th>Datum</th><th>Af/bij</th><th class="r">Bedrag</th><th>Tegenrekening</th><th>Omschrijving</th><th>Status</th><th></th></tr></thead>
           <tbody>${rows}</tbody></table></div>
         <div class="card"><div class="card-head"><span>Leveranciers</span><button class="btn btn-brand" id="nieuweLev">+ Leverancier</button></div>
           <table><thead><tr><th>Naam</th><th>Zoekterm</th><th>Land</th><th>BTW</th><th>Kostenrek.</th><th></th></tr></thead>
           <tbody>${levRows}</tbody></table></div>`;

      const fileEl = document.getElementById('mt940file');
      document.getElementById('mt940').onclick = () => fileEl.click();
      fileEl.onchange = async () => {
        const file = fileEl.files[0]; if (!file) return;
        try { const tekst = await file.text(); const r = await api('bank_import', { bestand: tekst }, 'POST'); toast(`${r.geimporteerd} geïmporteerd, ${r.overgeslagen} overgeslagen`); laad(); }
        catch (e) { toast(e.message, 'error'); } finally { fileEl.value = ''; }
      };
      view.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => { filter = b.dataset.tab; laad(); });
      view.querySelectorAll('[data-boek]').forEach((b) => b.onclick = () => boekVanBank(lijst.find((x) => x.id === Number(b.dataset.boek))));
      view.querySelectorAll('[data-koppel]').forEach((b) => b.onclick = () => openKoppel(lijst.find((x) => x.id === Number(b.dataset.koppel)), laad));
      view.querySelectorAll('[data-memo]').forEach((b) => b.onclick = () => memoVanBank(lijst.find((x) => x.id === Number(b.dataset.memo))));
      view.querySelectorAll('[data-negeer]').forEach((b) => b.onclick = async () => { await api('bank_status', { id: Number(b.dataset.negeer), status: 'genegeerd' }, 'POST'); laad(); });
      view.querySelectorAll('[data-open]').forEach((b) => b.onclick = async () => { await api('bank_status', { id: Number(b.dataset.open), status: 'open' }, 'POST'); laad(); });
      view.querySelectorAll('[data-ontkoppel]').forEach((b) => b.onclick = async () => { await api('bank_ontkoppel', { id: Number(b.dataset.ontkoppel) }, 'POST'); laad(); });
      document.getElementById('nieuweLev').onclick = () => openLeverancier(null, laad);
      view.querySelectorAll('[data-lev-edit]').forEach((b) => b.onclick = () => openLeverancier(leveranciers.find((l) => l.id === Number(b.dataset.levEdit)), laad));
      view.querySelectorAll('[data-lev-del]').forEach((b) => b.onclick = async () => { if (!confirm('Leverancier verwijderen?')) return; await api('leverancier_verwijder', { id: Number(b.dataset.levDel) }, 'POST'); laad(); });
    }
    laad();
  }

  // Koppel-modal: bestaande boeking met hetzelfde bedrag
  async function openKoppel(line, refresh) {
    if (!line) return;
    const ov = document.createElement('div'); ov.className = 'overlay'; document.body.appendChild(ov);
    const close = () => ov.remove();
    ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
    ov.innerHTML = `<div class="modal sm"><div class="modal-head"><h2>Koppel aan boeking</h2><button class="x">✕</button></div><div class="modal-body" id="kk"><div class="mut">Zoeken…</div></div></div>`;
    ov.querySelector('.x').onclick = close;
    let sug;
    try { sug = await api('bank_suggesties', { id: line.id }); } catch (e) { ov.querySelector('#kk').innerHTML = `<div class="dan">${esc(e.message)}</div>`; return; }
    ov.querySelector('#kk').innerHTML =
      `<div class="mut" style="font-size:13px">${datumNL(line.datum)} · ${esc(line.tegenrekening_naam || '')} · <b>${euro(line.bedrag)}</b></div>` +
      (sug.length
        ? `<table style="margin-top:8px"><tbody>${sug.map((s) => `<tr><td class="num" style="text-align:left">${datumNL(s.datum)}</td><td>${esc(s.omschrijving)}</td><td class="num">${euro(s.totaal)}</td><td class="r"><button class="btn btn-success" data-k="${s.id}" style="padding:4px 10px">koppel</button></td></tr>`).join('')}</tbody></table>`
        : `<div class="mut" style="margin-top:10px">Geen boeking met hetzelfde bedrag gevonden. Sluit dit venster en gebruik <b>Boek</b> om een nieuwe boeking te maken (eventueel met factuur-PDF).</div>`);
    ov.querySelectorAll('[data-k]').forEach((b) => b.onclick = async () => { try { await api('bank_koppel', { id: line.id, transactieId: Number(b.dataset.k) }, 'POST'); toast('Gekoppeld ✓'); close(); refresh(); } catch (e) { toast(e.message, 'error'); } });
  }

  // Leverancier-modal
  function openLeverancier(lev, refresh) {
    const st = { id: lev ? lev.id : 0, btw_regime: lev ? lev.btw_regime : '21', standaard_rekening: lev ? (lev.standaard_rekening || '') : '' };
    const kosten = state.accounts.filter((a) => a.type === 'kosten');
    const ov = document.createElement('div'); ov.className = 'overlay'; document.body.appendChild(ov);
    const close = () => ov.remove();
    ov.innerHTML = `<div class="modal sm"><div class="modal-head"><h2>${lev ? 'Leverancier bewerken' : 'Nieuwe leverancier'}</h2><button class="x">✕</button></div>
      <div class="modal-body">
        <label class="field"><span>Naam</span><input id="naam" value="${esc(lev ? lev.naam : '')}" /></label>
        <label class="field"><span>Zoekterm (herkenning in bankregel)</span><input id="zoek" value="${esc(lev ? (lev.zoekterm || '') : '')}" placeholder="bijv. ANTHROPIC of A2WEBHOST" /></label>
        <div class="row">
          <label class="field"><span>Land</span><input id="land" value="${esc(lev ? (lev.land || '') : '')}" placeholder="NL / US / IE" /></label>
          <label class="field"><span>BTW-regime</span><select id="regime">${[['21', '21%'], ['9', '9%'], ['0', '0%'], ['geen', 'geen (buitenland)'], ['verlegd', 'BTW verlegd (EU)']].map(([v, l]) => `<option value="${v}" ${st.btw_regime === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        </div>
        <label class="field"><span>Standaard kostenrekening</span><select id="rek"><option value="">— geen —</option>${kosten.map((a) => `<option value="${esc(a.nummer)}" ${st.standaard_rekening === a.nummer ? 'selected' : ''}>${esc(a.nummer)} — ${esc(a.naam)}</option>`).join('')}</select></label>
      </div>
      <div class="modal-foot"><button class="btn btn-ghost" id="annuleer">Annuleren</button><button class="btn btn-brand" id="opslaan">Opslaan</button></div></div>`;
    ov.querySelector('.x').onclick = close; ov.querySelector('#annuleer').onclick = close;
    ov.querySelector('#opslaan').onclick = async () => {
      const body = { id: st.id, naam: ov.querySelector('#naam').value, zoekterm: ov.querySelector('#zoek').value, land: ov.querySelector('#land').value, btw_regime: ov.querySelector('#regime').value, standaard_rekening: ov.querySelector('#rek').value };
      if (!body.naam.trim()) return toast('Naam is verplicht', 'error');
      try { await api('leverancier_opslaan', body, 'POST'); toast('Leverancier opgeslagen ✓'); close(); refresh(); } catch (e) { toast(e.message, 'error'); }
    };
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
            ${d.rubriek4b ? rij('4b — Verworven diensten uit EU (verlegd)', d.rubriek4b.grondslag, d.rubriek4b.btw) : ''}
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
    let s, balans, wenv, jaarcijfers, toelichtingen;
    try {
      s = state.settings || (await api('instellingen'));
      [balans, wenv, jaarcijfers, toelichtingen] = await Promise.all([api('balans'), api('wenv'), api('jaarcijfers'), api('toelichtingen')]);
    } catch (e) { view.innerHTML = `<div class="dan">${esc(e.message)}</div>`; return; }

    const lijst = (arr) => arr.map((p) => { const nm = `${esc(p.nummer)} — ${esc(p.naam)}`; return `<tr><td class="naam klik" data-kaart="${esc(p.nummer)}" title="${nm} — klik voor verloop">${nm}</td><td class="num" style="color:var(--ink)">${euro0(p.saldo)}</td></tr>`; }).join('');

    // Toelichtingen: verloop per post + deelnemingen (uit de geïmporteerde jaarrekening).
    let toelichtingHtml = '';
    if (toelichtingen && toelichtingen.length) {
      const groep = (rows) => { const m = new Map(); rows.forEach((r) => { if (!m.has(r.post)) m.set(r.post, []); m.get(r.post).push(r); }); return m; };
      const verloopRij = (r) => { const st = /stand/i.test(r.label); const sty = st ? ' style="font-weight:500;color:var(--inkdim)"' : ''; const syn = st ? ' style="color:var(--ink)"' : ''; return `<tr><td class="naam"${sty}>${esc(r.label)}</td><td class="num"${syn}>${euro0(r.bedrag)}</td></tr>`; };
      const deeln = toelichtingen.filter((r) => r.soort === 'deelneming');

      if (deeln.length) {
        toelichtingHtml += `<div class="card" style="margin-bottom:24px"><div class="card-head">Deelnemingen</div><div class="card-body" style="display:grid;gap:18px">` +
          [...groep(deeln)].map(([post, rows]) => {
            const aandeel = (rows.find((r) => r.label === 'Aandeel') || {}).tekst || '';
            const status = (rows.find((r) => r.label === 'Status') || {}).tekst || '';
            const bedragRows = rows.filter((r) => r.bedrag !== null);
            return `<div>
              <div style="font-weight:500;color:var(--ink)">${esc(post)}${aandeel ? ` <span class="mut">(${esc(aandeel)})</span>` : ''}</div>
              ${status ? `<div class="mut" style="font-size:13px;margin:2px 0 6px">${esc(status)}</div>` : ''}
              ${bedragRows.length ? `<table class="jl" style="max-width:360px"><tbody>${bedragRows.map(verloopRij).join('')}</tbody></table>` : ''}
            </div>`;
          }).join('') +
          `</div></div>`;
      }
    }

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
      ${toelichtingHtml}
      <div class="card p5 mut" style="font-size:14px;line-height:1.6">
        Deze rapportage is een interne weergave van de financiële positie van ${esc(s.bedrijfsnaam || 'de vennootschap')} per ${datumNL(balans.datum)}
        en het resultaat over boekjaar ${esc(s.boekjaar)}. Controle: totaal activa (${euro0(balans.totaalActiva)}) is gelijk aan totaal passiva inclusief
        resultaat (${euro0(balans.totaalPassiva)}). Dit betreft geen officieel jaarverslag conform Boek 2 BW.
      </div>`;
    document.getElementById('print').addEventListener('click', () => window.print());
    view.querySelectorAll('[data-kaart]').forEach((el) => el.addEventListener('click', () => openKaart(el.dataset.kaart)));
  }

  // ---------------- Pagina: Instellingen ----------------
  async function pageInstellingen(view) {
    let s;
    try { s = await api('instellingen'); await loadAccounts(); } catch (e) { view.innerHTML = `<div class="dan">${esc(e.message)}</div>`; return; }
    state.settings = s;
    const TYPE = { actief: 'Actief', passief: 'Passief', kosten: 'Kosten', opbrengsten: 'Opbrengsten' };
    const rekRows = state.accounts.map((a) => `<tr>
        <td class="num klik" style="text-align:left" data-kaart="${esc(a.nummer)}" title="Bekijk verloop / grootboekkaart">${esc(a.nummer)}</td>
        <td class="klik" data-kaart="${esc(a.nummer)}">${esc(a.naam)}${a.systeem ? '<span class="badge">systeem</span>' : ''}${a.isBank ? '<span class="badge" style="color:var(--brand)">bank</span>' : ''}</td>
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
    view.querySelectorAll('[data-kaart]').forEach((el) => el.addEventListener('click', () => openKaart(el.dataset.kaart)));
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
      const diff = round2(ta - tp);
      let onbalansHint = '';
      if (!inBalans) {
        const half = Math.abs(diff) / 2;
        const kand = data.balans.filter((p) => half > 0 && Math.abs(Number(p.bedragHuidig)) === half).map((p) => p.omschrijving).filter(Boolean);
        onbalansHint = `<div class="dan" style="font-size:13px;margin-top:8px;max-width:680px;line-height:1.5">De balans sluit niet — verschil ${euro(diff)}.` +
          (kand.length ? ` Dat is precies 2× ${euro(half)}: controleer of ${kand.map((n) => '“' + esc(n) + '”').join(' / ')} aan de juiste kant staat en pas zo nodig het <b>Type</b> (activa/passiva) aan.` : ' Waarschijnlijk staat een post aan de verkeerde kant of ontbreekt er een bedrag.') + `</div>`;
      }
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
        ${onbalansHint}
        <div style="display:flex;gap:8px;margin-top:12px">
          <button class="btn btn-success" id="importeer">Importeren ✓</button>
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
      const ta = sum(data.balans, 'actief');
      const tp = sum(data.balans, 'passief');
      if (Math.abs(ta - tp) >= 0.005) {
        if (!confirm(`De balans sluit niet: activa ${euro(ta)} vs passiva ${euro(tp)} (verschil ${euro(ta - tp)}).\n\nControleer of een post aan de verkeerde kant staat. Toch importeren?`)) return;
      }
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
  function openBoeking(initial, initialType, opts) {
    opts = opts || {};
    const accounts = state.accounts;
    const kosten = accounts.filter((a) => a.type === 'kosten');
    const omzet = accounts.filter((a) => a.type === 'opbrengsten');
    const banken = accounts.filter((a) => a.type === 'actief' && !a.systeem);
    const naam = (nr) => { const a = accounts.find((x) => x.nummer === nr); return a ? a.naam : nr; };

    const st = {
      type: initialType || 'inkoop',
      datum: (initial && (initial.factuurDatum || initial.datum)) || vandaag(),
      factuurNummer: (initial && initial.factuurNummer) || '',
      omschrijving: (initial && (initial.omschrijving || initial.leverancier)) || '',
      bedrag: initial && initial.bedragExBTW != null ? String(initial.bedragExBTW) : '',
      pct: (initial && initial.btwRegime === 'geen') ? 'geen' : (initial && initial.btwPercentage != null ? String(initial.btwPercentage) : '21'),
      grootboek: (initial && initial.grootboekrekening) || (kosten[0] ? kosten[0].nummer : ''),
      betaal: (opts.betaal) || (banken.find((a) => a.isBank) || banken.find((a) => /bank|bunq/i.test(a.naam)) || banken[0] || {}).nummer || '',
    };

    const ov = document.createElement('div');
    ov.className = 'overlay';
    document.body.appendChild(ov);
    function close() { ov.remove(); }
    const pctNum = () => (st.pct === 'geen' ? 0 : st.pct === 'verlegd' ? 21 : Number(st.pct) || 0);

    function opties(list, sel) {
      if (!list.length) return '<option value="">— geen rekeningen —</option>';
      return list.map((a) => `<option value="${esc(a.nummer)}" ${a.nummer === sel ? 'selected' : ''}>${esc(a.nummer)} — ${esc(a.naam)}</option>`).join('');
    }
    function preview() {
      const excl = round2(Number(String(st.bedrag).replace(',', '.')) || 0);
      const verlegd = st.pct === 'verlegd';
      const btw = st.pct === 'geen' ? 0 : round2((excl * pctNum()) / 100);
      const totaal = round2(excl + (verlegd ? 0 : btw));
      const rgls = [];
      if (st.type === 'inkoop') {
        rgls.push([st.grootboek, excl, 0]);
        if (verlegd) { rgls.push(['1810', btw, 0]); rgls.push(['1910', 0, btw]); }
        else if (btw > 0) rgls.push(['1810', btw, 0]);
        rgls.push([st.betaal, 0, totaal]);
      } else {
        rgls.push([st.betaal, totaal, 0]);
        rgls.push([st.grootboek, 0, excl]);
        if (!verlegd && st.pct !== 'geen' && btw > 0) rgls.push(['1910', 0, btw]);
      }
      return rgls.map((r) => `<tr><td style="padding:4px 16px">${esc(r[0])} — ${esc(naam(r[0]))}</td><td class="num" style="padding:4px 16px;color:var(--ink)">${r[1] ? euro(r[1]) : ''}</td><td class="num" style="padding:4px 16px;color:var(--ink)">${r[2] ? euro(r[2]) : ''}</td></tr>`).join('');
    }
    function render() {
      const gbList = st.type === 'inkoop' ? kosten : omzet;
      if (!gbList.find((a) => a.nummer === st.grootboek)) st.grootboek = (gbList[0] || {}).nummer || '';
      const pctOpts = [['21', '21%'], ['9', '9%'], ['0', '0%'], ['geen', 'geen (buitenland)'], ['verlegd', 'BTW verlegd (EU)']].map(([v, l]) => `<option value="${v}" ${String(st.pct) === v ? 'selected' : ''}>${l}</option>`).join('');
      ov.innerHTML = `<div class="modal"><div class="modal-head"><h2>Boeking invoeren</h2><button class="x">✕</button></div>
        <div class="modal-body">
          <div style="display:flex;gap:8px;align-items:stretch">
            <div class="toggle" style="flex:1">${['inkoop', 'verkoop'].map((t) => `<button data-type="${t}" class="${st.type === t ? 'active' : ''}">${t}factuur</button>`).join('')}</div>
            <button class="btn btn-ghost" id="pdf" title="Lees een PDF-factuur uit">📄 Factuur</button>
          </div>
          <input type="file" id="pdffile" accept="application/pdf" style="display:none" />
          <div class="row">
            <label class="field"><span>Datum</span><input type="date" id="datum" value="${esc(st.datum)}" /></label>
            <label class="field"><span>Factuurnummer</span><input id="fn" value="${esc(st.factuurNummer)}" /></label>
          </div>
          <label class="field"><span>Omschrijving</span><input id="oms" value="${esc(st.omschrijving)}" /></label>
          <div class="row">
            <label class="field"><span>Bedrag excl. BTW</span><input class="num" id="bedrag" value="${esc(st.bedrag)}" placeholder="0,00" /></label>
            <label class="field"><span>BTW</span><select id="pct">${pctOpts}</select></label>
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
      const bind = (id, key) => { const el = ov.querySelector('#' + id); el.oninput = () => { st[key] = el.value; if (['bedrag', 'pct', 'grootboek', 'betaal'].includes(key)) ov.querySelector('#prev').innerHTML = preview(); }; el.onchange = el.oninput; };
      bind('datum', 'datum'); bind('fn', 'factuurNummer'); bind('oms', 'omschrijving');
      bind('bedrag', 'bedrag'); bind('pct', 'pct'); bind('gb', 'grootboek'); bind('bet', 'betaal');

      const pf = ov.querySelector('#pdffile');
      ov.querySelector('#pdf').onclick = () => pf.click();
      pf.onchange = async () => {
        const file = pf.files[0]; if (!file) return;
        const btn = ov.querySelector('#pdf'); btn.textContent = 'Uitlezen…'; btn.disabled = true;
        try {
          const b64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = rej; r.readAsDataURL(file); });
          const d = await api('factuur_lezen', { pdf: b64 }, 'POST');
          if (d.omschrijving || d.leverancier) st.omschrijving = d.omschrijving || d.leverancier;
          if (d.factuurNummer) st.factuurNummer = d.factuurNummer;
          if (d.factuurDatum) st.datum = d.factuurDatum;
          if (d.bedragExBTW) st.bedrag = String(d.bedragExBTW);
          if (d.btwPercentage != null && st.pct !== 'geen') st.pct = String(d.btwPercentage);
          toast('Factuur uitgelezen ✓'); render();
        } catch (e) { toast(e.message, 'error'); btn.textContent = '📄 Factuur'; btn.disabled = false; }
      };
      ov.querySelector('#boek').onclick = boek;
    }
    async function boek() {
      const excl = round2(Number(String(st.bedrag).replace(',', '.')) || 0);
      if (!(excl > 0)) return toast('Vul een bedrag groter dan 0 in', 'error');
      if (!st.omschrijving.trim()) return toast('Vul een omschrijving in', 'error');
      if (!st.grootboek || !st.betaal) return toast('Kies de rekeningen', 'error');
      try {
        const r = await api('boeking', { datum: st.datum, omschrijving: st.omschrijving, factuurNummer: st.factuurNummer, type: st.type, bedragExBTW: excl, btwPercentage: st.pct, grootboekrekening: st.grootboek, betaalRekening: st.betaal }, 'POST');
        toast('Boeking opgeslagen ✓'); close();
        if (opts.onSaved) await opts.onSaved(r.id); else renderRoute();
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
      isBank: account ? !!account.isBank : false,
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
          ${st.type === 'actief' ? `<label style="display:flex;gap:8px;align-items:center;font-size:14px;color:var(--inkdim)"><input type="checkbox" id="isbank" ${st.isBank ? 'checked' : ''} style="width:auto" /> Bank-/kasrekening (voor banksaldo &amp; bankimport)</label>` : ''}
        </div>
        <div class="modal-foot"><button class="btn btn-ghost" id="annuleer">Annuleren</button><button class="btn btn-brand" id="opslaan">Opslaan</button></div></div>`;
      ov.querySelector('.x').onclick = close;
      ov.querySelector('#annuleer').onclick = close;
      ov.querySelector('#naam').oninput = (e) => st.naam = e.target.value;
      if (!bewerken) ov.querySelector('#nr').oninput = (e) => st.nummer = e.target.value;
      ov.querySelector('#type').onchange = (e) => { st.type = e.target.value; render(); };
      const op = ov.querySelector('#opening'); if (op) op.oninput = (e) => st.opening = e.target.value;
      const cb = ov.querySelector('#isbank'); if (cb) cb.onchange = (e) => st.isBank = e.target.checked;
      ov.querySelector('#opslaan').onclick = opslaan;
    }
    async function opslaan() {
      if (!st.nummer.trim()) return toast('Rekeningnummer is verplicht', 'error');
      if (!st.naam.trim()) return toast('Naam is verplicht', 'error');
      const balans = st.type === 'actief' || st.type === 'passief';
      try {
        await api('rekening_opslaan', { nieuw: !bewerken, nummer: st.nummer, naam: st.naam, type: st.type, isBank: st.isBank, openingSaldo: balans ? Number(String(st.opening).replace(',', '.')) || 0 : 0 }, 'POST');
        toast('Rekening opgeslagen ✓'); close(); renderRoute();
      } catch (e) { toast(e.message, 'error'); }
    }
    render();
  }

  // ---------------- Modal: Memoriaalboeking (vrije DR/CR) ----------------
  async function openMemoriaal(refresh, opts) {
    try { if (!state.accounts.length) await loadAccounts(); } catch { /* */ }
    const alle = state.accounts.slice().sort((a, b) => String(a.nummer).localeCompare(String(b.nummer)));
    const init = (opts && opts.initial) || {};
    const st = {
      datum: init.datum || vandaag(),
      omschrijving: init.omschrijving || '',
      regels: (init.regels && init.regels.length ? init.regels : [{ rekening: '', debet: '', credit: '' }, { rekening: '', debet: '', credit: '' }]).map((r) => ({ rekening: r.rekening || '', debet: r.debet || '', credit: r.credit || '' })),
    };
    const num = (v) => Number(String(v).replace(',', '.')) || 0;
    const ov = document.createElement('div'); ov.className = 'overlay'; document.body.appendChild(ov);
    const close = () => ov.remove();
    const optie = (sel) => '<option value="">— rekening —</option>' + alle.map((a) => `<option value="${esc(a.nummer)}" ${a.nummer === sel ? 'selected' : ''}>${esc(a.nummer)} — ${esc(a.naam)}</option>`).join('');
    function render() {
      const totDeb = round2(st.regels.reduce((s, r) => s + num(r.debet), 0));
      const totCred = round2(st.regels.reduce((s, r) => s + num(r.credit), 0));
      const inBalans = Math.abs(totDeb - totCred) < 0.005;
      const rows = st.regels.map((r, i) => `<tr>
        <td style="padding:4px"><select data-i="${i}" data-f="rekening" style="min-width:190px">${optie(r.rekening)}</select></td>
        <td style="padding:4px"><input class="num" data-i="${i}" data-f="debet" value="${esc(r.debet)}" placeholder="0,00" style="width:96px" /></td>
        <td style="padding:4px"><input class="num" data-i="${i}" data-f="credit" value="${esc(r.credit)}" placeholder="0,00" style="width:96px" /></td>
        <td style="padding:4px" class="r"><button class="linkbtn del" data-del="${i}">✕</button></td></tr>`).join('');
      ov.innerHTML = `<div class="modal"><div class="modal-head"><h2>Memoriaalboeking</h2><button class="x">✕</button></div>
        <div class="modal-body">
          <div class="row">
            <label class="field"><span>Datum</span><input type="date" id="datum" value="${esc(st.datum)}" /></label>
            <label class="field"><span>Omschrijving</span><input id="oms" value="${esc(st.omschrijving)}" placeholder="bijv. Afschrijving inventaris" /></label>
          </div>
          <table><thead><tr><th style="padding:4px">Rekening</th><th class="r" style="padding:4px">Debet</th><th class="r" style="padding:4px">Credit</th><th></th></tr></thead>
          <tbody>${rows}</tbody></table>
          <button class="linkbtn" id="add" style="margin-top:4px">+ regel</button>
          <div style="display:flex;gap:24px;margin-top:8px;font-size:14px">
            <span>Debet: <b class="num">${euro(totDeb)}</b></span>
            <span>Credit: <b class="num">${euro(totCred)}</b></span>
            <span class="${inBalans ? 'suc' : 'dan'}">${inBalans ? '✓ in balans' : '✗ verschil ' + euro(totDeb - totCred)}</span>
          </div>
        </div>
        <div class="modal-foot"><button class="btn btn-ghost" id="annuleer">Annuleren</button><button class="btn btn-success" id="boek">Boeken ✓</button></div></div>`;
      ov.querySelector('.x').onclick = close; ov.querySelector('#annuleer').onclick = close;
      ov.querySelector('#datum').onchange = (e) => st.datum = e.target.value;
      ov.querySelector('#oms').oninput = (e) => st.omschrijving = e.target.value;
      ov.querySelectorAll('[data-f]').forEach((el) => { el.onchange = () => { st.regels[Number(el.dataset.i)][el.dataset.f] = el.value; render(); }; });
      ov.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => { st.regels.splice(Number(b.dataset.del), 1); while (st.regels.length < 2) st.regels.push({ rekening: '', debet: '', credit: '' }); render(); });
      ov.querySelector('#add').onclick = () => { st.regels.push({ rekening: '', debet: '', credit: '' }); render(); };
      ov.querySelector('#boek').onclick = boek;
    }
    async function boek() {
      if (!st.omschrijving.trim()) return toast('Vul een omschrijving in', 'error');
      const regels = st.regels.filter((r) => r.rekening && (num(r.debet) || num(r.credit))).map((r) => ({ rekening: r.rekening, debet: num(r.debet), credit: num(r.credit) }));
      if (regels.length < 2) return toast('Minimaal 2 regels met een bedrag', 'error');
      try {
        const r = await api('memoriaal', { datum: st.datum, omschrijving: st.omschrijving, regels }, 'POST');
        toast('Memoriaal geboekt ✓'); close();
        if (opts && opts.onSaved) await opts.onSaved(r.id); else if (refresh) refresh();
      } catch (e) { toast(e.message, 'error'); }
    }
    render();
  }

  // ---------------- Modal: Grootboekkaart (verloop) ----------------
  async function openKaart(nummer) {
    const ov = document.createElement('div');
    ov.className = 'overlay';
    document.body.appendChild(ov);
    const close = () => ov.remove();
    ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
    ov.innerHTML = `<div class="modal"><div class="modal-head"><h2>Grootboekkaart</h2><button class="x">✕</button></div><div class="modal-body" id="kb"><div class="mut">Laden…</div></div></div>`;
    ov.querySelector('.x').onclick = close;

    let d;
    try { d = await api('grootboekkaart', { nummer }); }
    catch (e) { ov.querySelector('#kb').innerHTML = `<div class="dan">${esc(e.message)}</div>`; return; }

    const rows = d.regels.length
      ? d.regels.map((r) => `<tr>
          <td class="num" style="text-align:left">${datumNL(r.datum)}</td>
          <td>${esc(r.omschrijving)}</td>
          <td class="num">${r.debet ? euro(r.debet) : ''}</td>
          <td class="num">${r.credit ? euro(r.credit) : ''}</td>
          <td class="num" style="color:var(--ink)">${euro(r.saldo)}</td></tr>`).join('')
      : `<tr><td colspan="5" class="empty">Nog geen mutaties in ${String(d.from).slice(0, 4)}.</td></tr>`;

    const boekjaar = String(d.to).slice(0, 4);
    const histRij = (r) => { const st = /stand/i.test(r.label); const sty = st ? ' style="font-weight:500;color:var(--inkdim)"' : ''; const syn = st ? ' style="color:var(--ink)"' : ''; return `<tr><td class="naam"${sty}>${esc(r.label)}</td><td class="num"${syn}>${r.bedrag == null ? '' : euro0(r.bedrag)}</td></tr>`; };
    const histHtml = (d.historie && d.historie.length)
      ? `<div class="mut" style="font-size:11px;text-transform:uppercase;letter-spacing:.04em;margin:12px 0 4px">Verloop ${d.historieJaar} (uit jaarrekening)</div>
         <table class="jl"><tbody>${d.historie.map(histRij).join('')}</tbody></table>
         <div class="mut" style="font-size:12px;margin:4px 0 0">Eindsaldo ${d.historieJaar} = beginsaldo ${boekjaar}</div>`
      : '';

    ov.querySelector('#kb').innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:baseline;font-size:14px">
        <div><b>${esc(d.nummer)} — ${esc(d.naam)}</b> <span class="mut">(${esc(d.type)})</span></div>
        <div class="mut">${datumNL(d.from)} t/m ${datumNL(d.to)}</div>
      </div>
      ${histHtml}
      <div class="mut" style="font-size:11px;text-transform:uppercase;letter-spacing:.04em;margin:14px 0 4px">Boekjaar ${boekjaar}</div>
      <table>
        <thead><tr><th>Datum</th><th>Omschrijving</th><th class="r">Debet</th><th class="r">Credit</th><th class="r">Saldo</th></tr></thead>
        <tbody>
          <tr><td></td><td class="mut">Beginsaldo</td><td></td><td></td><td class="num" style="color:var(--ink)">${euro(d.beginsaldo)}</td></tr>
          ${rows}
        </tbody>
        <tfoot><tr><td></td><td style="font-weight:600;color:var(--inkdim)">Eindsaldo</td><td></td><td></td><td class="num" style="font-weight:700;color:var(--ink)">${euro(d.eindsaldo)}</td></tr></tfoot>
      </table>`;
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
