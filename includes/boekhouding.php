<?php
/* =====================================================================
 *  BV BOEKHOUDING — includes/boekhouding.php
 *  Boekhoudlogica: saldi, balans, winst & verlies, BTW-aangifte.
 *  Saldi als "natural balance":
 *    actief/kosten:        opening + Σdebet − Σcredit
 *    passief/opbrengsten:  opening + Σcredit − Σdebet
 * ===================================================================== */

// Systeemrekeningen borgen (niet verwijderbaar).
function bh_ensure_systeem(): void {
    $rekeningen = [
        ['1810', 'BTW te vorderen', 'actief'],
        ['1910', 'BTW te betalen',  'passief'],
    ];
    $stmt = db()->prepare(
        "INSERT IGNORE INTO rekeningen (nummer, naam, type, systeem, opening_saldo)
         VALUES (:nr, :naam, :type, 1, 0)"
    );
    foreach ($rekeningen as [$nr, $naam, $type]) {
        $stmt->execute([':nr' => $nr, ':naam' => $naam, ':type' => $type]);
    }
}

// Een instelling ophalen / opslaan.
function bh_instelling(string $sleutel, string $standaard = ''): string {
    $q = db()->prepare("SELECT waarde FROM instellingen WHERE sleutel = :s LIMIT 1");
    $q->execute([':s' => $sleutel]);
    $w = $q->fetchColumn();
    return $w !== false ? (string) $w : $standaard;
}

function bh_instelling_zet(string $sleutel, string $waarde): void {
    db()->prepare(
        "INSERT INTO instellingen (sleutel, waarde) VALUES (:s, :w)
         ON DUPLICATE KEY UPDATE waarde = :w2"
    )->execute([':s' => $sleutel, ':w' => $waarde, ':w2' => $waarde]);
}

function bh_boekjaar(): string {
    return bh_instelling('boekjaar', (string) (int) date('Y'));
}

// Alle rekeningen (gesorteerd op nummer), met floats.
function bh_rekeningen(): array {
    $rows = db()->query("SELECT nummer, naam, type, systeem, opening_saldo FROM rekeningen ORDER BY nummer ASC")
        ->fetchAll();
    foreach ($rows as &$r) {
        $r['systeem']       = (bool) $r['systeem'];
        $r['openingSaldo']  = (float) $r['opening_saldo'];
    }
    return $rows;
}

// Alle transacties met hun regels.
function bh_transacties(?string $from = null, ?string $to = null): array {
    $where = [];
    $params = [];
    if ($from) { $where[] = 'datum >= :from'; $params[':from'] = $from; }
    if ($to)   { $where[] = 'datum <= :to';   $params[':to']   = $to; }
    $sql = "SELECT id, datum, omschrijving, factuur_nummer, btw_grondslag, btw_bedrag, btw_code, btw_richting
            FROM transacties";
    if ($where) $sql .= ' WHERE ' . implode(' AND ', $where);
    $sql .= ' ORDER BY datum DESC, id DESC';
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    $tx = $stmt->fetchAll();
    if (!$tx) return [];

    $ids = array_column($tx, 'id');
    $in  = implode(',', array_fill(0, count($ids), '?'));
    $rq  = db()->prepare("SELECT transactie_id, rekening, debet, credit FROM transactie_regels WHERE transactie_id IN ($in)");
    $rq->execute($ids);
    $regelsPer = [];
    foreach ($rq->fetchAll() as $r) {
        $regelsPer[$r['transactie_id']][] = [
            'rekening' => $r['rekening'],
            'debet'    => (float) $r['debet'],
            'credit'   => (float) $r['credit'],
        ];
    }

    foreach ($tx as &$t) {
        $t['id']            = (int) $t['id'];
        $t['factuurNummer'] = $t['factuur_nummer'];
        $t['btwGrondslag']  = $t['btw_grondslag'] !== null ? (float) $t['btw_grondslag'] : null;
        $t['btwBedrag']     = $t['btw_bedrag']    !== null ? (float) $t['btw_bedrag']    : null;
        $t['btwCode']       = $t['btw_code'];
        $t['btwRichting']   = $t['btw_richting'];
        $t['regels']        = $regelsPer[$t['id']] ?? [];
        unset($t['factuur_nummer'], $t['btw_grondslag'], $t['btw_bedrag'], $t['btw_code'], $t['btw_richting']);
    }
    return $tx;
}

