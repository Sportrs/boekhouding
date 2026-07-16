<?php
/* =====================================================================
 *  BV BOEKHOUDING — includes/xaf.php
 *  Importer voor het XML Auditfile Financieel (XAF 3.2, o.a. Exact Online).
 *  Leest het complete rekeningschema, de beginbalans en alle journaalposten
 *  en zet daarmee de boekhouding op. Vervangt de bestaande BV-administratie.
 * ===================================================================== */

const XAF_NS = 'http://www.auditfiles.nl/XAF/3.2';

/* Directe-kindtekst (niet recursief, om verwarring met geneste tags te voorkomen). */
function xaf_child(DOMElement $el, string $local): string {
    foreach ($el->childNodes as $c) {
        if ($c->nodeType === XML_ELEMENT_NODE && $c->localName === $local) return trim($c->textContent);
    }
    return '';
}

function xaf_parse(string $xml): array {
    $doc = new DOMDocument();
    if (!@$doc->loadXML($xml)) throw new RuntimeException('Kon het XML-bestand niet lezen — is dit een geldig XAF-bestand?');
    $root = $doc->documentElement;
    if (!$root || stripos($root->localName, 'auditfile') === false) {
        throw new RuntimeException('Dit lijkt geen XAF-auditbestand te zijn.');
    }
    $eersteTekst = function (string $local) use ($doc): string {
        $n = $doc->getElementsByTagNameNS(XAF_NS, $local);
        return $n->length ? trim($n->item(0)->textContent) : '';
    };
    $bedrijf = $eersteTekst('companyName');
    $boekjaar = $eersteTekst('fiscalYear');

    // 1) Rekeningschema
    $accounts = [];
    foreach ($doc->getElementsByTagNameNS(XAF_NS, 'ledgerAccount') as $a) {
        $nummer = xaf_child($a, 'accID');
        if ($nummer === '') continue;
        $accounts[$nummer] = [
            'nummer' => $nummer,
            'naam'   => xaf_child($a, 'accDesc'),
            'accTp'  => xaf_child($a, 'accTp'),   // B = balans, P = winst&verlies
        ];
    }

    // 2) Beginbalans (obLine): accID, amnt, amntTp (D/C)
    $openings = [];
    foreach ($doc->getElementsByTagNameNS(XAF_NS, 'obLine') as $o) {
        $nummer = xaf_child($o, 'accID');
        if ($nummer === '') continue;
        $openings[$nummer] = ['amnt' => (float) xaf_child($o, 'amnt'), 'tp' => xaf_child($o, 'amntTp')];
    }

    // 3) Journaalposten + netto beweging per rekening (voor typebepaling)
    $transactions = [];
    $beweging = [];   // nummer => debet - credit
    foreach ($doc->getElementsByTagNameNS(XAF_NS, 'transaction') as $t) {
        $datum = xaf_child($t, 'trDt');
        $regels = [];
        $oms = '';
        foreach ($t->childNodes as $c) {
            if ($c->nodeType !== XML_ELEMENT_NODE || $c->localName !== 'trLine') continue;
            $nummer = xaf_child($c, 'accID');
            if ($nummer === '') continue;
            $bedrag = (float) xaf_child($c, 'amnt');
            $tp = xaf_child($c, 'amntTp');
            $deb = $tp === 'D' ? $bedrag : 0.0;
            $cred = $tp === 'C' ? $bedrag : 0.0;
            $regels[] = ['nummer' => $nummer, 'debet' => $deb, 'credit' => $cred];
            $beweging[$nummer] = ($beweging[$nummer] ?? 0.0) + $deb - $cred;
            if ($oms === '') { $d = xaf_child($c, 'desc'); if ($d !== '') $oms = $d; }
            if ($datum === '') $datum = xaf_child($c, 'effDate');
        }
        if (!$regels) continue;
        $transactions[] = ['datum' => $datum, 'omschrijving' => $oms !== '' ? $oms : 'Journaalpost', 'regels' => $regels];
    }

    // 4) Type bepalen per rekening: B->actief/passief, P->kosten/opbrengsten,
    //    richting uit beginbalans of (anders) uit de netto beweging.
    foreach ($accounts as $nummer => &$a) {
        $tp = $a['accTp'];
        $heeftData = isset($openings[$nummer]) || abs($beweging[$nummer] ?? 0.0) > 0.005;
        $richting = $openings[$nummer]['tp'] ?? null;
        if ($richting === null) {
            $net = $beweging[$nummer] ?? 0.0;
            $richting = $net > 0.005 ? 'D' : ($net < -0.005 ? 'C' : 'D');
        }
        if ($tp === 'B') {
            $type = $richting === 'C' ? 'passief' : 'actief';
            if (preg_match('/afschrijving/i', $a['naam'])) $type = 'actief';   // contra-actief op activazijde
        } else {
            $type = $richting === 'C' ? 'opbrengsten' : 'kosten';
            // Lege P-rekening: val terug op de nummering (8xxx = omzet/opbrengsten).
            if (!$heeftData) $type = (isset($nummer[0]) && $nummer[0] === '8') ? 'opbrengsten' : 'kosten';
        }
        $a['type'] = $type;
        $a['is_bank'] = ($tp === 'B' && preg_match('/\b(bank|kas)\b|liquide|bunq|rabo|triodos|spaarrekening/i', $a['naam'])) ? 1 : 0;
        // Beginsaldo in de natuurlijke richting van het type.
        $os = 0.0;
        if (isset($openings[$nummer])) {
            $natuurlijk = in_array($type, ['actief', 'kosten'], true) ? 'D' : 'C';
            $os = $openings[$nummer]['tp'] === $natuurlijk ? $openings[$nummer]['amnt'] : -$openings[$nummer]['amnt'];
        }
        $a['opening_saldo'] = round($os, 2);
    }
    unset($a);

    return [
        'bedrijfsnaam' => $bedrijf,
        'boekjaar'     => $boekjaar,
        'accounts'     => array_values($accounts),
        'transactions' => $transactions,
    ];
}

