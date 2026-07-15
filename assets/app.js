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
  const state = { authed: false, settings: null, accounts: [], mode: 'gibs' };

  async function loadSettings() { state.settings = await api('instellingen'); }
  async function loadAccounts() { state.accounts = await api('rekeningen'); }

  // ---------------- Boot ----------------
  async function boot() {
    try {
      const me = await api('me');
      state.authed = !!me.authenticated;
    } catch { state.authed = false; }
    if (state.authed) {
      state.mode = localStorage.getItem('bh_mode') === 'prive' ? 'prive' : 'gibs';
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
  const GIBS_ROUTES = [
    { hash: '#/', label: 'Dashboard', ic: '▤', page: pageDashboard },
    { hash: '#/facturen', label: 'Facturen invoeren', ic: '＋', page: pageFacturen },
    { hash: '#/journaal', label: 'Journaal', ic: '≣', page: pageJournaal },
    { hash: '#/grootboek', label: 'Grootboek', ic: '☰', page: pageGrootboek },
    { hash: '#/bank', label: 'Bank', ic: '⇄', page: pageBank },
    { hash: '#/btw', label: 'BTW-aangifte', ic: '％', page: pageBTW },
    { hash: '#/jaarverslag', label: 'Jaarverslag', ic: '▦', page: pageJaarverslag },
    { hash: '#/deelnemingen', label: 'Deelnemingen', ic: '◈', page: pageDeelnemingen },
    { hash: '#/ib', label: 'Inkomstenbelasting', ic: '§', page: pageIB },
    { hash: '#/import', label: 'Import', ic: '⇪', page: pageImport },
    { hash: '#/instellingen', label: 'Instellingen', ic: '⚙', page: pageInstellingen },
  ];
  const PRIVE_ROUTES = [
    { hash: '#/prive', label: 'Overzicht', ic: '▤', page: privOverzicht },
    { hash: '#/prive/rekeningen', label: 'Rekeningen', ic: '⇄', page: privRekeningen },
    { hash: '#/prive/transacties', label: 'Transacties', ic: '≣', page: privTransacties },
    { hash: '#/prive/maand', label: 'Per maand', ic: '▦', page: privMaand },
    { hash: '#/prive/posten', label: 'Te ontvangen / betalen', ic: '◈', page: privPosten },
    { hash: '#/prive/categorieen', label: 'Categorieën', ic: '☰', page: privCategorieen },
  ];
  const currentRoutes = () => (state.mode === 'prive' ? PRIVE_ROUTES : GIBS_ROUTES);

  function switchMode(m) {
    if (m !== 'gibs' && m !== 'prive') return;
    state.mode = m;
    localStorage.setItem('bh_mode', m);
    location.hash = currentRoutes()[0].hash;
    renderShell();
  }

  function renderShell() {
    const s = state.settings || {};
    const bedrijf = s.bedrijfsnaam || 'GIBS B.V.';
    const routes = currentRoutes();
    const isPrive = state.mode === 'prive';
    app.innerHTML = `
      <div class="app">
        <aside class="sidebar">
          <div class="sidebar-head">
            <button class="ws-switch" id="wsSwitch">
              <div style="min-width:0">
                <div class="naam">${isPrive ? '⌂ Privé' : esc(bedrijf)}</div>
                <div class="jaar">${isPrive ? 'Persoonlijke boekhouding' : 'Boekjaar ' + esc(s.boekjaar || '')}</div>
              </div>
              <span class="ws-caret">⇅</span>
            </button>
            <div class="ws-menu" id="wsMenu" hidden>
              <button data-mode="gibs" class="${!isPrive ? 'active' : ''}"><div class="t">🏢 ${esc(bedrijf)}</div><div class="mut">Zakelijke boekhouding</div></button>
              <button data-mode="prive" class="${isPrive ? 'active' : ''}"><div class="t">⌂ Privé</div><div class="mut">Persoonlijke boekhouding</div></button>
            </div>
          </div>
          <nav class="nav" id="nav">
            ${routes.map((r) => `<a data-hash="${r.hash}"><span class="ic">${r.ic}</span>${r.label}</a>`).join('')}
          </nav>
          <div class="sidebar-foot"><button id="logout">⎋ Uitloggen</button></div>
        </aside>
        <main class="main"><div class="container" id="view"></div></main>
      </div>`;
    const menu = document.getElementById('wsMenu');
    document.getElementById('wsSwitch').addEventListener('click', (e) => {
      e.stopPropagation();
      const opening = menu.hidden;
      menu.hidden = !opening;
      if (opening) setTimeout(() => document.addEventListener('click', () => { menu.hidden = true; }, { once: true }), 0);
    });
    menu.addEventListener('click', (e) => { const b = e.target.closest('button[data-mode]'); if (b) switchMode(b.dataset.mode); });
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
    const routes = currentRoutes();
    const hash = location.hash || routes[0].hash;
    const route = routes.find((r) => r.hash === hash) || routes[0];
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
      </div>
      ${faqBlock('dashboard')}`;
  }

  // ---------------- Pagina: Facturen ----------------
  async function pageFacturen(view) {
    try { await loadAccounts(); } catch (e) { view.innerHTML = `<div class="dan">${esc(e.message)}</div>`; return; }
    view.innerHTML = `
      ${pageHead('Facturen invoeren', 'Upload een PDF om automatisch uit te lezen, of voer handmatig in.',
        `<button class="btn btn-ghost" id="handmatig">Handmatig invoeren</button>`)}
      <div class="help" style="margin-bottom:16px"><b>Tip:</b> boek je meestal betaalde facturen? Ga dan naar <b>Bank</b>, importeer je afschrift en klik bij de betaling op <b>Boek</b> — daar upload je de PDF én wordt de betaling meteen afgeletterd. Deze pagina is handig voor een losse factuur zonder bankregel.</div>
      <div class="card dropzone" id="drop">
        <div class="big">📄</div>
        <div id="dropText"><div style="color:var(--ink)">Sleep een PDF-factuur hierheen of klik om te kiezen</div>
        <div class="mut" style="font-size:14px;margin-top:4px">De gegevens worden automatisch voorinvuld.</div></div>
        <input type="file" id="file" accept="application/pdf" style="display:none" />
      </div>
      ${faqBlock('facturen')}`;
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
      view.innerHTML = pageHead('Journaal', 'Alle boekingen, nieuwste eerst.', filter) + (await load()) + faqBlock('journaal');
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
    view.innerHTML = pageHead('Grootboek', 'Klik een rekening om de opbouw te zien (grootboekkaart).',
      `<button class="btn btn-ghost" id="renterc">Rente r/c berekenen</button>`) +
      (html || `<div class="card p5 mut">Nog geen rekeningen.</div>`) + faqBlock('grootboek');
    view.querySelectorAll('[data-kaart]').forEach((el) => el.addEventListener('click', () => openKaart(el.dataset.kaart)));
    const rr = document.getElementById('renterc'); if (rr) rr.onclick = () => openRenteRC(() => pageGrootboek(view));
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
    // Herkent privé/Belastingdienst en stelt de tegenrekening + uitleg voor.
    function memoVanBank(line) {
      const bank = bankRekening();
      const bedrag = round2(Number(line.bedrag));
      const acc = state.accounts;
      const tekst = ((line.tegenrekening_naam || '') + ' ' + (line.omschrijving || '')).toLowerCase();
      const rc = acc.find((a) => /rekening.?courant|aandeelhouder/i.test(a.naam)) || acc.find((a) => /priv[eé]/i.test(a.naam));
      const heeft1910 = acc.some((a) => a.nummer === '1910');
      const richting = line.afbij === 'af' ? 'DR de tegenrekening / CR de bank' : 'DR de bank / CR de tegenrekening';
      let suggest = '', hint = '';
      if (/priv[eé]|poelmans|aandeelhouder|rekening.?courant/.test(tekst)) {
        if (rc) { suggest = rc.nummer; hint = `Dit lijkt een <b>overboeking naar privé</b>. Kies als tegenrekening de rekening-courant aandeelhouder: <b>${esc(rc.nummer)} — ${esc(rc.naam)}</b>. Bij geld naar privé neemt je vordering op de aandeelhouder toe (${richting}).`; }
        else { hint = 'Dit lijkt een <b>overboeking naar privé</b>. Kies je rekening-courant aandeelhouder als tegenrekening (maak die eerst aan onder Instellingen als hij ontbreekt).'; }
      } else if (/belastingdienst/.test(tekst) && /omzetbelasting|aangifte ob|\bob\b|btw/.test(tekst)) {
        suggest = heeft1910 ? '1910' : ''; hint = 'Dit lijkt een <b>BTW-betaling aan de Belastingdienst</b>. Kies als tegenrekening <b>1910 BTW te betalen</b> — daarmee loop je de eerder afgedragen BTW-schuld weg (' + richting + ').';
      } else if (/belastingdienst/.test(tekst)) {
        hint = 'Betaling aan/van de <b>Belastingdienst</b>. Kies de juiste tegenrekening: <b>1910 BTW te betalen</b> voor omzetbelasting, of een VpB-rekening voor vennootschapsbelasting.';
      } else {
        hint = 'Een <b>overboeking</b> is geen kosten/omzet maar een verschuiving. Kies op de lege regel de tegenrekening waar dit geld heen/vandaan ging (bv. een andere bankrekening of de rekening-courant).';
      }
      const oms = line.leverancier_naam || line.tegenrekening_naam || line.omschrijving || 'Overboeking';
      const regels = line.afbij === 'af'
        ? [{ rekening: suggest, debet: bedrag, credit: 0 }, { rekening: bank, debet: 0, credit: bedrag }]
        : [{ rekening: bank, debet: bedrag, credit: 0 }, { rekening: suggest, debet: 0, credit: bedrag }];
      openMemoriaal(laad, { hint, initial: { datum: line.datum, omschrijving: oms, regels }, onSaved: async (id) => { await api('bank_koppel', { id: line.id, transactieId: id }, 'POST'); toast('Afgeletterd ✓'); laad(); } });
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
        const koppelBtn = r.match_count > 0 ? `<button class="btn btn-brand" data-koppel="${r.id}" style="padding:4px 10px" title="Er bestaat al een boeking met dit bedrag — koppel i.p.v. opnieuw boeken">Koppel${r.match_count > 1 ? ' (' + r.match_count + ')' : ''}</button> ` : '';
        const acties = r.status === 'open'
          ? `${koppelBtn}<button class="btn btn-success" data-boek="${r.id}" style="padding:4px 10px">Boek</button> <button class="linkbtn" data-memo="${r.id}">overboeking</button> <button class="linkbtn" data-negeer="${r.id}">negeer</button>`
          : r.status === 'gekoppeld'
            ? `<button class="linkbtn" data-ontkoppel="${r.id}">ontkoppel</button>`
            : `<button class="linkbtn" data-open="${r.id}">heropenen</button>`;
        return `<tr>
          <td class="num" style="text-align:left">${datumNL(r.datum)}</td>
          <td class="${r.afbij === 'af' ? 'dan' : 'suc'}">${r.afbij}</td>
          <td class="num" style="color:var(--ink)">${euro(r.bedrag)}</td>
          <td title="${esc(r.tegenrekening_naam || '')}" style="max-width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.tegenrekening_naam || '—')}${r.leverancier_naam ? ` <span class="mut">→ ${esc(r.leverancier_naam)}</span>` : ''}</td>
          <td title="${esc(r.omschrijving || '')}" style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.omschrijving || '')}</td>
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
        pageHead('Bank', 'Importeer je bankafschrift (MT940 of ING CSV) en letter betalingen af tegen boekingen.',
          `<button class="btn btn-brand" id="mt940">Afschrift importeren</button><input type="file" id="mt940file" accept=".sta,.csv,.txt,text/plain" style="display:none" />`) +
        `<div class="help" style="margin-bottom:16px"><b>Per bankregel kies je één actie:</b> <b>Boek</b> = maak een nieuwe boeking (factuur — upload de PDF, BTW wordt ingevuld). <b>Overboeking</b> = geen factuur maar een verschuiving (naar privé, BTW-betaling, tussen banken). <b>Negeer</b> = niet relevant. De blauwe <b>Koppel</b>-knop verschijnt alléén als er al een boeking met hetzelfde bedrag bestaat — dan koppel je die (zodat je niet dubbel boekt). Groen "gekoppeld" = klaar.</div>
        <div class="tabs" style="margin-bottom:16px;display:flex;gap:8px">${tabs.map((t) => `<button data-tab="${t}" class="${filter === t ? 'active' : ''}">${t}</button>`).join('')}</div>
         <div class="card" style="margin-bottom:24px;overflow:hidden"><div style="overflow-x:auto"><table class="compact">
           <thead><tr><th>Datum</th><th>Af/bij</th><th class="r" style="width:88px">Bedrag</th><th>Tegenrekening</th><th>Omschrijving</th><th>Status</th><th></th></tr></thead>
           <tbody>${rows}</tbody></table></div></div>
         <div class="card"><div class="card-head"><span>Leveranciers</span><button class="btn btn-brand" id="nieuweLev">+ Leverancier</button></div>
           <div class="mut" style="padding:12px 20px 0;font-size:12px;line-height:1.5">Leg vaste leveranciers vast met een <b style="color:var(--inkdim)">zoekterm</b> (bv. ANTHROPIC), hun land, het BTW-regime en een standaard kostenrekening. Een betaling in je bankafschrift wordt dan automatisch als die leverancier herkend, zodat "Boek" meteen de juiste kostenrekening en BTW invult — minder klikken, minder fouten.</div>
           <table><thead><tr><th>Naam</th><th>Zoekterm</th><th>Land</th><th>BTW</th><th>Kostenrek.</th><th></th></tr></thead>
           <tbody>${levRows}</tbody></table></div>${faqBlock('bank')}`;

      const fileEl = document.getElementById('mt940file');
      document.getElementById('mt940').onclick = () => fileEl.click();
      fileEl.onchange = async () => {
        const file = fileEl.files[0]; if (!file) return;
        try { const tekst = await file.text(); const r = await api('bank_import', { bestand: tekst }, 'POST'); const m = importMelding(r); toast(m.tekst, m.type); laad(); }
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
        <div class="help">Een leverancier laat de app terugkerende betalingen herkennen in je bankafschrift. <b>Zoekterm</b> = een woord dat in de bankregel staat (bv. ANTHROPIC). <b>BTW-regime</b>: 21/9/0% (NL), <b>geen</b> (niet-EU, bv. VS), of <b>verlegd</b> (EU-diensten).</div>
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
    let data = null;
    async function load() {
      let d;
      try { d = await api('btw', { quarter: kwartaal, year: jaar }); } catch (e) { return `<div class="dan">${esc(e.message)}</div>`; }
      data = d;
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
            <button class="btn btn-brand" id="afdracht" style="margin-top:14px;width:100%">${teBetalen ? 'Afdracht boeken' : 'Teruggaaf boeken'}</button>
            <div class="mut" style="font-size:12px;margin-top:8px;line-height:1.5">Boekt de verschuldigde BTW (1910) en voorbelasting (1810) weg tegen de bank, zodat beide naar 0 lopen. Doe dit als je betaalt/de teruggaaf ontvangt.</div>
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
      view.innerHTML = pageHead('BTW-aangifte', `Omzetbelasting per kwartaal — ${jaar}`, tabs) + (await load()) + faqBlock('btw');
      view.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => { kwartaal = Number(b.dataset.q); rerender(); }));
      const afdr = document.getElementById('afdracht');
      if (afdr) afdr.onclick = () => openBtwAfdracht(data, kwartaal, jaar, () => rerender());
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
        toelichtingHtml += `<div class="card" style="margin-bottom:24px"><div class="card-head">Deelnemingen — verloop uit geïmporteerde jaarrekening <span class="mut" style="font-weight:400">(actueel register: tab Deelnemingen)</span></div><div class="card-body" style="display:grid;gap:18px">` +
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

  // ---------------- Pagina: Deelnemingen ----------------
  const DEELN_STATUS = { actief: ['Actief', 'suc'], opgeheven: ['Opgeheven', 'mut'], failliet: ['Failliet', 'dan'], verkocht: ['Verkocht', 'mut'] };
  async function pageDeelnemingen(view) {
    let lijst;
    try { lijst = await api('deelnemingen'); await loadAccounts(); } catch (e) { view.innerHTML = `<div class="dan">${esc(e.message)}</div>`; return; }
    const laad = () => pageDeelnemingen(view);

    const rows = lijst.length ? lijst.map((d) => {
      const [lab, cls] = DEELN_STATUS[d.status] || ['Actief', 'suc'];
      const periode = [d.opgericht, d.beeindigd].filter(Boolean).join(' – ') || (d.opgericht ? d.opgericht + ' –' : '');
      const bw = d.boekwaarde !== null ? euro0(d.boekwaarde) : '<span class="mut">—</span>';
      const rek = d.rekeningnummer ? `<span class="klik" data-kaart="${esc(d.rekeningnummer)}" title="Klik voor verloop">${esc(d.rekeningnummer)}</span>` : '<span class="mut">niet gekoppeld</span>';
      const kanAfwaarderen = d.rekeningnummer && d.boekwaarde !== null && Math.abs(d.boekwaarde) > 0.005;
      return `<tr>
        <td><div style="color:var(--ink)">${esc(d.naam)}</div>${d.toelichting ? `<div class="mut" style="font-size:12px">${esc(d.toelichting)}</div>` : ''}</td>
        <td>${esc(d.aandeel || '')}${d.land ? ` <span class="mut">${esc(d.land)}</span>` : ''}</td>
        <td><span class="${cls}">${lab}</span>${periode ? `<div class="mut" style="font-size:12px">${esc(periode)}</div>` : ''}</td>
        <td>${rek}</td>
        <td class="num" style="color:var(--ink)">${bw}</td>
        <td class="r" style="white-space:nowrap">
          ${kanAfwaarderen ? `<button class="linkbtn" data-afw="${d.id}" title="Boek de boekwaarde af naar 0 (memoriaal)">afwaarderen</button> ` : ''}
          <button class="linkbtn" data-edit="${d.id}">bewerken</button>
          <button class="linkbtn del" data-del="${d.id}" title="Alleen uit het register; boekingen blijven staan">✕</button>
        </td></tr>`;
    }).join('') : `<tr><td colspan="6" class="empty">Nog geen deelnemingen. Voeg er een toe of importeer een jaarrekening.</td></tr>`;

    view.innerHTML = pageHead('Deelnemingen', 'Register van je deelnemingen/participaties — zelf bij te houden.',
      `<button class="btn btn-brand" id="nieuw">+ Deelneming</button>`) +
      `<div class="help" style="margin-bottom:16px">Dit register houdt je deelnemingen bij (aandeel, status, opgericht/beëindigd). De <b>boekwaarde</b> komt live uit de gekoppelde grootboekrekening — klik op het rekeningnummer voor het verloop. Verandert er iets (bijv. een deelneming wordt <b>opgeheven of failliet</b>): zet de status om én klik <b>afwaarderen</b> om de boekwaarde als verlies naar 0 te boeken. Verwijderen haalt alleen de registerregel weg; je boekingen blijven staan.</div>
      <div class="card"><table>
        <thead><tr><th>Deelneming</th><th>Aandeel</th><th>Status</th><th>Grootboek</th><th class="r">Boekwaarde</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>${faqBlock('deelnemingen')}`;

    document.getElementById('nieuw').onclick = () => openDeelneming(null, laad);
    view.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => openDeelneming(lijst.find((d) => d.id === Number(b.dataset.edit)), laad));
    view.querySelectorAll('[data-kaart]').forEach((el) => el.addEventListener('click', () => openKaart(el.dataset.kaart)));
    view.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
      if (!confirm('Deze deelneming uit het register verwijderen? (Boekingen blijven staan.)')) return;
      try { await api('deelneming_verwijder', { id: Number(b.dataset.del) }, 'POST'); toast('Verwijderd'); laad(); } catch (e) { toast(e.message, 'error'); }
    });
    view.querySelectorAll('[data-afw]').forEach((b) => b.onclick = () => {
      const d = lijst.find((x) => x.id === Number(b.dataset.afw));
      if (!d) return;
      const bedrag = round2(Math.abs(d.boekwaarde));
      // Zoek een passende verlies-/kostenrekening voor de afwaardering.
      const kosten = state.accounts.filter((a) => a.type === 'kosten');
      const suggestie = (kosten.find((a) => /waardevermin|afwaard|resultaat deelnem|bijzondere waarde/i.test(a.naam)) || {}).nummer || '';
      const hint = `Je waardeert <b>${esc(d.naam)}</b> af. De boekwaarde (${euro(bedrag)}) op grootboek ${esc(d.rekeningnummer)} gaat naar <b>0</b>: het bedrag komt als <b>verlies</b> op een kosten-/verliesrekening (Debet) en de deelneming (Credit) wordt afgeboekt. ${suggestie ? '' : '<b>Let op:</b> je hebt nog geen aparte verliesrekening — maak er evt. één aan (type kosten, bv. "Waardevermindering deelnemingen") of kies een bestaande.'} Zet daarna de status op ‘opgeheven’ of ‘failliet’.`;
      openMemoriaal(laad, {
        hint,
        initial: {
          datum: (state.settings && state.settings.boekjaar ? state.settings.boekjaar : String(new Date().getFullYear())) + '-12-31',
          omschrijving: 'Afwaardering deelneming ' + d.naam,
          regels: [{ rekening: suggestie, debet: bedrag, credit: 0 }, { rekening: d.rekeningnummer, debet: 0, credit: bedrag }],
        },
      });
    });
  }

  function openDeelneming(d, refresh) {
    const st = { id: d ? d.id : 0, status: d ? d.status : 'actief', rekeningnummer: d ? (d.rekeningnummer || '') : '' };
    const activa = state.accounts.filter((a) => a.type === 'actief');
    const ov = document.createElement('div'); ov.className = 'overlay'; document.body.appendChild(ov);
    const close = () => ov.remove();
    ov.innerHTML = `<div class="modal sm"><div class="modal-head"><h2>${d ? 'Deelneming bewerken' : 'Nieuwe deelneming'}</h2><button class="x">✕</button></div>
      <div class="modal-body">
        <div class="help">Leg vast wat de BV bezit in een andere onderneming. Koppel eventueel de <b>grootboekrekening</b> (financiële vaste activa) waarop de deelneming staat — dan zie je hier de live boekwaarde. Aankoop, resultaat en afwaardering boek je als memoriaal.</div>
        <label class="field"><span>Naam</span><input id="naam" value="${esc(d ? d.naam : '')}" placeholder="bijv. ClubCows B.V." /></label>
        <div class="row">
          <label class="field"><span>Aandeel</span><input id="aandeel" value="${esc(d ? (d.aandeel || '') : '')}" placeholder="bijv. 100% of 25%" /></label>
          <label class="field"><span>Land</span><input id="land" value="${esc(d ? (d.land || '') : '')}" placeholder="NL" /></label>
        </div>
        <div class="row">
          <label class="field"><span>Status</span><select id="status">${Object.entries(DEELN_STATUS).map(([v, [l]]) => `<option value="${v}" ${st.status === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label class="field"><span>Grootboekrekening</span><select id="rek"><option value="">— geen —</option>${activa.map((a) => `<option value="${esc(a.nummer)}" ${st.rekeningnummer === a.nummer ? 'selected' : ''}>${esc(a.nummer)} — ${esc(a.naam)}</option>`).join('')}</select></label>
        </div>
        <div class="row">
          <label class="field"><span>Opgericht (jaar)</span><input id="opgericht" value="${esc(d && d.opgericht ? d.opgericht : '')}" placeholder="2023" /></label>
          <label class="field"><span>Beëindigd (jaar)</span><input id="beeindigd" value="${esc(d && d.beeindigd ? d.beeindigd : '')}" placeholder="leeg = nog actief" /></label>
        </div>
        <label class="field"><span>Toelichting</span><input id="toel" value="${esc(d ? (d.toelichting || '') : '')}" placeholder="bijv. in 2026 opgeheven" /></label>
      </div>
      <div class="modal-foot"><button class="btn btn-ghost" id="annuleer">Annuleren</button><button class="btn btn-brand" id="opslaan">Opslaan</button></div></div>`;
    ov.querySelector('.x').onclick = close; ov.querySelector('#annuleer').onclick = close;
    ov.querySelector('#opslaan').onclick = async () => {
      const body = {
        id: st.id, naam: ov.querySelector('#naam').value, aandeel: ov.querySelector('#aandeel').value,
        land: ov.querySelector('#land').value, status: ov.querySelector('#status').value,
        rekeningnummer: ov.querySelector('#rek').value, opgericht: ov.querySelector('#opgericht').value,
        beeindigd: ov.querySelector('#beeindigd').value, toelichting: ov.querySelector('#toel').value,
      };
      if (!body.naam.trim()) return toast('Naam is verplicht', 'error');
      try { await api('deelneming_opslaan', body, 'POST'); toast('Opgeslagen ✓'); close(); refresh(); } catch (e) { toast(e.message, 'error'); }
    };
  }

  // ---------------- Pagina: Inkomstenbelasting (privé/DGA) ----------------
  const IB_DEF = {
    loon: '', overigBox1: '', woz: '', ewfPct: '0.35', hypotheekrente: '',
    dividend: '',
    spaargeld: '', beleggingen: '', schulden: '',
    loonheffing: '', heffingskortingen: '', hkAuto: '1',
    // Tarieven 2026 — RICHTWAARDEN, controleer op belastingdienst.nl
    b1s1: '38883', b1t1: '35.70', b1s2: '79137', b1t2: '37.56', b1t3: '49.50',
    b2grens: '68843', b2t1: '24.5', b2t2: '31',
    b3vrij: '57684', b3schuldDrempel: '3800', b3fSpaar: '1.44', b3fBeleg: '6.04', b3fSchuld: '2.62', b3tarief: '36',
    // Heffingskortingen (schatting) — RICHTWAARDEN
    hkAhkMax: '3362', hkAhkStart: '28406', hkAhkPct: '6.337',
    hkArbMax: '5599', hkArbTop: '43071', hkArbAfbStart: '43071', hkArbAfbPct: '6.51',
  };
  const ibNum = (v) => { let s = String(v).trim().replace(/\s/g, ''); if (s === '') return 0; if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.'); return Number(s) || 0; };

  async function pageIB(view) {
    let jaar = Number((state.settings && state.settings.boekjaar) || new Date().getFullYear());
    async function load() {
      let resp;
      try { resp = await api('ib', { jaar }); await loadAccounts(); } catch (e) { view.innerHTML = `<div class="dan">${esc(e.message)}</div>`; return; }
      const rc = resp.prefill ? resp.prefill.rekeningCourant : null;
      const st = Object.assign({}, IB_DEF, resp.gegevens || {});
      const n = ibNum;

      function bereken() {
        // Box 1 — werk & woning
        const loon = n(st.loon), overig = n(st.overigBox1);
        const ewf = round2(n(st.woz) * n(st.ewfPct) / 100);
        const rente = n(st.hypotheekrente);
        const inkomenWoning = round2(ewf - rente);
        const belastbaar1 = round2(loon + overig + inkomenWoning);
        const box1bel = (inc) => {
          if (inc <= 0) return 0;
          const s1 = n(st.b1s1), s2 = n(st.b1s2);
          let b = Math.min(inc, s1) * n(st.b1t1) / 100;
          if (inc > s1) b += (Math.min(inc, s2) - s1) * n(st.b1t2) / 100;
          if (inc > s2) b += (inc - s2) * n(st.b1t3) / 100;
          return round2(b);
        };
        const belBox1 = box1bel(belastbaar1);
        // Box 2 — aanmerkelijk belang
        const div = n(st.dividend);
        const belBox2 = round2(Math.min(div, n(st.b2grens)) * n(st.b2t1) / 100 + Math.max(0, div - n(st.b2grens)) * n(st.b2t2) / 100);
        // Box 3 — sparen & beleggen (forfaitair)
        const spaar = n(st.spaargeld), beleg = n(st.beleggingen);
        const schuldNa = Math.max(0, n(st.schulden) - n(st.b3schuldDrempel));
        const grondslag = round2(spaar + beleg - schuldNa);
        const rendement = round2(spaar * n(st.b3fSpaar) / 100 + beleg * n(st.b3fBeleg) / 100 - schuldNa * n(st.b3fSchuld) / 100);
        const pct = grondslag > 0 ? rendement / grondslag : 0;
        const belastbareGrondslag = Math.max(0, round2(grondslag - n(st.b3vrij)));
        const belastbaarRendement = round2(belastbareGrondslag * pct);
        const belBox3 = round2(belastbaarRendement * n(st.b3tarief) / 100);
        // Heffingskortingen — automatisch schatten of handmatig
        const inkomen = Math.max(0, belastbaar1);
        const ahk = Math.max(0, round2(n(st.hkAhkMax) - Math.max(0, inkomen - n(st.hkAhkStart)) * n(st.hkAhkPct) / 100));
        const arbInk = Math.max(0, loon + overig);
        let arb;
        if (arbInk <= n(st.hkArbTop)) arb = n(st.hkArbTop) > 0 ? round2(n(st.hkArbMax) * Math.min(1, arbInk / n(st.hkArbTop))) : 0;
        else arb = Math.max(0, round2(n(st.hkArbMax) - Math.max(0, arbInk - n(st.hkArbAfbStart)) * n(st.hkArbAfbPct) / 100));
        const autoKorting = round2(ahk + arb);
        const autoAan = String(st.hkAuto) === '1' || st.hkAuto === true;
        const kortingen = autoAan ? autoKorting : n(st.heffingskortingen);
        // Als auto aanstaat: houd het invoerveld in sync zodat "Opslaan" de gebruikte waarde bewaart
        if (autoAan) { st.heffingskortingen = String(autoKorting); const hkEl = document.querySelector('[data-k="heffingskortingen"]'); if (hkEl && document.activeElement !== hkEl) hkEl.value = autoKorting.toFixed(2); }
        // Totaal
        const voorKorting = round2(belBox1 + belBox2 + belBox3);
        const naKorting = round2(Math.max(0, voorKorting - kortingen));
        const teBetalen = round2(naKorting - n(st.loonheffing));
        const bij = teBetalen >= 0;

        const rij = (l, v, dim) => `<tr><td${dim ? ' class="mut" style="padding-left:24px"' : ''}>${l}</td><td class="num"${dim ? '' : ' style="color:var(--ink)"'}>${euro(v)}</td></tr>`;
        const el = document.getElementById('ib-uitkomst');
        if (el) el.innerHTML = `
          <table><tbody>
            <tr><td style="font-weight:500;color:var(--inkdim)">Box 1 — werk & woning</td><td class="num" style="color:var(--ink)">${euro(belBox1)}</td></tr>
            ${rij('belastbaar inkomen box 1', belastbaar1, true)}
            ${rij('waarvan eigen woning (forfait − rente)', inkomenWoning, true)}
            <tr><td style="font-weight:500;color:var(--inkdim)">Box 2 — aanmerkelijk belang (BV)</td><td class="num" style="color:var(--ink)">${euro(belBox2)}</td></tr>
            <tr><td style="font-weight:500;color:var(--inkdim)">Box 3 — sparen & beleggen</td><td class="num" style="color:var(--ink)">${euro(belBox3)}</td></tr>
            ${rij('rendementsgrondslag', grondslag, true)}
            ${rij(`forfaitair rendement (${(pct * 100).toFixed(2)}%)`, belastbaarRendement, true)}
            <tr style="border-top:1px solid var(--line)"><td style="font-weight:500;color:var(--inkdim)">Belasting vóór heffingskortingen</td><td class="num" style="color:var(--ink)">${euro(voorKorting)}</td></tr>
            ${rij('af: heffingskortingen (' + (autoAan ? 'auto: AHK ' + euro(ahk) + ' + arbeidsk. ' + euro(arb) : 'handmatig') + ')', -kortingen, true)}
            ${rij('af: reeds ingehouden loonheffing', -n(st.loonheffing), true)}
          </tbody>
          <tfoot><tr><td style="font-weight:600;color:var(--ink)">${bij ? 'Naar schatting bij te betalen' : 'Naar schatting terug te ontvangen'}</td><td class="num ${bij ? 'dan' : 'suc'}" style="font-size:18px;font-weight:700">${euro(Math.abs(teBetalen))}</td></tr></tfoot></table>`;
      }

      const veld = (k, label, ph, w) => `<label class="field"><span>${label}</span><input class="num" data-k="${k}" value="${esc(st[k])}" placeholder="${ph || ''}"${w ? ` style="max-width:${w}"` : ''} /></label>`;
      const rcHint = rc !== null
        ? `<div class="help" style="margin-top:8px">Saldo <b>rekening-courant met de BV</b> uit je boekhouding: <b>${euro(rc)}</b>. Heb je een schuld aan je eigen BV, dan telt die mee als box 3-schuld; <b>boven € 500.000</b> geldt de Wet excessief lenen (dan box 2). De zakelijke rente boek je in de BV via Grootboek → <i>Rente r/c</i>.</div>`
        : '';

      view.innerHTML = pageHead('Inkomstenbelasting', `Privé-schatting (DGA) — belastingjaar ${jaar}`,
        `<input type="number" id="ibjaar" value="${jaar}" style="width:96px" title="Belastingjaar" /> <button class="btn btn-brand" id="ibsave">Opslaan</button>`) +
        `<div class="help" style="margin-bottom:16px;border-color:var(--warning);background:rgba(245,158,11,.1)">⚠️ Dit is een <b>indicatieve</b> berekening van je privé-inkomstenbelasting, los van de BV-boekhouding. De tarieven onderaan zijn <b>richtwaarden voor ${jaar}</b> — controleer ze op belastingdienst.nl en laat je aangifte door een adviseur toetsen voordat je hierop vertrouwt.</div>
        <div class="grid grid-3">
          <div style="display:flex;flex-direction:column;gap:16px">
            <div class="card"><div class="card-head">Box 1 — inkomen uit werk & woning</div><div class="card-body" style="display:flex;flex-direction:column;gap:14px">
              <div class="mut" style="font-size:13px">Je DGA-salaris uit de BV (loon), plus je eigen woning: het eigenwoningforfait minus je betaalde hypotheekrente.</div>
              ${veld('loon', 'Bruto loon uit de BV (DGA-salaris)', 'bijv. 56000')}
              ${veld('overigBox1', 'Overig inkomen box 1', '0')}
              <div class="row">${veld('woz', 'WOZ-waarde eigen woning', '0')}${veld('ewfPct', 'Eigenwoningforfait %', '0,35')}</div>
              ${veld('hypotheekrente', 'Betaalde hypotheekrente', '0')}
            </div></div>
            <div class="card"><div class="card-head">Box 2 — aanmerkelijk belang (je BV)</div><div class="card-body" style="display:flex;flex-direction:column;gap:14px">
              <div class="mut" style="font-size:13px">Dividend dat je jezelf vanuit GIBS B.V. uitkeert. Twee schijven (zie tarieven).</div>
              ${veld('dividend', 'Dividend uit de BV', '0')}
            </div></div>
            <div class="card"><div class="card-head">Box 3 — sparen & beleggen</div><div class="card-body" style="display:flex;flex-direction:column;gap:14px">
              <div class="mut" style="font-size:13px">Je privévermogen: spaargeld en beleggingen minus schulden (leningen). Forfaitair belast.</div>
              ${veld('spaargeld', 'Spaargeld / banktegoeden', '0')}
              ${veld('beleggingen', 'Beleggingen / overige bezittingen', '0')}
              ${veld('schulden', 'Schulden (leningen)', '0')}
              ${rcHint}
            </div></div>
            <div class="card"><div class="card-head">Al betaald</div><div class="card-body" style="display:flex;flex-direction:column;gap:14px">
              <div class="mut" style="font-size:13px">De BV houdt al loonheffing in op je salaris. De heffingskortingen (algemene heffingskorting + arbeidskorting) schat de app automatisch op basis van je inkomen — zet het uit om ze zelf in te vullen.</div>
              ${veld('loonheffing', 'Reeds ingehouden loonheffing', '0')}
              <label style="display:flex;gap:8px;align-items:center;font-size:14px;color:var(--inkdim)"><input type="checkbox" id="hkauto" ${String(st.hkAuto) === '1' ? 'checked' : ''} style="width:auto" /> Heffingskortingen automatisch schatten</label>
              <label class="field"><span>Heffingskortingen</span><input class="num" data-k="heffingskortingen" value="${esc(st.heffingskortingen)}" placeholder="0" ${String(st.hkAuto) === '1' ? 'disabled' : ''} /></label>
            </div></div>
          </div>
          <div style="display:flex;flex-direction:column;gap:16px">
            <div class="card"><div class="card-head">Uitkomst (indicatie)</div><div class="card-body"><div id="ib-uitkomst"></div></div></div>
            <div class="card"><div class="card-head">Tarieven ${jaar} — richtwaarden, aanpasbaar</div><div class="card-body" style="display:flex;flex-direction:column;gap:12px;font-size:13px">
              <div class="mut">Box 1 (schijfgrenzen & %):</div>
              <div class="row">${veld('b1s1', 'Grens schijf 1 (€)', '')}${veld('b1t1', 'Tarief 1 (%)', '')}</div>
              <div class="row">${veld('b1s2', 'Grens schijf 2 (€)', '')}${veld('b1t2', 'Tarief 2 (%)', '')}</div>
              ${veld('b1t3', 'Tarief schijf 3 (%)', '')}
              <div class="mut" style="margin-top:6px">Box 2:</div>
              <div class="row">${veld('b2grens', 'Grens (€)', '')}${veld('b2t1', 'Tarief laag (%)', '')}</div>
              ${veld('b2t2', 'Tarief hoog (%)', '')}
              <div class="mut" style="margin-top:6px">Box 3 (forfaits & tarief):</div>
              <div class="row">${veld('b3vrij', 'Heffingsvrij vermogen (€)', '')}${veld('b3schuldDrempel', 'Schulddrempel (€)', '')}</div>
              <div class="row">${veld('b3fSpaar', 'Forfait spaargeld (%)', '')}${veld('b3fBeleg', 'Forfait beleggingen (%)', '')}</div>
              <div class="row">${veld('b3fSchuld', 'Forfait schulden (%)', '')}${veld('b3tarief', 'Box 3-tarief (%)', '')}</div>
              <div class="mut" style="margin-top:6px">Heffingskortingen (auto-schatting):</div>
              <div class="row">${veld('hkAhkMax', 'Alg. heffingskorting max (€)', '')}${veld('hkAhkStart', 'AHK afbouw vanaf (€)', '')}</div>
              ${veld('hkAhkPct', 'AHK afbouw (%)', '')}
              <div class="row">${veld('hkArbMax', 'Arbeidskorting max (€)', '')}${veld('hkArbTop', 'Arbeidsk. top bij (€)', '')}</div>
              <div class="row">${veld('hkArbAfbStart', 'Arbeidsk. afbouw vanaf (€)', '')}${veld('hkArbAfbPct', 'Arbeidsk. afbouw (%)', '')}</div>
            </div></div>
          </div>
        </div>
        ${faqBlock('ib')}`;

      view.querySelectorAll('[data-k]').forEach((el) => el.oninput = () => { st[el.dataset.k] = el.value; bereken(); });
      const hkAutoEl = document.getElementById('hkauto');
      if (hkAutoEl) hkAutoEl.onchange = () => { st.hkAuto = hkAutoEl.checked ? '1' : '0'; const hkEl = document.querySelector('[data-k="heffingskortingen"]'); if (hkEl) hkEl.disabled = hkAutoEl.checked; bereken(); };
      document.getElementById('ibjaar').onchange = (e) => { const j = Number(e.target.value); if (j >= 2000 && j <= 2100) { jaar = j; load(); } };
      document.getElementById('ibsave').onclick = async () => {
        try { await api('ib_opslaan', { jaar, gegevens: st }, 'POST'); toast('IB-gegevens opgeslagen ✓'); } catch (e) { toast(e.message, 'error'); }
      };
      bereken();
    }
    load();
  }

  // ---------------- Pagina: Privé (persoonlijke boekhouding) ----------------
  const PRIVE_REK_SOORT = { bank: 'Betaalrekening', spaar: 'Spaarrekening', contant: 'Contant', bezitting: 'Bezitting', overig: 'Overig' };
  const PRIVE_CAT_SOORT = { inkomst: '<span class="suc">inkomst</span>', uitgave: '<span class="mut">uitgave</span>', neutraal: '<span class="warn">neutraal (overboeking)</span>' };
  let priveJaar = new Date().getFullYear();
  let priveMaandModus = 'jaar';
  const priveTxFilter = { rekening: '', from: '', to: '', categorie: '', ongecategoriseerd: false, onthoud: true };

  async function privOverzicht(view) {
    const laad = () => privOverzicht(view);
    let d;
    try { d = await api('prive_overzicht', { jaar: priveJaar }); } catch (e) { view.innerHTML = `<div class="dan">${esc(e.message)}</div>`; return; }
    const maxCat = Math.max(1, ...d.perCategorie.map((c) => c.bedrag));
    const gedeeld = d.rekeningen.some((r) => r.aandeel < 100);
    view.innerHTML = pageHead('Overzicht', 'Je persoonlijke vermogen en uitgaven — volledig los van de BV.') + `
      <div class="grid grid-4">
        ${stat('Vermogen', euro(d.vermogen), d.vermogen >= 0 ? 'suc' : 'dan')}
        ${stat('Op rekeningen', euro(d.totRekeningen))}
        ${stat('Nog te ontvangen', euro(d.vorderingen), 'suc')}
        ${stat('Nog te betalen', euro(d.schulden), 'dan')}
      </div>
      <div class="page-actions" style="margin:16px 0"><label class="mut" style="font-size:13px">Jaar:</label> <input type="number" id="pjaar" value="${priveJaar}" style="width:96px" /></div>
      <div class="grid grid-2">
        <div class="card"><div class="card-head">Inkomsten & uitgaven ${priveJaar}</div><div class="card-body">
          <div style="display:flex;justify-content:space-between;padding:6px 0"><span>Inkomsten</span><span class="num suc">${euro(d.inkomsten)}</span></div>
          <div style="display:flex;justify-content:space-between;padding:6px 0"><span>Uitgaven</span><span class="num dan">${euro(d.uitgaven)}</span></div>
          <div style="display:flex;justify-content:space-between;padding:8px 0 0;border-top:1px solid var(--line);font-weight:600"><span>Saldo</span><span class="num ${round2(d.inkomsten + d.uitgaven) >= 0 ? 'suc' : 'dan'}">${euro(round2(d.inkomsten + d.uitgaven))}</span></div>
        </div></div>
        <div class="card"><div class="card-head">Rekeningen</div><table class="compact"><tbody>${d.rekeningen.length ? d.rekeningen.map((r) => `<tr><td>${esc(r.naam)} <span class="badge">${PRIVE_REK_SOORT[r.soort] || r.soort}</span>${r.aandeel < 100 ? ` <span class="badge" style="color:var(--warning)">${r.aandeel}%</span>` : ''}</td><td class="num" style="color:var(--ink)">${euro(r.saldo)}${r.aandeel < 100 ? `<div class="mut" style="font-size:11px">jouw deel ${euro(r.aandeelSaldo)}</div>` : ''}</td></tr>`).join('') : '<tr><td class="empty">Nog geen rekeningen.</td></tr>'}</tbody></table></div>
      </div>
      <div class="card" style="margin-top:16px"><div class="card-head">Uitgaven per categorie ${priveJaar}</div><div class="card-body" style="display:flex;flex-direction:column;gap:10px">
        ${d.perCategorie.length ? d.perCategorie.map((c) => `<div><div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:3px"><span>${esc(c.naam)}</span><span class="num">${euro(c.bedrag)}</span></div><div style="background:var(--surface2);border-radius:4px;height:8px;overflow:hidden"><div style="width:${Math.round(c.bedrag / maxCat * 100)}%;height:100%;background:var(--brand)"></div></div></div>`).join('') : '<div class="mut">Nog geen uitgaven in deze periode.</div>'}
        ${gedeeld ? '<div class="mut" style="font-size:12px;margin-top:4px">Bedragen van gedeelde rekeningen tellen voor jouw aandeel mee (bv. 50%).</div>' : ''}
      </div></div>
      ${faqBlock('prive')}`;
    document.getElementById('pjaar').onchange = (e) => { const j = Number(e.target.value); if (j >= 2000 && j <= 2100) { priveJaar = j; laad(); } };
  }

  async function privMaand(view) {
    const laad = () => privMaand(view);
    let d, dPrev = null;
    try {
      d = await api('prive_maandcijfers', { jaar: priveJaar });
      if (priveMaandModus === 'jaar') dPrev = await api('prive_maandcijfers', { jaar: priveJaar - 1 });
    } catch (e) { view.innerHTML = `<div class="dan">${esc(e.message)}</div>`; return; }
    const M = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
    const cel = (v) => `<td class="num ${v < 0 ? 'dan' : v > 0 ? 'suc' : 'mut'}">${v ? euro0(v) : '·'}</td>`;
    const rij = (naam, arr, totaal, cls) => `<tr><td style="${cls || ''}white-space:nowrap">${naam}</td>${arr.map(cel).join('')}<td class="num" style="font-weight:600;color:var(--ink)">${totaal ? euro0(totaal) : '·'}</td></tr>`;

    let series;
    if (priveMaandModus === 'jaar') {
      series = [{ naam: priveJaar + ' uitgaven', kleur: CHART_KLEUREN[0], waarden: d.uitgavenPerMaand.map((v) => Math.abs(v)) }];
      if (dPrev) series.push({ naam: (priveJaar - 1) + ' uitgaven', kleur: '#94a3b8', waarden: dPrev.uitgavenPerMaand.map((v) => Math.abs(v)) });
    } else {
      series = d.categorieen.filter((c) => c.totaal < 0).slice(0, 6).map((c, i) => ({ naam: c.naam, kleur: CHART_KLEUREN[i % CHART_KLEUREN.length], waarden: c.perMaand.map((v) => Math.abs(v)) }));
    }
    const heeftData = series.some((s) => s.waarden.some((v) => v > 0));

    view.innerHTML = pageHead('Per maand', 'Vergelijk je uitgaven en inkomsten maand voor maand.') + `
      <div class="page-actions" style="margin-bottom:16px;gap:12px;flex-wrap:wrap">
        <div class="tabs" style="display:flex;gap:8px"><button data-mm="jaar" class="${priveMaandModus === 'jaar' ? 'active' : ''}">Jaar-op-jaar</button><button data-mm="cat" class="${priveMaandModus === 'cat' ? 'active' : ''}">Per categorie</button></div>
        <label class="mut" style="font-size:13px;display:flex;align-items:center;gap:6px">Jaar: <input type="number" id="pjaar" value="${priveJaar}" style="width:96px" /></label>
      </div>
      <div class="card" style="margin-bottom:16px"><div class="card-head">${priveMaandModus === 'jaar' ? 'Uitgaven per maand — ' + priveJaar + ' vs ' + (priveJaar - 1) : 'Uitgaven per categorie — ' + priveJaar}</div>
        <div class="card-body">${heeftData ? lineChart(series) : '<div class="mut">Geen uitgaven in deze periode.</div>'}</div></div>
      <div class="card" style="overflow:hidden"><div style="overflow-x:auto"><table class="compact">
        <thead><tr><th>Categorie</th>${M.map((m) => `<th class="r">${m}</th>`).join('')}<th class="r">Totaal</th></tr></thead>
        <tbody>
        ${d.categorieen.length ? d.categorieen.map((c) => rij(esc(c.naam), c.perMaand, c.totaal, 'color:var(--ink);')).join('') : `<tr><td colspan="14" class="empty">Geen transacties in ${priveJaar}.</td></tr>`}
        </tbody>
        <tfoot>
          ${rij('Uitgaven', d.uitgavenPerMaand, d.totaalUitgaven, 'font-weight:600;color:var(--inkdim);')}
          ${rij('Inkomsten', d.inkomstenPerMaand, d.totaalInkomsten, 'font-weight:600;color:var(--inkdim);')}
          ${rij('Saldo', d.saldoPerMaand, round2(d.totaalInkomsten + d.totaalUitgaven), 'font-weight:600;color:var(--inkdim);')}
        </tfoot>
      </table></div></div>
      <div class="mut" style="font-size:12px;margin-top:10px">Bedragen zijn gewogen naar het aandeel van de rekening (een gedeelde rekening telt voor jouw deel). <span class="dan">Rood</span> = uitgave, <span class="suc">groen</span> = inkomst.</div>`;
    view.querySelectorAll('[data-mm]').forEach((b) => b.onclick = () => { priveMaandModus = b.dataset.mm; laad(); });
    document.getElementById('pjaar').onchange = (e) => { const j = Number(e.target.value); if (j >= 2000 && j <= 2100) { priveJaar = j; laad(); } };
  }

  async function privRekeningen(view) {
    const laad = () => privRekeningen(view);
    let rek;
    try { rek = await api('prive_rekeningen'); } catch (e) { view.innerHTML = `<div class="dan">${esc(e.message)}</div>`; return; }
    view.innerHTML = pageHead('Rekeningen', 'Je privérekeningen, saldo en bankimport.', `<button class="btn btn-brand" id="nieuwRek">+ Rekening</button>`) +
      `<div class="help" style="margin-bottom:16px">Maak per rekening een regel aan (met <b>beginsaldo</b>) en klik <b>importeer</b> voor je afschrift — <b>ING CSV</b> (<code>.csv</code>) of <b>MT940</b> (<code>.sta</code>, o.a. bunq) worden automatisch herkend. Er worden <b>alleen nieuwe betalingen</b> toegevoegd; dubbele (bij een zelfde of overlappend bestand) worden automatisch genegeerd. Ook bezittingen (auto, beleggingen) kun je als rekening toevoegen. Bij een <b>gedeelde rekening</b> zet je je <b>aandeel</b> (bv. 50%) — dan telt alleen jouw deel mee in je vermogen en uitgaven.</div>
        <div class="card"><table class="compact"><thead><tr><th>Naam</th><th>Soort</th><th>IBAN</th><th class="r">Aandeel</th><th class="r">Saldo</th><th></th></tr></thead><tbody>
        ${rek.length ? rek.map((r) => `<tr><td style="color:var(--ink)">${esc(r.naam)}</td><td>${PRIVE_REK_SOORT[r.soort] || r.soort}</td><td class="mut">${esc(r.iban || '')}</td><td class="num">${r.aandeel}%</td><td class="num" style="color:var(--ink)">${euro(r.saldo)}${r.aandeel < 100 ? `<div class="mut" style="font-size:11px">jouw deel ${euro(r.aandeelSaldo)}</div>` : ''}</td>
          <td class="r" style="white-space:nowrap">${(r.soort === 'bank' || r.soort === 'spaar') ? `<button class="btn btn-success" data-imp="${r.id}" style="padding:4px 10px">importeer</button> ` : ''}<button class="linkbtn" data-edit="${r.id}">bewerken</button> <button class="linkbtn del" data-del="${r.id}">✕</button></td></tr>`).join('') : '<tr><td colspan="6" class="empty">Nog geen rekeningen.</td></tr>'}
        </tbody></table></div>
        <input type="file" id="mtfile" accept=".sta,.csv,.txt,text/plain" style="display:none" />`;
    document.getElementById('nieuwRek').onclick = () => openPriveRekening(null, laad);
    view.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => openPriveRekening(rek.find((x) => x.id === Number(b.dataset.edit)), laad));
    view.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => { if (!confirm('Rekening én alle bijbehorende transacties verwijderen?')) return; try { await api('prive_rekening_verwijder', { id: Number(b.dataset.del) }, 'POST'); toast('Verwijderd'); laad(); } catch (e) { toast(e.message, 'error'); } });
    const mtfile = document.getElementById('mtfile'); let impRek = 0;
    view.querySelectorAll('[data-imp]').forEach((b) => b.onclick = () => { impRek = Number(b.dataset.imp); mtfile.click(); });
    mtfile.onchange = async () => { const f = mtfile.files[0]; if (!f) return; try { const tekst = await f.text(); const r = await api('prive_bank_import', { rekeningId: impRek, bestand: tekst }, 'POST'); const m = importMelding(r); toast(m.tekst, m.type); laad(); } catch (e) { toast(e.message, 'error'); } finally { mtfile.value = ''; } };
  }

  async function privTransacties(view) {
    const laad = () => privTransacties(view);
    let rek, cats, tx;
    try {
      [rek, cats] = await Promise.all([api('prive_rekeningen'), api('prive_categorieen')]);
      tx = await api('prive_transacties', { rekening: priveTxFilter.rekening, from: priveTxFilter.from, to: priveTxFilter.to, categorie: priveTxFilter.categorie, ongecategoriseerd: priveTxFilter.ongecategoriseerd ? 1 : '' });
    } catch (e) { view.innerHTML = `<div class="dan">${esc(e.message)}</div>`; return; }
    const catOpts = (sel) => '<option value="">—</option>' + cats.map((c) => `<option value="${c.id}" ${Number(sel) === c.id ? 'selected' : ''}>${esc(c.naam)}</option>`).join('');
    view.innerHTML = pageHead('Transacties', 'Al je privéboekingen — wijs categorieën toe om je uitgaven te volgen.', `<button class="btn btn-brand" id="nieuwTx">+ Transactie</button>`) + `
      <div class="page-actions" style="margin-bottom:12px;flex-wrap:wrap;gap:8px">
        <select id="fRek" style="width:auto"><option value="">Alle rekeningen</option>${rek.map((r) => `<option value="${r.id}" ${String(priveTxFilter.rekening) === String(r.id) ? 'selected' : ''}>${esc(r.naam)}</option>`).join('')}</select>
        <select id="fCat" style="width:auto"><option value="">Alle categorieën</option><option value="__leeg" ${priveTxFilter.ongecategoriseerd ? 'selected' : ''}>— zonder categorie —</option>${cats.map((c) => `<option value="${c.id}" ${String(priveTxFilter.categorie) === String(c.id) ? 'selected' : ''}>${esc(c.naam)}</option>`).join('')}</select>
        <input type="date" id="fFrom" value="${priveTxFilter.from}" style="width:auto" /><span class="mut">t/m</span><input type="date" id="fTo" value="${priveTxFilter.to}" style="width:auto" />
        <label class="mut" style="font-size:13px;display:flex;align-items:center;gap:6px"><input type="checkbox" id="onthoud" ${priveTxFilter.onthoud ? 'checked' : ''} style="width:auto" /> onthoud categorie</label>
      </div>
      <div class="card" style="overflow:hidden"><div style="overflow-x:auto"><table class="compact"><thead><tr><th>Datum</th><th>Rekening</th><th>Tegenpartij</th><th>Omschrijving</th><th>Categorie</th><th class="r">Bedrag</th><th></th></tr></thead><tbody>
      ${tx.length ? tx.map((t) => `<tr>
        <td class="num" style="text-align:left">${datumNL(t.datum)}</td>
        <td class="mut">${esc(t.rekening_naam || '')}</td>
        <td title="${esc(t.tegenrekening_naam || '')}" style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.tegenrekening_naam || '—')}</td>
        <td title="${esc(t.omschrijving || '')}" style="max-width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.omschrijving || '')}</td>
        <td><select data-txcat="${t.id}" style="min-width:150px">${catOpts(t.categorie_id)}</select></td>
        <td class="num ${t.bedrag >= 0 ? 'suc' : 'dan'}" style="font-weight:500">${euro(t.bedrag)}</td>
        <td class="r" style="white-space:nowrap">${t.koppel_id ? '<span class="mut" title="Overboeking naar een eigen rekening — tegenkant is geboekt">⇄ overboeking</span> ' : `<button class="linkbtn" data-rek="${t.id}" title="Dit is een overboeking naar een eigen rekening (contant, spaar, gezamenlijk)">overboeking</button> `}<button class="linkbtn" data-edit="${t.id}">✎</button> <button class="linkbtn del" data-del="${t.id}">🗑</button></td></tr>`).join('') : '<tr><td colspan="7" class="empty">Geen transacties. Importeer een afschrift (Rekeningen) of voeg er handmatig een toe.</td></tr>'}
      </tbody></table></div></div>`;
    document.getElementById('fRek').onchange = (e) => { priveTxFilter.rekening = e.target.value; laad(); };
    document.getElementById('fCat').onchange = (e) => { const v = e.target.value; if (v === '__leeg') { priveTxFilter.ongecategoriseerd = true; priveTxFilter.categorie = ''; } else { priveTxFilter.ongecategoriseerd = false; priveTxFilter.categorie = v; } laad(); };
    document.getElementById('fFrom').onchange = (e) => { priveTxFilter.from = e.target.value; laad(); };
    document.getElementById('fTo').onchange = (e) => { priveTxFilter.to = e.target.value; laad(); };
    document.getElementById('onthoud').onchange = (e) => { priveTxFilter.onthoud = e.target.checked; };
    document.getElementById('nieuwTx').onclick = () => openPriveTransactie(null, rek, cats, laad);
    view.querySelectorAll('[data-rek]').forEach((b) => b.onclick = () => openPriveKoppelRekening(tx.find((x) => x.id === Number(b.dataset.rek)), rek, laad));
    view.querySelectorAll('[data-txcat]').forEach((sel) => sel.onchange = async () => { try { await api('prive_transactie_categorie', { id: Number(sel.dataset.txcat), categorieId: Number(sel.value) || 0, onthoud: priveTxFilter.onthoud }, 'POST'); toast('Categorie opgeslagen'); } catch (e) { toast(e.message, 'error'); } });
    view.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => openPriveTransactie(tx.find((x) => x.id === Number(b.dataset.edit)), rek, cats, laad));
    view.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => { if (!confirm('Transactie verwijderen?')) return; try { await api('prive_transactie_verwijder', { id: Number(b.dataset.del) }, 'POST'); toast('Verwijderd'); laad(); } catch (e) { toast(e.message, 'error'); } });
  }

  async function privPosten(view) {
    const laad = () => privPosten(view);
    let posten;
    try { posten = await api('prive_posten'); } catch (e) { view.innerHTML = `<div class="dan">${esc(e.message)}</div>`; return; }
    const soortLbl = (s) => s === 'vordering' ? '<span class="suc">te ontvangen</span>' : '<span class="dan">te betalen</span>';
    view.innerHTML = pageHead('Te ontvangen / betalen', 'Openstaande bedragen die je nog krijgt of moet betalen.', `<button class="btn btn-brand" id="nieuwPost">+ Post</button>`) +
      `<div class="help" style="margin-bottom:16px">Leg vast wat je nog moet <b>ontvangen</b> (bv. een lening die je hebt gegeven) of <b>betalen</b> (bv. een lening/schuld). <b>Open</b> posten tellen mee in je vermogen; is het afgelost, zet je 'm op afgehandeld.</div>
        <div class="card"><table class="compact"><thead><tr><th>Naam</th><th>Tegenpartij</th><th>Soort</th><th class="r">Bedrag</th><th>Vervalt</th><th>Status</th><th></th></tr></thead><tbody>
        ${posten.length ? posten.map((p) => `<tr style="${p.status === 'afgehandeld' ? 'opacity:.55' : ''}">
          <td style="color:var(--ink)">${esc(p.naam)}${p.toelichting ? `<div class="mut" style="font-size:12px">${esc(p.toelichting)}</div>` : ''}</td>
          <td class="mut">${esc(p.tegenpartij || '')}</td>
          <td>${soortLbl(p.soort)}</td>
          <td class="num" style="color:var(--ink)">${euro(p.bedrag)}</td>
          <td class="mut">${p.vervaldatum ? datumNL(p.vervaldatum) : ''}</td>
          <td>${p.status === 'open' ? '<span class="badge" style="color:var(--warning)">open</span>' : '<span class="badge">afgehandeld</span>'}</td>
          <td class="r" style="white-space:nowrap">${p.status === 'open' ? `<button class="linkbtn" data-af="${p.id}">afhandelen</button> ` : `<button class="linkbtn" data-her="${p.id}">heropenen</button> `}<button class="linkbtn" data-edit="${p.id}">✎</button> <button class="linkbtn del" data-del="${p.id}">✕</button></td></tr>`).join('') : '<tr><td colspan="7" class="empty">Nog geen posten.</td></tr>'}
        </tbody></table></div>`;
    document.getElementById('nieuwPost').onclick = () => openPrivePost(null, laad);
    view.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => openPrivePost(posten.find((x) => x.id === Number(b.dataset.edit)), laad));
    view.querySelectorAll('[data-af]').forEach((b) => b.onclick = async () => { await api('prive_post_status', { id: Number(b.dataset.af), status: 'afgehandeld' }, 'POST'); laad(); });
    view.querySelectorAll('[data-her]').forEach((b) => b.onclick = async () => { await api('prive_post_status', { id: Number(b.dataset.her), status: 'open' }, 'POST'); laad(); });
    view.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => { if (!confirm('Post verwijderen?')) return; await api('prive_post_verwijder', { id: Number(b.dataset.del) }, 'POST'); laad(); });
  }

  async function privCategorieen(view) {
    const laad = () => privCategorieen(view);
    let cats, regels;
    try { [cats, regels] = await Promise.all([api('prive_categorieen'), api('prive_regels')]); } catch (e) { view.innerHTML = `<div class="dan">${esc(e.message)}</div>`; return; }
    view.innerHTML = pageHead('Categorieën', 'Groepeer je uitgaven en inkomsten.', `<button class="btn btn-brand" id="nieuwCat">+ Categorie</button>`) +
      `<div class="help" style="margin-bottom:16px">Categorieën bepalen hoe je uitgaven en inkomsten worden gegroepeerd. Wijs ze toe bij Transacties; met "onthoud" leert de app ze automatisch toe te kennen bij een volgende import.</div>
        <div class="card"><table class="compact"><thead><tr><th>Categorie</th><th>Soort</th><th></th></tr></thead><tbody>
        ${cats.map((c) => `<tr><td style="color:var(--ink)">${esc(c.naam)}</td><td>${PRIVE_CAT_SOORT[c.soort] || esc(c.soort)}</td><td class="r"><button class="linkbtn" data-edit="${c.id}">bewerken</button> <button class="linkbtn del" data-del="${c.id}">✕</button></td></tr>`).join('')}
        </tbody></table></div>
        <div class="card" style="margin-top:24px"><div class="card-head"><span>Automatische regels</span><div style="display:flex;gap:8px"><button class="btn btn-ghost" id="pasToe">Regels toepassen</button><button class="btn btn-brand" id="nieuwRegel">+ Regel</button></div></div>
          <div class="mut" style="padding:12px 20px 0;font-size:12px;line-height:1.5">Een regel koppelt een <b style="color:var(--inkdim)">zoekterm</b> (die in de tegenpartij of omschrijving voorkomt) aan een categorie, zodat transacties bij import automatisch worden gecategoriseerd. Deze regels ontstaan ook vanzelf als je bij een transactie "onthoud" aanvinkt. <b style="color:var(--inkdim)">Regels toepassen</b> categoriseert bestaande, nog ongecategoriseerde transacties alsnog.</div>
          <table class="compact"><thead><tr><th>Zoekterm</th><th>Categorie</th><th></th></tr></thead><tbody>
          ${regels.length ? regels.map((r) => `<tr><td style="color:var(--ink)">${esc(r.zoekterm)}</td><td>${esc(r.categorie_naam)}</td><td class="r"><button class="linkbtn" data-regel-edit="${r.id}">bewerken</button> <button class="linkbtn del" data-regel-del="${r.id}">✕</button></td></tr>`).join('') : '<tr><td colspan="3" class="empty">Nog geen regels.</td></tr>'}
          </tbody></table></div>`;
    document.getElementById('nieuwCat').onclick = () => openPriveCategorie(null, laad);
    view.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => openPriveCategorie(cats.find((x) => x.id === Number(b.dataset.edit)), laad));
    view.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => { if (!confirm('Categorie verwijderen? Transacties blijven bestaan maar verliezen deze categorie.')) return; await api('prive_categorie_verwijder', { id: Number(b.dataset.del) }, 'POST'); laad(); });
    document.getElementById('nieuwRegel').onclick = () => openPriveRegel(null, cats, laad);
    view.querySelectorAll('[data-regel-edit]').forEach((b) => b.onclick = () => openPriveRegel(regels.find((x) => x.id === Number(b.dataset.regelEdit)), cats, laad));
    view.querySelectorAll('[data-regel-del]').forEach((b) => b.onclick = async () => { if (!confirm('Regel verwijderen?')) return; await api('prive_regel_verwijder', { id: Number(b.dataset.regelDel) }, 'POST'); laad(); });
    document.getElementById('pasToe').onclick = async () => { try { const r = await api('prive_regels_toepassen', {}, 'POST'); toast(`${r.bijgewerkt} transactie(s) gecategoriseerd`); laad(); } catch (e) { toast(e.message, 'error'); } };
  }

  function openPriveRegel(regel, cats, refresh) {
    const ov = document.createElement('div'); ov.className = 'overlay'; document.body.appendChild(ov);
    const close = () => ov.remove();
    ov.innerHTML = `<div class="modal sm"><div class="modal-head"><h2>${regel ? 'Regel bewerken' : 'Nieuwe regel'}</h2><button class="x">✕</button></div>
      <div class="modal-body">
        <div class="help">Komt de <b>zoekterm</b> voor in de tegenpartij of omschrijving van een transactie, dan krijgt die automatisch de gekozen categorie. Hoofdletters maken niet uit. Houd de zoekterm generiek (bv. <code>Albert Heijn</code>, niet met filiaalnummer).</div>
        <label class="field"><span>Zoekterm</span><input id="zoek" value="${esc(regel ? regel.zoekterm : '')}" placeholder="bijv. Albert Heijn" /></label>
        <label class="field"><span>Categorie</span><select id="cat"><option value="">— kies —</option>${cats.map((c) => `<option value="${c.id}" ${regel && regel.categorie_id === c.id ? 'selected' : ''}>${esc(c.naam)}</option>`).join('')}</select></label>
      </div>
      <div class="modal-foot"><button class="btn btn-ghost" id="annuleer">Annuleren</button><button class="btn btn-brand" id="opslaan">Opslaan</button></div></div>`;
    ov.querySelector('.x').onclick = close; ov.querySelector('#annuleer').onclick = close;
    ov.querySelector('#opslaan').onclick = async () => {
      const body = { id: regel ? regel.id : 0, zoekterm: ov.querySelector('#zoek').value, categorieId: Number(ov.querySelector('#cat').value) || 0 };
      if (!body.zoekterm.trim()) return toast('Zoekterm is verplicht', 'error');
      if (!body.categorieId) return toast('Kies een categorie', 'error');
      try { await api('prive_regel_opslaan', body, 'POST'); toast('Opgeslagen ✓'); close(); refresh(); } catch (e) { toast(e.message, 'error'); }
    };
  }

  function openPriveRekening(rek, refresh) {
    const st = { id: rek ? rek.id : 0, soort: rek ? rek.soort : 'bank' };
    const ov = document.createElement('div'); ov.className = 'overlay'; document.body.appendChild(ov);
    const close = () => ov.remove();
    ov.innerHTML = `<div class="modal sm"><div class="modal-head"><h2>${rek ? 'Rekening bewerken' : 'Nieuwe rekening'}</h2><button class="x">✕</button></div>
      <div class="modal-body">
        <label class="field"><span>Naam</span><input id="naam" value="${esc(rek ? rek.naam : '')}" placeholder="bijv. bunq privé" /></label>
        <div class="row">
          <label class="field"><span>Soort</span><select id="soort">${Object.entries(PRIVE_REK_SOORT).map(([v, l]) => `<option value="${v}" ${st.soort === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label class="field"><span>IBAN (optioneel)</span><input id="iban" value="${esc(rek ? (rek.iban || '') : '')}" /></label>
        </div>
        <div class="row">
          <label class="field"><span>Beginsaldo</span><input class="num" id="begin" value="${esc(rek ? rek.beginsaldo : '')}" placeholder="0,00" /></label>
          <label class="field"><span>Jouw aandeel (%)</span><input class="num" id="aandeel" value="${esc(rek ? rek.aandeel : 100)}" placeholder="100" /></label>
        </div>
        <div class="mut" style="font-size:12px"><b>Beginsaldo</b> = het saldo vóór de eerste transactie die je importeert/invoert (bij een bezitting: de waarde). <b>Aandeel</b> = jouw deel bij een gedeelde rekening (bv. een gezamenlijke kinderrekening op <b>50</b>). Alleen jouw deel telt mee in je vermogen en uitgaven; je ziet wél alle transacties.</div>
      </div>
      <div class="modal-foot"><button class="btn btn-ghost" id="annuleer">Annuleren</button><button class="btn btn-brand" id="opslaan">Opslaan</button></div></div>`;
    ov.querySelector('.x').onclick = close; ov.querySelector('#annuleer').onclick = close;
    ov.querySelector('#opslaan').onclick = async () => {
      const body = { id: st.id, naam: ov.querySelector('#naam').value, soort: ov.querySelector('#soort').value, iban: ov.querySelector('#iban').value, beginsaldo: ov.querySelector('#begin').value, aandeel: ov.querySelector('#aandeel').value };
      if (!body.naam.trim()) return toast('Naam is verplicht', 'error');
      try { await api('prive_rekening_opslaan', body, 'POST'); toast('Opgeslagen ✓'); close(); refresh(); } catch (e) { toast(e.message, 'error'); }
    };
  }

  function openPriveTransactie(tx, rek, cats, refresh) {
    const st = { id: tx ? tx.id : 0, richting: tx ? (tx.bedrag >= 0 ? 'inkomst' : 'uitgave') : 'uitgave' };
    const ov = document.createElement('div'); ov.className = 'overlay'; document.body.appendChild(ov);
    const close = () => ov.remove();
    function render() {
      ov.innerHTML = `<div class="modal sm"><div class="modal-head"><h2>${tx ? 'Transactie bewerken' : 'Nieuwe transactie'}</h2><button class="x">✕</button></div>
        <div class="modal-body">
          <label class="field"><span>Rekening</span><select id="rek">${rek.map((r) => `<option value="${r.id}" ${(tx ? tx.rekening_id : (rek[0] || {}).id) === r.id ? 'selected' : ''}>${esc(r.naam)}</option>`).join('')}</select></label>
          <div class="toggle"><button data-r="uitgave" class="${st.richting === 'uitgave' ? 'active' : ''}">Uitgave (−)</button><button data-r="inkomst" class="${st.richting === 'inkomst' ? 'active' : ''}">Inkomst (+)</button></div>
          <div class="row">
            <label class="field"><span>Datum</span><input type="date" id="datum" value="${esc(tx ? tx.datum : vandaag())}" /></label>
            <label class="field"><span>Bedrag</span><input class="num" id="bedrag" value="${esc(tx ? Math.abs(tx.bedrag) : '')}" placeholder="0,00" /></label>
          </div>
          <label class="field"><span>Tegenpartij</span><input id="tp" value="${esc(tx ? (tx.tegenrekening_naam || '') : '')}" /></label>
          <label class="field"><span>Omschrijving</span><input id="oms" value="${esc(tx ? (tx.omschrijving || '') : '')}" /></label>
          <label class="field"><span>Categorie</span><select id="cat"><option value="">—</option>${cats.map((c) => `<option value="${c.id}" ${tx && tx.categorie_id === c.id ? 'selected' : ''}>${esc(c.naam)}</option>`).join('')}</select></label>
        </div>
        <div class="modal-foot"><button class="btn btn-ghost" id="annuleer">Annuleren</button><button class="btn btn-brand" id="opslaan">Opslaan</button></div></div>`;
      ov.querySelector('.x').onclick = close; ov.querySelector('#annuleer').onclick = close;
      ov.querySelectorAll('[data-r]').forEach((b) => b.onclick = () => { st.richting = b.dataset.r; render(); });
      ov.querySelector('#opslaan').onclick = async () => {
        const bedrag = Number(String(ov.querySelector('#bedrag').value).replace(',', '.')) || 0;
        if (!(bedrag > 0)) return toast('Vul een bedrag groter dan 0 in', 'error');
        const body = { id: st.id, rekeningId: Number(ov.querySelector('#rek').value), datum: ov.querySelector('#datum').value, bedrag: st.richting === 'uitgave' ? -bedrag : bedrag, tegenrekeningNaam: ov.querySelector('#tp').value, omschrijving: ov.querySelector('#oms').value, categorieId: Number(ov.querySelector('#cat').value) || 0 };
        try { await api('prive_transactie_opslaan', body, 'POST'); toast('Opgeslagen ✓'); close(); refresh(); } catch (e) { toast(e.message, 'error'); }
      };
    }
    render();
  }

  function openPriveKoppelRekening(tx, rek, refresh) {
    if (!tx) return;
    const doelen = rek.filter((r) => r.id !== tx.rekening_id);
    if (!doelen.length) { toast('Maak eerst de andere rekening aan (bv. een contant- of spaarrekening) via de tab Rekeningen', 'error'); return; }
    const inkomend = tx.bedrag >= 0;
    const ov = document.createElement('div'); ov.className = 'overlay'; document.body.appendChild(ov);
    const close = () => ov.remove();
    ov.innerHTML = `<div class="modal sm"><div class="modal-head"><h2>Overboeking naar eigen rekening</h2><button class="x">✕</button></div>
      <div class="modal-body">
        <div class="help">Deze boeking van <b>${euro(Math.abs(tx.bedrag))}</b> is een overboeking naar een andere eigen rekening. Kies welke — daar wordt de tegenkant automatisch geboekt (${inkomend ? '−' : '+'} ${euro(Math.abs(tx.bedrag))}), zodat beide saldo's kloppen. De boeking telt dan niet meer mee als uitgave/inkomst.</div>
        <label class="field"><span>Naar welke rekening?</span><select id="doel">${doelen.map((r) => `<option value="${r.id}">${esc(r.naam)}${r.soort === 'contant' ? ' (contant)' : ''}</option>`).join('')}</select></label>
      </div>
      <div class="modal-foot"><button class="btn btn-ghost" id="annuleer">Annuleren</button><button class="btn btn-brand" id="opslaan">Klaar</button></div></div>`;
    ov.querySelector('.x').onclick = close; ov.querySelector('#annuleer').onclick = close;
    ov.querySelector('#opslaan').onclick = async () => {
      try { await api('prive_transactie_koppel_rekening', { id: tx.id, doelRekeningId: Number(ov.querySelector('#doel').value) }, 'POST'); toast('Overboeking geboekt ✓'); close(); refresh(); } catch (e) { toast(e.message, 'error'); }
    };
  }

  function openPrivePost(post, refresh, prefill) {
    const src = post || prefill || {};
    const st = { id: post ? post.id : 0, soort: src.soort || 'vordering' };
    const ov = document.createElement('div'); ov.className = 'overlay'; document.body.appendChild(ov);
    const close = () => ov.remove();
    function render() {
      ov.innerHTML = `<div class="modal sm"><div class="modal-head"><h2>${post ? 'Post bewerken' : 'Nieuwe post'}</h2><button class="x">✕</button></div>
        <div class="modal-body">
          <div class="toggle"><button data-s="vordering" class="${st.soort === 'vordering' ? 'active' : ''}">Te ontvangen</button><button data-s="schuld" class="${st.soort === 'schuld' ? 'active' : ''}">Te betalen</button></div>
          <div class="help">${st.soort === 'vordering' ? 'Een <b>vordering</b>: geld dat je nog krijgt (bv. een lening die je gaf). Telt <b>plus</b> in je vermogen.' : 'Een <b>schuld</b>: geld dat je nog moet betalen (bv. een lening of RC-opname uit je BV). Telt <b>min</b> in je vermogen.'}</div>
          <label class="field"><span>Naam</span><input id="naam" value="${esc(src.naam || '')}" placeholder="bijv. Lening aan broer" /></label>
          <div class="row">
            <label class="field"><span>Bedrag</span><input class="num" id="bedrag" value="${esc(src.bedrag != null ? src.bedrag : '')}" placeholder="0,00" /></label>
            <label class="field"><span>Tegenpartij</span><input id="tp" value="${esc(src.tegenpartij || '')}" /></label>
          </div>
          <div class="row">
            <label class="field"><span>Datum</span><input type="date" id="datum" value="${esc(src.datum || '')}" /></label>
            <label class="field"><span>Vervaldatum</span><input type="date" id="verval" value="${esc(src.vervaldatum || '')}" /></label>
          </div>
          <label class="field"><span>Toelichting</span><input id="toel" value="${esc(src.toelichting || '')}" /></label>
        </div>
        <div class="modal-foot"><button class="btn btn-ghost" id="annuleer">Annuleren</button><button class="btn btn-brand" id="opslaan">Opslaan</button></div></div>`;
      ov.querySelector('.x').onclick = close; ov.querySelector('#annuleer').onclick = close;
      ov.querySelectorAll('[data-s]').forEach((b) => b.onclick = () => { st.soort = b.dataset.s; render(); });
      ov.querySelector('#opslaan').onclick = async () => {
        const body = { id: st.id, soort: st.soort, naam: ov.querySelector('#naam').value, bedrag: ov.querySelector('#bedrag').value, tegenpartij: ov.querySelector('#tp').value, datum: ov.querySelector('#datum').value, vervaldatum: ov.querySelector('#verval').value, toelichting: ov.querySelector('#toel').value, status: post ? post.status : 'open' };
        if (!body.naam.trim()) return toast('Naam is verplicht', 'error');
        try { await api('prive_post_opslaan', body, 'POST'); toast('Opgeslagen ✓'); close(); refresh(); } catch (e) { toast(e.message, 'error'); }
      };
    }
    render();
  }

  function openPriveCategorie(cat, refresh) {
    const st = { id: cat ? cat.id : 0, soort: cat ? cat.soort : 'uitgave' };
    const ov = document.createElement('div'); ov.className = 'overlay'; document.body.appendChild(ov);
    const close = () => ov.remove();
    function render() {
      ov.innerHTML = `<div class="modal sm"><div class="modal-head"><h2>${cat ? 'Categorie bewerken' : 'Nieuwe categorie'}</h2><button class="x">✕</button></div>
        <div class="modal-body">
          <label class="field"><span>Naam</span><input id="naam" value="${esc(cat ? cat.naam : '')}" /></label>
          <div class="toggle"><button data-s="uitgave" class="${st.soort === 'uitgave' ? 'active' : ''}">Uitgave</button><button data-s="inkomst" class="${st.soort === 'inkomst' ? 'active' : ''}">Inkomst</button><button data-s="neutraal" class="${st.soort === 'neutraal' ? 'active' : ''}">Neutraal</button></div>
          ${st.soort === 'neutraal' ? '<div class="help">Een <b>neutrale</b> categorie is voor overboekingen die géén echt inkomen of uitgave zijn: geld van je spaarrekening, opname uit een bouwdepot, RC-opname uit je BV, of een ontvangen/gegeven lening. Deze tellen niet mee in je inkomsten/uitgaven, maar werken je banksaldo wél bij.</div>' : ''}
        </div>
        <div class="modal-foot"><button class="btn btn-ghost" id="annuleer">Annuleren</button><button class="btn btn-brand" id="opslaan">Opslaan</button></div></div>`;
      ov.querySelector('.x').onclick = close; ov.querySelector('#annuleer').onclick = close;
      ov.querySelectorAll('[data-s]').forEach((b) => b.onclick = () => { st.soort = b.dataset.s; render(); });
      ov.querySelector('#opslaan').onclick = async () => {
        const body = { id: st.id, naam: ov.querySelector('#naam').value, soort: st.soort };
        if (!body.naam.trim()) return toast('Naam is verplicht', 'error');
        try { await api('prive_categorie_opslaan', body, 'POST'); toast('Opgeslagen ✓'); close(); refresh(); } catch (e) { toast(e.message, 'error'); }
      };
    }
    render();
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
          <div class="mut" style="font-size:12px;line-height:1.45">BTW-regime: <b style="color:var(--inkdim)">21/9/0%</b> = Nederland · <b style="color:var(--inkdim)">geen (buitenland)</b> = niet-EU (bv. Anthropic, VS) · <b style="color:var(--inkdim)">verlegd (EU)</b> = EU-diensten (bv. Google/Microsoft, Ierland). Weet je het niet zeker? Kies 21% of vraag je boekhouder.</div>
          <div class="preview"><div class="h">Journaalpost-preview (zo wordt het geboekt)</div>
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
          ${(opts && opts.hint) ? `<div class="help">${opts.hint}</div>` : ''}
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

  // ---------------- BTW: afdracht / teruggaaf boeken ----------------
  function openBtwAfdracht(d, kwartaal, jaar, refresh) {
    if (!d) return toast('BTW-gegevens nog niet geladen', 'error');
    const verschuldigd = round2(d.verschuldigd || 0);
    const voorbelasting = round2(d.rubriek5b || 0);
    const saldo = round2(d.saldo != null ? d.saldo : verschuldigd - voorbelasting);
    if (Math.abs(verschuldigd) < 0.005 && Math.abs(voorbelasting) < 0.005) return toast('Geen BTW in dit kwartaal om af te rekenen', 'error');
    const bank = (state.accounts.find((a) => a.isBank) || state.accounts.find((a) => /bunq|bank/i.test(a.naam)) || {}).nummer || '';
    const regels = [];
    if (verschuldigd) regels.push({ rekening: '1910', debet: verschuldigd, credit: 0 }); // schuld verrekenen
    if (voorbelasting) regels.push({ rekening: '1810', debet: 0, credit: voorbelasting }); // vordering verrekenen
    if (saldo > 0.005) regels.push({ rekening: bank, debet: 0, credit: saldo });           // betaling aan Belastingdienst
    else if (saldo < -0.005) regels.push({ rekening: bank, debet: -saldo, credit: 0 });     // teruggaaf van Belastingdienst
    const teBetalen = saldo >= 0;
    const hint = `<b>BTW-afrekening Q${kwartaal} ${jaar}.</b> Je verrekent de verschuldigde BTW (${euro(verschuldigd)} op 1910) met de voorbelasting (${euro(voorbelasting)} op 1810). Het saldo van <b>${euro(Math.abs(saldo))}</b> ${teBetalen ? 'betaal je aan' : 'ontvang je van'} de Belastingdienst via de bank. Zo lopen 1810 én 1910 weer naar 0. Controleer de bankrekening en zet de datum op de dag van ${teBetalen ? 'betaling' : 'ontvangst'}.`;
    openMemoriaal(refresh, { hint, initial: { datum: vandaag(), omschrijving: `BTW-afrekening Q${kwartaal} ${jaar}`, regels } });
  }

  // ---------------- Modal: Rente rekening-courant ----------------
  async function openRenteRC(refresh) {
    let gb;
    try { gb = await api('grootboek'); if (!state.accounts.length) await loadAccounts(); } catch (e) { toast(e.message, 'error'); return; }
    const actief = gb.filter((a) => a.type === 'actief');
    const opbrengsten = gb.filter((a) => a.type === 'opbrengsten');
    const boekjaar = (state.settings && state.settings.boekjaar) || String(new Date().getFullYear());
    const num = (v) => Number(String(v).replace(',', '.')) || 0;
    const st = {
      rc: (actief.find((a) => /rekening.?courant|aandeelhouder/i.test(a.naam)) || {}).nummer || '',
      rente: (opbrengsten.find((a) => /rente/i.test(a.naam)) || {}).nummer || '',
      pct: '1.5', drempel: '17500', grondslag: 'boven', datum: boekjaar + '-12-31',
    };
    const ov = document.createElement('div'); ov.className = 'overlay'; document.body.appendChild(ov);
    const close = () => ov.remove();
    const saldoRC = () => { const a = gb.find((x) => x.nummer === st.rc); return a ? Number(a.saldo) : 0; };
    const grondslag = () => (st.grondslag === 'boven' ? Math.max(0, round2(saldoRC() - num(st.drempel))) : saldoRC());
    const rente = () => round2(grondslag() * num(st.pct) / 100);
    const opt = (list, sel) => list.map((a) => `<option value="${esc(a.nummer)}" ${a.nummer === sel ? 'selected' : ''}>${esc(a.nummer)} — ${esc(a.naam)}</option>`).join('');
    function render() {
      ov.innerHTML = `<div class="modal"><div class="modal-head"><h2>Rente rekening-courant</h2><button class="x">✕</button></div>
        <div class="modal-body">
          <div class="help">De BV brengt zakelijke rente in rekening over de rekening-courant met de aandeelhouder. De rente <b>verhoogt je vordering</b> (DR) en is een <b>rentebate</b> (CR, geen BTW). Percentage en grondslag zijn een fiscale keuze — laat je boekhouder ze bevestigen.</div>
          <div class="row">
            <label class="field"><span>Rekening-courant</span><select id="rc">${opt(actief, st.rc)}</select></label>
            <label class="field"><span>Rentebaten-rekening</span><select id="rente">${opbrengsten.length ? opt(opbrengsten, st.rente) : '<option value="">— maak eerst een opbrengstrekening aan —</option>'}</select></label>
          </div>
          <div class="row">
            <label class="field"><span>Rentepercentage</span><input class="num" id="pct" value="${esc(st.pct)}" /></label>
            <label class="field"><span>Datum</span><input type="date" id="datum" value="${esc(st.datum)}" /></label>
          </div>
          <div class="row">
            <label class="field"><span>Grondslag</span><select id="grondslag"><option value="boven" ${st.grondslag === 'boven' ? 'selected' : ''}>saldo boven de grens</option><option value="heel" ${st.grondslag === 'heel' ? 'selected' : ''}>het hele saldo</option></select></label>
            <label class="field"><span>Grens (€)</span><input class="num" id="drempel" value="${esc(st.drempel)}" ${st.grondslag === 'heel' ? 'disabled' : ''} /></label>
          </div>
          <div class="preview"><div class="h">Berekening</div>
            <table><tbody>
              <tr><td style="padding:4px 16px">Saldo rekening-courant</td><td class="num" style="padding:4px 16px;color:var(--ink)">${euro(saldoRC())}</td></tr>
              <tr><td style="padding:4px 16px">Grondslag ${st.grondslag === 'boven' ? '(boven € ' + (num(st.drempel)).toLocaleString('nl-NL') + ')' : '(heel saldo)'}</td><td class="num" style="padding:4px 16px">${euro(grondslag())}</td></tr>
              <tr><td style="padding:4px 16px">Rente (${esc(st.pct)}%)</td><td class="num" style="padding:4px 16px;color:var(--ink);font-weight:700">${euro(rente())}</td></tr>
            </tbody></table></div>
          <div class="mut" style="font-size:12px">Wordt geboekt als memoriaal: DR ${esc(st.rc || 'r/c')} / CR ${esc(st.rente || 'rentebaten')} — ${euro(rente())}.</div>
        </div>
        <div class="modal-foot"><button class="btn btn-ghost" id="annuleer">Annuleren</button><button class="btn btn-success" id="boek">Boeken ✓</button></div></div>`;
      ov.querySelector('.x').onclick = close; ov.querySelector('#annuleer').onclick = close;
      ['rc', 'rente', 'pct', 'datum', 'grondslag', 'drempel'].forEach((id) => { const el = ov.querySelector('#' + id); if (el) el.onchange = () => { st[id] = el.value; render(); }; });
      ov.querySelector('#boek').onclick = boek;
    }
    async function boek() {
      const bedrag = rente();
      if (!st.rc) return toast('Kies de rekening-courant', 'error');
      if (!st.rente) return toast('Kies (of maak) een rentebaten-opbrengstrekening', 'error');
      if (!(bedrag > 0)) return toast('De berekende rente is € 0', 'error');
      try {
        await api('memoriaal', { datum: st.datum, omschrijving: 'Rente rekening-courant ' + String(st.datum).slice(0, 4), regels: [{ rekening: st.rc, debet: bedrag, credit: 0 }, { rekening: st.rente, debet: 0, credit: bedrag }] }, 'POST');
        toast('Rente geboekt ✓'); close(); if (refresh) refresh();
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

  // Duidelijke melding na een bankimport: alleen nieuwe regels tellen, dubbele worden genegeerd.
  function importMelding(r) {
    const t = r.totaal != null ? r.totaal : (r.geimporteerd + r.overgeslagen);
    const fmt = r.formaat ? ' (' + r.formaat + ')' : '';
    if (r.geimporteerd === 0) return { tekst: `Niets nieuws${fmt} — alle ${t} betalingen waren al geïmporteerd.`, type: 'info' };
    if (!r.overgeslagen) return { tekst: `${r.geimporteerd} betalingen geïmporteerd${fmt}.`, type: 'success' };
    return { tekst: `${r.geimporteerd} van ${t} betalingen geïmporteerd${fmt} — ${r.overgeslagen} al aanwezig, genegeerd.`, type: 'success' };
  }

  const CHART_KLEUREN = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#14b8a6'];

  // Zelfgemaakte SVG-lijngrafiek (geen externe libs). series: [{naam, kleur, waarden:[12]}]
  function lineChart(series) {
    const W = 680, H = 210, padL = 52, padR = 14, padT = 12, padB = 26;
    const months = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
    const max = Math.max(1, ...series.flatMap((s) => s.waarden.map((v) => Math.abs(v))));
    const X = (i) => padL + (W - padL - padR) * (i / 11);
    const Y = (v) => padT + (H - padT - padB) * (1 - Math.abs(v) / max);
    const grid = [0, 0.5, 1].map((f) => { const yy = padT + (H - padT - padB) * (1 - f); return `<line x1="${padL}" y1="${yy.toFixed(1)}" x2="${W - padR}" y2="${yy.toFixed(1)}" stroke="var(--line)"/><text x="${padL - 8}" y="${(yy + 3).toFixed(1)}" text-anchor="end" font-size="10" fill="var(--muted)">${euro0(max * f)}</text>`; }).join('');
    const xlabels = months.map((m, i) => `<text x="${X(i).toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="10" fill="var(--muted)">${m}</text>`).join('');
    const lines = series.map((s) => {
      const pts = s.waarden.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
      const dots = s.waarden.map((v, i) => `<circle cx="${X(i).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="2.5" fill="${s.kleur}"/>`).join('');
      return `<polyline points="${pts}" fill="none" stroke="${s.kleur}" stroke-width="2"/>${dots}`;
    }).join('');
    const legend = series.map((s) => `<span style="display:inline-flex;align-items:center;gap:6px;margin-right:16px;font-size:12px;color:var(--inkdim)"><span style="width:14px;height:3px;background:${s.kleur};display:inline-block;border-radius:2px"></span>${esc(s.naam)}</span>`).join('');
    return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block">${grid}${xlabels}${lines}</svg><div style="margin-top:10px">${legend}</div>`;
  }

  // ---------------- FAQ "Hoe boek ik…" ----------------
  const FAQ = {
    debet: { q: 'Wat betekenen debet en credit (dubbel boekhouden)?', a: 'Elke boeking heeft twee gelijke kanten. <b>Bezittingen en kosten</b> nemen toe aan de <b>debet</b>-kant; <b>schulden, eigen vermogen en opbrengsten</b> aan de <b>credit</b>-kant. De app bewaakt dat debet = credit, dus een boeking kan nooit uit balans raken.' },
    inkoop: { q: 'Hoe boek ik een inkoopfactuur?', a: 'Ga naar <b>Facturen invoeren → Inkoop</b> en upload de PDF. De AI leest bedrag, BTW en datum. Kies de <b>kostenrekening</b> (waar gaat het over) en de <b>betaalrekening</b> (je bank). De app splitst automatisch bedrag excl. BTW + de voorbelasting op <code>1810</code>.' },
    buitenland: { q: 'Hoe boek ik een buitenlandse leverancier (Anthropic, Hosting.com) zonder NL-BTW?', a: 'Leg de leverancier vast (Bank-pagina → Leveranciers) met het juiste <b>BTW-regime</b>: <b>geen</b> voor niet-EU (bv. VS — geen BTW, telt niet mee in de aangifte) of <b>verlegd</b> voor EU-diensten (de BTW wordt naar jou verlegd). Bij "verlegd" boekt de app de BTW zowel als verschuldigd (<code>1910</code>) als voorbelasting (<code>1810</code>) — saldo € 0 — en zet het in rubriek 4b. Kies bij de boeking hetzelfde bij "BTW".' },
    verkoop: { q: 'Hoe boek ik een verkoopfactuur?', a: 'Ga naar <b>Facturen invoeren → Verkoop</b>, vul het bedrag excl. BTW en het tarief (21% of 9%) in. De app boekt de omzet als opbrengst en de verschuldigde BTW op <code>1910</code>.' },
    prive: { q: 'Hoe boek ik geld dat ik vanuit GIBS naar privé haal (lenen van de BV)?', a: 'Dit is <b>geen kost</b> maar een verschuiving naar je <b>rekening-courant</b> met de BV. Op de <b>Bank</b>-pagina bij die afschrijving → <b>overboeking</b> → kies als tegenrekening je rekening-courant (bijv. <code>1310 Rekening-courant DGA</code>). Boeking: <code>DR 1310 / CR bank</code>. Je schuld aan de BV neemt toe. Stort je geld terug, dan draai je het om.' },
    knoppen: { q: 'Wat is het verschil tussen Boek, Koppel, Overboeking en Negeer?', a: '<b>Boek</b> = een nieuwe boeking maken (factuur, upload de PDF). <b>Overboeking</b> = geen factuur maar een verschuiving (privé, BTW-betaling, geld tussen banken). <b>Koppel</b> = verbinden aan een boeking die je al had — verschijnt alléén als er een boeking met hetzelfde bedrag bestaat. <b>Negeer</b> = niet relevant.' },
    tussenbanken: { q: 'Hoe boek ik geld tussen twee eigen bankrekeningen?', a: 'Op de <b>Bank</b>-pagina → <b>overboeking</b> → kies als tegenrekening de andere bankrekening. Er verandert niets aan je vermogen, alleen het saldo verschuift. (Zo boek je bijvoorbeeld een overboeking van je oude ING naar bunq.)' },
    btwwerking: { q: 'Hoe werkt de BTW in deze app?', a: 'Je verkopen leveren <b>verschuldigde BTW</b> op (<code>1910</code>), je inkopen leveren <b>voorbelasting</b> op (<code>1810</code>). Per kwartaal is het saldo (1910 − 1810) je aangifte: positief = betalen, negatief = terugkrijgen.' },
    btwafdracht: { q: 'Hoe boek ik de BTW-afdracht of -teruggaaf?', a: 'Ga naar de <b>BTW</b>-pagina, kies het kwartaal en klik <b>Afdracht boeken</b> (of Teruggaaf). De app vult een memoriaal voor: <code>DR 1910</code> (verschuldigd) en <code>CR 1810</code> (voorbelasting) worden tegen de <b>bank</b> weggeboekt, zodat beide naar € 0 lopen. Zet de datum op de dag van betaling/ontvangst.' },
    verlegd: { q: 'Wat is "BTW verlegd" en wanneer gebruik ik dat?', a: 'Bij diensten van een <b>EU-leverancier</b> wordt de BTW naar jou verlegd: de leverancier rekent geen BTW, jij geeft die zelf aan én trekt hem in dezelfde aangifte weer af. Netto betaal je niets, maar het hoort wel in de aangifte (rubriek 4b). Kies "verlegd" bij de boeking of bij de leverancier.' },
    memoriaal: { q: 'Wat is een memoriaalboeking?', a: 'Een vrije boeking zonder factuur of bankregel, waarbij je zelf de debet- en creditregels kiest (moet in balans zijn). Gebruik het voor correcties, afschrijvingen, rente, afwaarderingen en de BTW-afrekening. Journaal → <b>+ Memoriaal</b>.' },
    afschrijving: { q: 'Hoe boek ik een afschrijving (bijv. inventaris)?', a: 'Journaal → <b>+ Memoriaal</b>: <code>DR Afschrijvingskosten / CR de activarekening</code> (bijv. inventaris). Op de <b>grootboekkaart</b> van die rekening zie je dan het verloop: beginsaldo + aanschaf − afschrijving = eindstand.' },
    rcrente: { q: 'Hoe bereken en boek ik de rente op mijn rekening-courant?', a: 'De BV moet zakelijke rente rekenen over de rekening-courant met de aandeelhouder (gebruikelijk zodra de schuld boven ± € 17.500 komt). Ga naar <b>Grootboek → Rente r/c berekenen</b>: vul percentage (bv. 1,5%) en de grens in. De app rekent de rente over het saldo boven de grens en boekt <code>DR rekening-courant / CR rentebaten</code> (opbrengst, geen BTW). Maak eerst een opbrengstrekening "Rentebaten" aan.' },
    grootboekkaart: { q: 'Hoe zie ik hoe een post is opgebouwd?', a: 'Klik op een rekening in het <b>Grootboek</b> (of op een post in het Jaarverslag). Je ziet de <b>grootboekkaart</b>: beginsaldo + alle mutaties = eindsaldo. Zo volg je bijvoorbeeld saldo + aanschaf − afschrijving, of de opbouw van een W&V-post.' },
    deelnAfw: { q: 'Een deelneming is opgeheven of failliet — hoe verwerk ik dat?', a: 'Ga naar <b>Deelnemingen</b> → bij die deelneming <b>afwaarderen</b>. De app vult een memoriaal voor dat de boekwaarde als verlies naar € 0 boekt (<code>DR verliesrekening / CR deelneming</code>). Zet daarna de <b>status</b> op opgeheven of failliet via "bewerken".' },
    deelnNieuw: { q: 'Hoe leg ik een nieuwe deelneming vast?', a: 'Tab <b>Deelnemingen → + Deelneming</b>: naam, aandeel, status en eventueel de gekoppelde grootboekrekening (financiële vaste activa). De aankoop zelf boek je als memoriaal of via de bank. De boekwaarde in het register komt live uit die grootboekrekening.' },
    gebruikelijkloon: { q: 'Waarom moet ik mezelf een DGA-salaris geven?', a: 'Als DGA (aanmerkelijk belang) moet je een <b>gebruikelijk loon</b> uit de BV opnemen — richtlijn 2026 ± € 56.000. Dat is loon in <b>box 1</b>; de BV houdt er loonheffing op in. Vul dat loon in bij box 1 van de IB-module.' },
    salarisdividend: { q: 'Salaris of dividend uitkeren?', a: '<b>Salaris</b> is box 1 (progressief belast, maar aftrekbaar in de BV). <b>Dividend</b> is box 2 (24,5%/31%, ná vennootschapsbelasting in de BV). De IB-module toont beide; de optimale mix is een fiscale afweging — bespreek die met je adviseur.' },
    ibboxen: { q: 'Wat zit er in box 1, 2 en 3?', a: '<b>Box 1</b> = werk & woning: je DGA-loon en je eigen woning (eigenwoningforfait − hypotheekrente). <b>Box 2</b> = aanmerkelijk belang: dividend uit je BV. <b>Box 3</b> = sparen & beleggen: privévermogen (spaargeld + beleggingen − schulden), forfaitair belast.' },
    ibtarieven: { q: 'Kloppen de tarieven in de IB-module?', a: 'De tarieven, schijven en forfaits zijn <b>richtwaarden</b> die je onderaan de pagina zelf kunt aanpassen. Controleer ze op belastingdienst.nl voor het betreffende jaar. De uitkomst is een <b>indicatie</b> — laat je echte aangifte door een adviseur toetsen.' },
    priveVermogen: { q: 'Hoe wordt mijn vermogen berekend?', a: 'Vermogen = saldo van al je privérekeningen + wat je nog <b>te ontvangen</b> hebt (open vorderingen) − wat je nog moet <b>betalen</b> (open schulden). Het saldo van een rekening = beginsaldo + alle geïmporteerde/ingevoerde transacties.' },
    priveImport: { q: 'Hoe importeer ik mijn privé-bankafschrift?', a: 'Tabblad <b>Rekeningen</b> → maak een rekening aan (met beginsaldo) → klik <b>importeer</b> en kies je MT940 (<code>.sta</code>) bestand. Dubbele regels worden automatisch overgeslagen, dus je kunt elke maand veilig opnieuw importeren.' },
    priveCat: { q: 'Hoe zie ik waar mijn geld heen gaat?', a: 'Geef transacties een <b>categorie</b> (tabblad Transacties). Met "onthoud" aan krijgt dezelfde tegenpartij voortaan automatisch die categorie bij import. Op het <b>Overzicht</b> zie je je uitgaven per categorie.' },
    privePosten: { q: 'Hoe leg ik een lening of openstaand bedrag vast?', a: 'Tabblad <b>Te ontvangen / betalen</b>: voeg een <b>vordering</b> toe (geld dat je nog krijgt, bv. een lening die je gaf) of een <b>schuld</b> (geld dat je nog moet betalen). Open posten tellen mee in je vermogen; is het afgelost, zet je de post op afgehandeld.' },
    priveBelasting: { q: 'Hoe boek ik een voorlopige aanslag (teruggaaf of betaling) en de definitieve aanslag?', a: 'Zowel de <b>voorlopige</b> als de <b>definitieve aanslag</b> zijn gewoon bankboekingen met de Belastingdienst — boek elke transactie zoals hij afgaat of binnenkomt, met categorie <b>Inkomstenbelasting</b>. Een <b>betaling</b> is een uitgave; een <b>teruggaaf</b> boek je in dezelfde categorie en wordt automatisch met je betaalde belasting verrekend, zodat je netto ziet wat je écht kwijt bent. De <b>definitieve aanslag</b> verrekent alleen het <b>verschil</b> met wat je al via de voorlopige aanslag betaalde/ontving — dus als je elke echte bankregel één keer invoert, klopt het totaal vanzelf en tel je niets dubbel. Je vermogen klopt sowieso, want je banksaldo verandert echt.' },
    priveOverboeking: { q: 'Ik zet geld over naar mijn gezamenlijke/spaarrekening of neem contant op — hoe boek ik dat?', a: 'Zoek de boeking in je lijst (die staat er al door de import) en klik op <b>overboeking</b>. Kies dan de <b>eigen rekening</b> die de tegenkant is — je contant-pot, spaarrekening of de gezamenlijke rekening — en je bent klaar. De app boekt automatisch de tegenkant op die rekening, zodat beide saldo\'s kloppen, en de boeking telt niet meer mee als uitgave. Contant geld leg je eenmalig vast als rekening met soort <b>Contant</b> (tab Rekeningen).' },
    priveNeutraal: { q: 'Een overboeking wordt als inkomst gezien terwijl het dat niet is — wat nu?', a: 'Sommige bijschrijvingen zijn geen echt inkomen: een overboeking van je <b>spaarrekening</b>, een opname uit een <b>bouwdepot</b>, een <b>RC-opname uit je BV</b>, of een <b>ontvangen/gegeven lening</b>. Geef die transacties een categorie met soort <b>Neutraal (overboeking)</b> (er staan er al een paar klaar). Dan tellen ze niet mee als inkomst of uitgave en vervuilen ze je overzicht niet — je banksaldo blijft wél kloppen. Maak er eventueel een <b>regel</b> voor (bv. zoekterm "bouwdepot"), dan gaat het voortaan vanzelf. Gaat het om geld tussen je <b>eigen rekeningen</b> (spaar, contant, gezamenlijk)? Gebruik dan de knop <b>overboeking</b> bij die boeking. Wil je dat een RC-opname of ontvangen lening ook je <b>vermogen</b> corrigeert? Leg die vast als <b>schuld</b> op de tab Te ontvangen / betalen.' },
  };
  const FAQ_PAGES = {
    dashboard: ['debet', 'inkoop', 'prive', 'btwafdracht', 'rcrente'],
    facturen: ['inkoop', 'buitenland', 'verkoop', 'knoppen'],
    bank: ['prive', 'knoppen', 'btwafdracht', 'tussenbanken'],
    btw: ['btwwerking', 'btwafdracht', 'verlegd', 'buitenland'],
    journaal: ['memoriaal', 'afschrijving', 'rcrente', 'prive'],
    grootboek: ['grootboekkaart', 'afschrijving', 'rcrente'],
    deelnemingen: ['deelnAfw', 'deelnNieuw'],
    ib: ['ibboxen', 'gebruikelijkloon', 'salarisdividend', 'ibtarieven'],
    prive: ['priveVermogen', 'priveImport', 'priveOverboeking', 'priveCat', 'priveNeutraal', 'priveBelasting', 'privePosten'],
  };
  function faqBlock(pageKey) {
    const keys = FAQ_PAGES[pageKey] || [];
    if (!keys.length) return '';
    const items = keys.map((k) => FAQ[k]).filter(Boolean);
    return `<div class="card" style="margin-top:24px"><div class="card-head">❓ Hoe boek ik… — veelgestelde vragen</div>
      <div class="card-body" style="display:flex;flex-direction:column;gap:6px">
        ${items.map((f) => `<details class="faq"><summary>${esc(f.q)}</summary><div class="faq-a">${f.a}</div></details>`).join('')}
      </div></div>`;
  }
  function stat(label, value, cls) {
    return `<div class="stat"><div class="label">${esc(label)}</div><div class="value ${cls || ''}">${value}</div></div>`;
  }

  boot();
})();