// Debet/credit per rekeningnummer, optioneel op datum gefilterd.
function bh_bewegingen(array $transacties, ?string $from = null, ?string $to = null): array {
    $map = [];
    foreach ($transacties as $t) {
        if ($from && $t['datum'] < $from) continue;
        if ($to && $t['datum'] > $to) continue;
        foreach ($t['regels'] as $r) {
            $nr = $r['rekening'];
            if (!isset($map[$nr])) $map[$nr] = ['debet' => 0.0, 'credit' => 0.0];
            $map[$nr]['debet']  += $r['debet'];
            $map[$nr]['credit'] += $r['credit'];
        }
    }
    return $map;
}

function bh_saldo(array $account, array $beweging, bool $metOpening = true): float {
    $opening = $metOpening ? $account['openingSaldo'] : 0.0;
    if ($account['type'] === 'actief' || $account['type'] === 'kosten') {
        return centen($opening + $beweging['debet'] - $beweging['credit']);
    }
    return centen($opening + $beweging['credit'] - $beweging['debet']);
}

// ---------------------------------------------------------------------
// Balans per datum
// ---------------------------------------------------------------------
function bh_balans(string $datum): array {
    $boekjaar = bh_boekjaar();
    $boekjaarStart = $boekjaar . '-01-01';
    $rek = bh_rekeningen();
    $tx  = bh_transacties();

    $bewTot = bh_bewegingen($tx, null, $datum);
    $bewBj  = bh_bewegingen($tx, $boekjaarStart, $datum);

    $activa = [];
    $passiva = [];
    $resultaat = 0.0;

    foreach ($rek as $a) {
        $bt = $bewTot[$a['nummer']] ?? ['debet' => 0.0, 'credit' => 0.0];
        if ($a['type'] === 'actief') {
            $s = bh_saldo($a, $bt);
            if ($s != 0) $activa[] = ['nummer' => $a['nummer'], 'naam' => $a['naam'], 'saldo' => $s];
        } elseif ($a['type'] === 'passief') {
            $s = bh_saldo($a, $bt);
            if ($s != 0) $passiva[] = ['nummer' => $a['nummer'], 'naam' => $a['naam'], 'saldo' => $s];
        } else {
            $bb = $bewBj[$a['nummer']] ?? ['debet' => 0.0, 'credit' => 0.0];
            $s  = bh_saldo($a, $bb, false);
            if ($a['type'] === 'opbrengsten') $resultaat += $s;
            else $resultaat -= $s;
        }
    }
    $resultaat = centen($resultaat);
    $totaalActiva  = centen(array_sum(array_column($activa, 'saldo')));
    $totaalPassiva = centen(array_sum(array_column($passiva, 'saldo')) + $resultaat);

    return [
        'datum'             => $datum,
        'activa'            => $activa,
        'passiva'           => $passiva,
        'resultaatBoekjaar' => $resultaat,
        'totaalActiva'      => $totaalActiva,
        'totaalPassiva'     => $totaalPassiva,
        'inBalans'          => abs($totaalActiva - $totaalPassiva) < 0.005,
    ];
}

// ---------------------------------------------------------------------
// Winst & Verlies
// ---------------------------------------------------------------------
function bh_wenv(string $from, string $to): array {
    $rek = bh_rekeningen();
    $tx  = bh_transacties();
    $bew = bh_bewegingen($tx, $from, $to);

    $opbrengsten = [];
    $kosten = [];
    foreach ($rek as $a) {
        if ($a['type'] !== 'kosten' && $a['type'] !== 'opbrengsten') continue;
        $b = $bew[$a['nummer']] ?? ['debet' => 0.0, 'credit' => 0.0];
        $s = bh_saldo($a, $b, false);
        if ($s == 0) continue;
        $post = ['nummer' => $a['nummer'], 'naam' => $a['naam'], 'saldo' => $s];
        if ($a['type'] === 'opbrengsten') $opbrengsten[] = $post;
        else $kosten[] = $post;
    }
    $to_opb = centen(array_sum(array_column($opbrengsten, 'saldo')));
    $to_kos = centen(array_sum(array_column($kosten, 'saldo')));

    return [
        'from'              => $from,
        'to'                => $to,
        'opbrengsten'       => $opbrengsten,
        'kosten'            => $kosten,
        'totaalOpbrengsten' => $to_opb,
        'totaalKosten'      => $to_kos,
        'resultaat'         => centen($to_opb - $to_kos),
    ];
}

