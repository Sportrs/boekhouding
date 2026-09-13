<?php
/* =====================================================================
 *  BV BOEKHOUDING — includes/bank.php
 *  Bankimport (MT940), leveranciers en afletteren (bankregel <-> boeking).
 * ===================================================================== */

// --- Leveranciers ----------------------------------------------------
function leveranciers_lijst(): array {
    $rows = db()->query("SELECT * FROM leveranciers ORDER BY naam")->fetchAll();
    foreach ($rows as &$r) { $r['id'] = (int) $r['id']; }
    return $rows;
}

function leverancier_opslaan(array $in): array {
    $naam = trim((string) ($in['naam'] ?? ''));
    if ($naam === '') json_response(['fout' => 'Naam is verplicht'], 422);
    $regime = (string) ($in['btw_regime'] ?? '21');
    if (!in_array($regime, ['21', '9', '0', 'geen', 'verlegd', 'verlegd_niet_eu'], true)) $regime = '21';
    $data = [
        ':naam' => $naam,
        ':zoek' => trim((string) ($in['zoekterm'] ?? '')) ?: null,
        ':land' => trim((string) ($in['land'] ?? '')) ?: null,
        ':regime' => $regime,
        ':rek' => trim((string) ($in['standaard_rekening'] ?? '')) ?: null,
        ':iban' => trim((string) ($in['iban'] ?? '')) ?: null,
    ];
    $id = (int) ($in['id'] ?? 0);
    if ($id > 0) {
        $data[':id'] = $id;
        db()->prepare("UPDATE leveranciers SET naam=:naam, zoekterm=:zoek, land=:land, btw_regime=:regime, standaard_rekening=:rek, iban=:iban WHERE id=:id")->execute($data);
    } else {
        db()->prepare("INSERT INTO leveranciers (naam, zoekterm, land, btw_regime, standaard_rekening, iban) VALUES (:naam,:zoek,:land,:regime,:rek,:iban)")->execute($data);
        $id = (int) db()->lastInsertId();
    }
    return ['ok' => true, 'id' => $id];
}

function leverancier_verwijder(int $id): void {
    db()->prepare("UPDATE banktransacties SET leverancier_id = NULL WHERE leverancier_id = :id")->execute([':id' => $id]);
    db()->prepare("DELETE FROM leveranciers WHERE id = :id")->execute([':id' => $id]);
}

/* Herken een leverancier op basis van IBAN of zoekterm in naam/omschrijving. */
function bank_match_leverancier(string $naam, string $oms, string $iban): ?array {
    $levs = db()->query("SELECT * FROM leveranciers")->fetchAll();
    $hooi = mb_strtolower($naam . ' ' . $oms);
    foreach ($levs as $l) {
        if ($iban !== '' && !empty($l['iban']) && strcasecmp(trim($iban), trim($l['iban'])) === 0) return $l;
    }
    foreach ($levs as $l) {
        $term = mb_strtolower(trim($l['zoekterm'] ?: $l['naam']));
        if ($term !== '' && mb_strpos($hooi, $term) !== false) return $l;
    }
    return null;
}

/* --------------------------------------------------------------------
 *  Voorstel voor kostenrekening + betaalrekening
 *
 *  Twee bronnen, in volgorde van betrouwbaarheid:
 *   1. de leverancier, als daar een standaard kostenrekening is ingesteld;
 *   2. je eigen historie — hoe boekte je deze leverancier de vorige keren?
 *
 *  (2) heeft geen enkele instelling nodig: boek je de bunq-factuur één keer
 *  op 4310 Bankkosten, dan wordt die volgende maand voorgesteld. Er wordt
 *  nooit automatisch geboekt; dit vult alleen de keuzelijsten voor, en de
 *  reden wordt in het scherm getoond zodat je hem kunt overrulen.
 * ------------------------------------------------------------------ */