/* Importeer: vervangt de BV-administratie. $cutoff = importeer boekingen mét
 * datum < $cutoff (default 1 juli 2026, zodat je vanaf 1 juli zelf boekt). */
function xaf_importeer(string $xml, string $cutoff = '2026-07-01'): array {
    $p = xaf_parse($xml);
    if (!$p['accounts']) throw new RuntimeException('Geen grootboekrekeningen in het bestand gevonden.');
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $cutoff)) $cutoff = '2026-07-01';

    // Boekingen vóór de cutoff; hele posten blijven in balans.
    $txs = array_values(array_filter($p['transactions'], fn($t) => $t['datum'] !== '' && $t['datum'] < $cutoff));
    $overgeslagen = count($p['transactions']) - count($txs);

    // Alle in regels gebruikte rekeningnummers moeten bestaan.
    $bekend = [];
    foreach ($p['accounts'] as $a) $bekend[$a['nummer']] = true;
    $ontbrekend = [];
    foreach ($txs as $t) foreach ($t['regels'] as $r) {
        if (!isset($bekend[$r['nummer']]) && !isset($ontbrekend[$r['nummer']])) $ontbrekend[$r['nummer']] = true;
    }

    db()->beginTransaction();
    db()->exec("DELETE FROM transactie_regels");
    db()->exec("DELETE FROM banktransacties");
    db()->exec("DELETE FROM transacties");
    db()->exec("DELETE FROM rekeningen");
    db()->exec("DELETE FROM jaarcijfers");
    db()->exec("DELETE FROM toelichtingen");
    db()->exec("DELETE FROM deelnemingen");

    $insRek = db()->prepare("INSERT INTO rekeningen (nummer, naam, type, is_bank, opening_saldo, systeem) VALUES (:n,:na,:t,:b,:o,0)");
    foreach ($p['accounts'] as $a) {
        $insRek->execute([':n' => $a['nummer'], ':na' => $a['naam'] ?: $a['nummer'], ':t' => $a['type'], ':b' => $a['is_bank'], ':o' => $a['opening_saldo']]);
    }
    // Ontbrekende rekeningen uit regels alsnog aanmaken (zodat saldi kloppen).
    foreach (array_keys($ontbrekend) as $nr) {
        $insRek->execute([':n' => $nr, ':na' => 'Onbekend ' . $nr, ':t' => 'actief', ':b' => 0, ':o' => 0]);
    }
    // BTW-systeemrekeningen borgen (voor je eigen boekingen vanaf 1 juli).
    foreach ([['1810', 'BTW te vorderen', 'actief'], ['1910', 'BTW te betalen', 'passief']] as [$n, $na, $t]) {
        $q = db()->prepare("SELECT COUNT(*) FROM rekeningen WHERE nummer = :n");
        $q->execute([':n' => $n]);
        if (!(int) $q->fetchColumn()) {
            db()->prepare("INSERT INTO rekeningen (nummer, naam, type, is_bank, opening_saldo, systeem) VALUES (:n,:na,:t,0,0,1)")->execute([':n' => $n, ':na' => $na, ':t' => $t]);
        }
    }

    $insTx = db()->prepare("INSERT INTO transacties (datum, omschrijving) VALUES (:d,:o)");
    $insReg = db()->prepare("INSERT INTO transactie_regels (transactie_id, rekening, debet, credit) VALUES (:t,:r,:deb,:cred)");
    $nRegels = 0;
    $minD = null; $maxD = null;
    foreach ($txs as $t) {
        $insTx->execute([':d' => $t['datum'], ':o' => mb_substr($t['omschrijving'], 0, 255)]);
        $tid = (int) db()->lastInsertId();
        foreach ($t['regels'] as $r) {
            $insReg->execute([':t' => $tid, ':r' => $r['nummer'], ':deb' => centen($r['debet']), ':cred' => centen($r['credit'])]);
            $nRegels++;
        }
        if ($minD === null || $t['datum'] < $minD) $minD = $t['datum'];
        if ($maxD === null || $t['datum'] > $maxD) $maxD = $t['datum'];
    }
    db()->commit();

    if ($p['bedrijfsnaam'] !== '') bh_instelling_zet('bedrijfsnaam', $p['bedrijfsnaam']);
    if ($p['boekjaar'] !== '') bh_instelling_zet('boekjaar', $p['boekjaar']);

    return [
        'ok' => true,
        'rekeningen' => count($p['accounts']),
        'boekingen' => count($txs),
        'regels' => $nRegels,
        'overgeslagen' => $overgeslagen,
        'cutoff' => $cutoff,
        'van' => $minD, 'tot' => $maxD,
        'onbekendeRekeningen' => array_keys($ontbrekend),
        'bedrijfsnaam' => $p['bedrijfsnaam'],
        'boekjaar' => $p['boekjaar'],
    ];
}