// ---------------------------------------------------------------------
// BTW-aangifte (kwartaal)
// ---------------------------------------------------------------------
function bh_kwartaal_grenzen(int $kwartaal, int $jaar): array {
    $startMaand = ($kwartaal - 1) * 3 + 1;
    $eindMaand  = $startMaand + 2;
    $from = sprintf('%04d-%02d-01', $jaar, $startMaand);
    $laatste = (int) date('t', mktime(0, 0, 0, $eindMaand, 1, $jaar));
    $to = sprintf('%04d-%02d-%02d', $jaar, $eindMaand, $laatste);
    return ['from' => $from, 'to' => $to];
}

function bh_btw(int $kwartaal, int $jaar): array {
    ['from' => $from, 'to' => $to] = bh_kwartaal_grenzen($kwartaal, $jaar);
    $tx = bh_transacties();

    $inKwartaal = array_values(array_filter($tx, function ($t) use ($from, $to) {
        return $t['datum'] >= $from && $t['datum'] <= $to
            && $t['btwBedrag'] !== null && $t['btwRichting'] !== null;
    }));

    $som = function (callable $pred, string $veld) use ($inKwartaal): float {
        $t = 0.0;
        foreach ($inKwartaal as $r) if ($pred($r)) $t += (float) ($r[$veld] ?? 0);
        return centen($t);
    };
    $afdracht21 = fn($t) => $t['btwRichting'] === 'afdracht' && $t['btwCode'] === '21';
    $afdracht9  = fn($t) => $t['btwRichting'] === 'afdracht' && $t['btwCode'] === '9';
    $vordering  = fn($t) => $t['btwRichting'] === 'vordering';

    $r1a = ['grondslag' => $som($afdracht21, 'btwGrondslag'), 'btw' => $som($afdracht21, 'btwBedrag')];
    $r1b = ['grondslag' => $som($afdracht9,  'btwGrondslag'), 'btw' => $som($afdracht9,  'btwBedrag')];
    $r5b = $som($vordering, 'btwBedrag');
    $verschuldigd = centen($r1a['btw'] + $r1b['btw']);

    return [
        'kwartaal'    => $kwartaal,
        'jaar'        => $jaar,
        'from'        => $from,
        'to'          => $to,
        'rubriek1a'   => $r1a,
        'rubriek1b'   => $r1b,
        'rubriek1c'   => ['grondslag' => 0, 'btw' => 0],
        'rubriek1d'   => ['grondslag' => 0, 'btw' => 0],
        'rubriek5b'   => $r5b,
        'verschuldigd'=> $verschuldigd,
        'saldo'       => centen($verschuldigd - $r5b),
        'transacties' => $inKwartaal,
    ];
}

// ---------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------
function bh_dashboard(): array {
    $boekjaar = bh_boekjaar();
    $start = $boekjaar . '-01-01';
    $eind  = $boekjaar . '-12-31';
    $rek = bh_rekeningen();
    $tx  = bh_transacties();

    $wenv = bh_wenv($start, $eind);

    $bew = bh_bewegingen($tx, null, $eind);
    $bankNummers = [];
    $banksaldo = 0.0;
    foreach ($rek as $a) {
        if ($a['type'] === 'actief' && preg_match('/bank/i', $a['naam'])) {
            $bankNummers[] = $a['nummer'];
            $banksaldo += bh_saldo($a, $bew[$a['nummer']] ?? ['debet' => 0.0, 'credit' => 0.0]);
        }
    }

    $kwartaal = (int) floor(((int) date('n') - 1) / 3) + 1;
    $jaar = (int) date('Y');
    $btw = bh_btw($kwartaal, $jaar);

    return [
        'boekjaar'          => $boekjaar,
        'banksaldo'         => centen($banksaldo),
        'bankRekeningen'    => $bankNummers,
        'omzetBoekjaar'     => $wenv['totaalOpbrengsten'],
        'kostenBoekjaar'    => $wenv['totaalKosten'],
        'resultaatBoekjaar' => $wenv['resultaat'],
        'huidigKwartaal'    => ['kwartaal' => $kwartaal, 'jaar' => $jaar, 'saldo' => $btw['saldo']],
        'recenteBoekingen'  => array_slice($tx, 0, 6),
    ];
}