/* Losse, onderscheidende woorden uit een leveranciersnaam/omschrijving. */
function bank_zoekwoorden(string $tekst): array {
    $tekst = mb_strtolower($tekst);
    $tekst = preg_replace('/[^\p{L}\p{N} ]+/u', ' ', $tekst);
    // Woorden die op zo ongeveer elke factuur staan en dus niets onderscheiden.
    $stop = ['de', 'het', 'een', 'van', 'voor', 'aan', 'bij', 'met', 'the', 'and', 'for',
             'bv', 'nv', 'ltd', 'inc', 'gmbh', 'sarl', 'holding', 'group', 'company',
             'factuur', 'invoice', 'nota', 'betaling', 'incasso', 'sepa', 'machtiging',
             'periode', 'maand', 'jaar', 'abonnement', 'subscription', 'kosten', 'nummer'];
    $uit = [];
    foreach (explode(' ', $tekst) as $w) {
        $w = trim($w);
        if (mb_strlen($w) < 3 || ctype_digit($w) || in_array($w, $stop, true)) continue;
        $uit[$w] = true;
    }
    return array_keys($uit);
}

/* Meest gebruikte rekening in eerdere boekingen waarvan de omschrijving $term bevat.
   $soort: 'kosten' | 'opbrengsten' | 'bank'. */
function bank_historie_rekening(string $term, string $soort): ?array {
    $term = trim($term);
    if (mb_strlen($term) < 3) return null;
    $q = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $term) . '%';
    $waar = $soort === 'bank' ? 'k.is_bank = 1' : 'k.type = :soort';
    $sql = "SELECT r.rekening, COUNT(*) AS aantal, MAX(t.datum) AS laatst
              FROM transacties t
              JOIN transactie_regels r ON r.transactie_id = t.id
              JOIN rekeningen k        ON k.nummer = r.rekening
             WHERE $waar AND t.omschrijving LIKE :q
          GROUP BY r.rekening
          ORDER BY aantal DESC, laatst DESC
             LIMIT 1";
    $st = db()->prepare($sql);
    $par = [':q' => $q];
    if ($soort !== 'bank') $par[':soort'] = $soort;
    $st->execute($par);
    $row = $st->fetch();
    if (!$row) return null;
    return ['rekening' => (string) $row['rekening'], 'aantal' => (int) $row['aantal'], 'term' => $term];
}

/* Zoek langs steeds algemenere termen tot er een treffer is. */
function bank_historie_zoek(array $termen, string $soort): ?array {
    foreach ($termen as $t) {
        $hit = bank_historie_rekening($t, $soort);
        if ($hit) return $hit;
    }
    return null;
}

function boeking_voorstel(string $leverancier, string $omschrijving, string $iban = '', string $type = 'inkoop'): array {
    $leverancier = trim($leverancier);
    $omschrijving = trim($omschrijving);
    $soort = $type === 'verkoop' ? 'opbrengsten' : 'kosten';
    $leeg = ['grootboekrekening' => '', 'betaalrekening' => '', 'bron' => '', 'toelichting' => ''];
    if ($leverancier === '' && $omschrijving === '' && $iban === '') return $leeg;

    // Volledige naam eerst (meest specifiek), daarna losse woorden.
    $termen = [];
    if ($leverancier !== '') $termen[] = $leverancier;
    foreach (bank_zoekwoorden($leverancier) as $w) $termen[] = $w;
    foreach (bank_zoekwoorden($omschrijving) as $w) $termen[] = $w;
    $termen = array_values(array_unique($termen));

    $uit = $leeg;

    // 1. Vaste leverancier met een standaard kostenrekening.
    $lev = bank_match_leverancier($leverancier, $omschrijving, $iban);
    if ($lev && !empty($lev['standaard_rekening'])) {
        $uit['grootboekrekening'] = (string) $lev['standaard_rekening'];
        $uit['bron'] = 'leverancier';
        $uit['toelichting'] = 'standaard kostenrekening van leverancier ' . $lev['naam'];
    } else {
        // 2. Hoe boekte je dit eerder?
        $hit = bank_historie_zoek($termen, $soort);
        if ($hit) {
            $uit['grootboekrekening'] = $hit['rekening'];
            $uit['bron'] = 'historie';
            $uit['toelichting'] = $hit['aantal'] === 1
                ? 'zo boekte je "' . $hit['term'] . '" de vorige keer'
                : 'zo boekte je "' . $hit['term'] . '" de vorige ' . $hit['aantal'] . ' keer';
        }
    }

    // Betaalrekening altijd uit de historie: welke bankrekening gebruikte je hiervoor?
    $bank = bank_historie_zoek($termen, 'bank');
    if ($bank) $uit['betaalrekening'] = $bank['rekening'];

    return $uit;
}

