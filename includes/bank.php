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
    if (!in_array($regime, ['21', '9', '0', 'geen', 'verlegd'], true)) $regime = '21';
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

// --- Overzicht + afletteren -----------------------------------------
function bank_lijst(?string $status = null): array {
    $sql = "SELECT b.id, b.datum, b.bedrag, b.afbij, b.tegenrekening_iban, b.tegenrekening_naam,
                   b.omschrijving, b.status, b.transactie_id, b.leverancier_id,
                   l.naam AS leverancier_naam, l.btw_regime, l.standaard_rekening,
                   t.omschrijving AS boeking_oms, t.datum AS boeking_datum,
                   (SELECT COUNT(*) FROM (
                       SELECT tt.id, (SELECT COALESCE(SUM(debet),0) FROM transactie_regels rr WHERE rr.transactie_id = tt.id) AS tot
                       FROM transacties tt
                       WHERE tt.id NOT IN (SELECT transactie_id FROM banktransacties WHERE transactie_id IS NOT NULL)
                   ) mm WHERE ABS(mm.tot - b.bedrag) < 0.005) AS match_count
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
    }
    return $rows;
}

/* Kandidaat-boekingen met hetzelfde (incl.) bedrag die nog niet gekoppeld zijn. */
function bank_suggesties(int $id): array {
    $b = db()->prepare("SELECT bedrag, datum FROM banktransacties WHERE id = :id");
    $b->execute([':id' => $id]);
    $bt = $b->fetch();
    if (!$bt) return [];
    $q = db()->prepare(
        "SELECT x.id, x.datum, x.omschrijving, x.factuur_nummer, x.totaal FROM (
            SELECT t.id, t.datum, t.omschrijving, t.factuur_nummer,
                   (SELECT COALESCE(SUM(debet),0) FROM transactie_regels r WHERE r.transactie_id = t.id) AS totaal
            FROM transacties t
            WHERE t.id NOT IN (SELECT transactie_id FROM banktransacties WHERE transactie_id IS NOT NULL)
         ) x
         WHERE ABS(x.totaal - :bedrag) < 0.005
         ORDER BY ABS(DATEDIFF(x.datum, :datum)) ASC
         LIMIT 10"
    );
    $q->execute([':bedrag' => $bt['bedrag'], ':datum' => $bt['datum']]);
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