// ---------------------------------------------------------------------
// Grootboekkaart / verloop per rekening (live boekjaar)
//   beginsaldo + mutaties (journaalposten) -> eindsaldo
// ---------------------------------------------------------------------
function bh_grootboekkaart(string $nummer, ?string $from = null, ?string $to = null): array {
    $r = db()->prepare("SELECT nummer, naam, type, opening_saldo FROM rekeningen WHERE nummer = :nr LIMIT 1");
    $r->execute([':nr' => $nummer]);
    $rek = $r->fetch();
    if (!$rek) throw new RuntimeException('Rekening niet gevonden');

    $boekjaar = bh_boekjaar();
    $from = $from ?: ($boekjaar . '-01-01');
    $to   = $to   ?: ($boekjaar . '-12-31');
    $debetKant = ($rek['type'] === 'actief' || $rek['type'] === 'kosten');

    // Alle regels op deze rekening, chronologisch.
    $q = db()->prepare(
        "SELECT t.datum, t.omschrijving, t.factuur_nummer, r.debet, r.credit
         FROM transactie_regels r JOIN transacties t ON t.id = r.transactie_id
         WHERE r.rekening = :nr
         ORDER BY t.datum, t.id"
    );
    $q->execute([':nr' => $nummer]);

    $opening = (float) $rek['opening_saldo'];
    $priorDelta = 0.0;
    $regels = [];
    foreach ($q->fetchAll() as $row) {
        $debet = (float) $row['debet'];
        $credit = (float) $row['credit'];
        $delta = $debetKant ? ($debet - $credit) : ($credit - $debet);
        if ($row['datum'] < $from) {
            $priorDelta += $delta;
        } elseif ($row['datum'] <= $to) {
            $regels[] = [
                'datum'        => $row['datum'],
                'omschrijving' => $row['omschrijving'],
                'factuurNummer'=> $row['factuur_nummer'],
                'debet'        => centen($debet),
                'credit'       => centen($credit),
                'delta'        => centen($delta),
            ];
        }
    }

    $begin = centen($opening + $priorDelta);
    $loop = $begin;
    foreach ($regels as &$rg) { $loop = centen($loop + $rg['delta']); $rg['saldo'] = $loop; }

    // Historisch verloop uit de geïmporteerde jaarrekening (toelichting):
    // Stand 1-1 + mutaties -> Stand 31-12 van het vorige boekjaar (= beginsaldo nu).
    $h = db()->prepare(
        "SELECT jaar, label, bedrag FROM toelichtingen
         WHERE soort = 'verloop' AND (rekeningnummer = :nr OR post = :naam)
         ORDER BY volgorde"
    );
    $h->execute([':nr' => $nummer, ':naam' => $rek['naam']]);
    $historie = [];
    $historieJaar = null;
    foreach ($h->fetchAll() as $hr) {
        $historieJaar = (int) $hr['jaar'];
        $historie[] = ['label' => $hr['label'], 'bedrag' => $hr['bedrag'] === null ? null : (float) $hr['bedrag']];
    }

    return [
        'nummer'       => $rek['nummer'],
        'naam'         => $rek['naam'],
        'type'         => $rek['type'],
        'from'         => $from,
        'to'           => $to,
        'beginsaldo'   => $begin,
        'regels'       => $regels,
        'eindsaldo'    => centen($loop),
        'historie'     => $historie,
        'historieJaar' => $historieJaar,
    ];
}