// --- Bankimport (MT940 of ING CSV) -----------------------------------
function bank_importeer(string $inhoud): array {
    require_once __DIR__ . '/mt940.php';
    require_once __DIR__ . '/csv_ing.php';
    if (ing_csv_is($inhoud)) {
        $p = ing_csv_parse($inhoud);
        $formaat = 'ING CSV';
    } else {
        $p = mt940_parse($inhoud);
        $formaat = 'MT940';
    }
    if (!$p['regels']) throw new RuntimeException('Geen bankregels gevonden — is dit een MT940 (.sta) of ING CSV bestand?');

    $ins = db()->prepare(
        "INSERT IGNORE INTO banktransacties
         (datum, bedrag, afbij, tegenrekening_iban, tegenrekening_naam, omschrijving, code, ruw, hash, leverancier_id)
         VALUES (:d,:b,:ab,:iban,:naam,:oms,:code,:ruw,:hash,:lev)"
    );
    $tellers = [];
    $geimp = 0;
    $over = 0;
    foreach ($p['regels'] as $r) {
        $base = sha1($r['datum'] . '|' . $r['bedrag'] . '|' . $r['afbij'] . '|' . $r['tegenrekening_iban'] . '|' . $r['omschrijving']);
        $n = $tellers[$base] ?? 0;
        $tellers[$base] = $n + 1;
        $hash = sha1($base . '#' . $n);
        $lev = bank_match_leverancier($r['tegenrekening_naam'], $r['omschrijving'], $r['tegenrekening_iban']);
        $ins->execute([
            ':d' => $r['datum'], ':b' => $r['bedrag'], ':ab' => $r['afbij'],
            ':iban' => $r['tegenrekening_iban'] ?: null, ':naam' => $r['tegenrekening_naam'] ?: null,
            ':oms' => $r['omschrijving'] ?: null, ':code' => $r['code'] ?: null,
            ':ruw' => $r['ruw'], ':hash' => $hash, ':lev' => $lev['id'] ?? null,
        ]);
        if ($ins->rowCount() > 0) $geimp++; else $over++;
    }
    return [
        'geimporteerd' => $geimp, 'overgeslagen' => $over, 'totaal' => count($p['regels']),
        'iban' => $p['iban'], 'beginsaldo' => $p['beginsaldo'], 'eindsaldo' => $p['eindsaldo'],
        'formaat' => $formaat,
    ];
}

/* Wat een boeking volgens het grootboek met de liquide middelen doet, in de
   richting van een afschrijving (credit op de bank is positief). Dít hoort gelijk
   te zijn aan het bedrag van de bankregel — niet de som van alle debetregels:
   bij verlegde BTW staat er een extra debetregel die de bank niet raakt. */
function bank_leg_sql(string $transactieId): string {
    return "(SELECT COALESCE(SUM(rr.credit - rr.debet), 0)
               FROM transactie_regels rr
               JOIN rekeningen kk ON kk.nummer = rr.rekening AND kk.is_bank = 1
              WHERE rr.transactie_id = $transactieId)";
}

// --- Overzicht + afletteren -----------------------------------------
function bank_lijst(?string $status = null): array {
    $bankLegGekoppeld = bank_leg_sql('b.transactie_id');
    $bankLegKandidaat = bank_leg_sql('tt.id');
    $sql = "SELECT b.id, b.datum, b.bedrag, b.afbij, b.tegenrekening_iban, b.tegenrekening_naam,
                   b.omschrijving, b.status, b.transactie_id, b.leverancier_id,
                   l.naam AS leverancier_naam, l.btw_regime, l.standaard_rekening,
                   t.omschrijving AS boeking_oms, t.datum AS boeking_datum,
                   $bankLegGekoppeld AS boeking_bank_bedrag,
                   (SELECT COUNT(*) FROM (
                       SELECT tt.id,
                              (SELECT COALESCE(SUM(debet),0) FROM transactie_regels rr WHERE rr.transactie_id = tt.id) AS tot,
                              $bankLegKandidaat AS banktot
                       FROM transacties tt
                       WHERE tt.id NOT IN (SELECT transactie_id FROM banktransacties WHERE transactie_id IS NOT NULL)
                   ) mm WHERE ABS(mm.tot - b.bedrag) < 0.005
                        OR ABS(mm.banktot - (CASE WHEN b.afbij = 'af' THEN b.bedrag ELSE -b.bedrag END)) < 0.005) AS match_count
            FROM banktransacties b
            LEFT JOIN leveranciers l ON l.id = b.leverancier_id
            LEFT JOIN transacties  t ON t.id = b.transactie_id";
    $params = [];
    if ($status) { $sql .= " WHERE b.status = :s"; $params[':s'] = $status; }
    $sql .= " ORDER BY b.datum DESC, b.id DESC";
    $q = db()->prepare($sql);
    $q->execute($params);
    $rows = $q->fetchAll();
    foreach ($rows as &$r) {
        $r['id'] = (int) $r['id'];
        $r['bedrag'] = (float) $r['bedrag'];
        $r['transactie_id'] = $r['transactie_id'] !== null ? (int) $r['transactie_id'] : null;
        $r['leverancier_id'] = $r['leverancier_id'] !== null ? (int) $r['leverancier_id'] : null;
        $r['match_count'] = (int) ($r['match_count'] ?? 0);
        // Positief = credit op de bank (afschrijving). Vergelijk met bedrag + afbij.
        $r['boeking_bank_bedrag'] = $r['transactie_id'] !== null ? (float) $r['boeking_bank_bedrag'] : null;
    }
    return $rows;
}

/* Kandidaat-boekingen met hetzelfde (incl.) bedrag die nog niet gekoppeld zijn. */
function bank_suggesties(int $id): array {
    $b = db()->prepare("SELECT bedrag, datum, afbij FROM banktransacties WHERE id = :id");
    $b->execute([':id' => $id]);
    $bt = $b->fetch();
    if (!$bt) return [];
    $bankLeg = bank_leg_sql('t.id');
    $q = db()->prepare(
        "SELECT x.id, x.datum, x.omschrijving, x.factuur_nummer, x.totaal FROM (
            SELECT t.id, t.datum, t.omschrijving, t.factuur_nummer,
                   (SELECT COALESCE(SUM(debet),0) FROM transactie_regels r WHERE r.transactie_id = t.id) AS totaal,
                   $bankLeg AS banktotaal
            FROM transacties t
            WHERE t.id NOT IN (SELECT transactie_id FROM banktransacties WHERE transactie_id IS NOT NULL)
         ) x
         WHERE ABS(x.totaal - :bedrag) < 0.005 OR ABS(x.banktotaal - :banksaldo) < 0.005
         ORDER BY ABS(DATEDIFF(x.datum, :datum)) ASC
         LIMIT 10"
    );
    $q->execute([
        ':bedrag' => $bt['bedrag'],
        ':banksaldo' => $bt['afbij'] === 'af' ? (float) $bt['bedrag'] : -((float) $bt['bedrag']),
        ':datum' => $bt['datum'],
    ]);
    $rows = $q->fetchAll();
    foreach ($rows as &$r) { $r['id'] = (int) $r['id']; $r['totaal'] = (float) $r['totaal']; }
    return $rows;
}

function bank_koppel(int $id, int $transactieId): void {
    $t = db()->prepare("SELECT id FROM transacties WHERE id = :t");
    $t->execute([':t' => $transactieId]);
    if (!$t->fetch()) throw new RuntimeException('Boeking niet gevonden');
    db()->prepare("UPDATE banktransacties SET transactie_id = :t, status = 'gekoppeld' WHERE id = :id")
        ->execute([':t' => $transactieId, ':id' => $id]);
}

function bank_ontkoppel(int $id): void {
    db()->prepare("UPDATE banktransacties SET transactie_id = NULL, status = 'open' WHERE id = :id")->execute([':id' => $id]);
}

function bank_status(int $id, string $status): void {
    if (!in_array($status, ['open', 'genegeerd'], true)) $status = 'open';
    db()->prepare("UPDATE banktransacties SET status = :s WHERE id = :id AND transactie_id IS NULL")->execute([':s' => $status, ':id' => $id]);
}

function bank_leverancier_zet(int $id, ?int $leverancierId): void {
    db()->prepare("UPDATE banktransacties SET leverancier_id = :l WHERE id = :id")->execute([':l' => $leverancierId ?: null, ':id' => $id]);
}
