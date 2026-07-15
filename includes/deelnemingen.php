<?php
/* =====================================================================
 *  BV BOEKHOUDING — includes/deelnemingen.php
 *  Zelf bij te houden register van deelnemingen. De boekwaarde komt uit
 *  de gekoppelde grootboekrekening; mutaties boek je als memoriaal.
 * ===================================================================== */

/* Register + live boekwaarde uit de gekoppelde grootboekrekening. */
function deelnemingen_lijst(): array {
    $rows = db()->query("SELECT * FROM deelnemingen ORDER BY (status = 'actief') DESC, naam")->fetchAll();
    $saldo = [];
    foreach (bh_grootboek() as $g) { $saldo[$g['nummer']] = (float) $g['saldo']; }
    foreach ($rows as &$r) {
        $r['id'] = (int) $r['id'];
        $r['opgericht'] = $r['opgericht'] !== null ? (int) $r['opgericht'] : null;
        $r['beeindigd'] = $r['beeindigd'] !== null ? (int) $r['beeindigd'] : null;
        $r['boekwaarde'] = ($r['rekeningnummer'] && isset($saldo[$r['rekeningnummer']])) ? $saldo[$r['rekeningnummer']] : null;
    }
    return $rows;
}

function deelneming_opslaan(array $in): array {
    $naam = trim((string) ($in['naam'] ?? ''));
    if ($naam === '') json_response(['fout' => 'Naam is verplicht'], 422);
    $status = (string) ($in['status'] ?? 'actief');
    if (!in_array($status, ['actief', 'opgeheven', 'failliet', 'verkocht'], true)) $status = 'actief';
    $data = [
        ':naam'      => $naam,
        ':rek'       => trim((string) ($in['rekeningnummer'] ?? '')) ?: null,
        ':aandeel'   => trim((string) ($in['aandeel'] ?? '')) ?: null,
        ':land'      => trim((string) ($in['land'] ?? '')) ?: null,
        ':status'    => $status,
        ':opgericht' => (string) ($in['opgericht'] ?? '') !== '' ? (int) $in['opgericht'] : null,
        ':beeindigd' => (string) ($in['beeindigd'] ?? '') !== '' ? (int) $in['beeindigd'] : null,
        ':toel'      => trim((string) ($in['toelichting'] ?? '')) ?: null,
    ];
    $id = (int) ($in['id'] ?? 0);
    try {
        if ($id > 0) {
            $data[':id'] = $id;
            db()->prepare("UPDATE deelnemingen SET naam=:naam, rekeningnummer=:rek, aandeel=:aandeel, land=:land, status=:status, opgericht=:opgericht, beeindigd=:beeindigd, toelichting=:toel WHERE id=:id")->execute($data);
        } else {
            db()->prepare("INSERT INTO deelnemingen (naam, rekeningnummer, aandeel, land, status, opgericht, beeindigd, toelichting) VALUES (:naam,:rek,:aandeel,:land,:status,:opgericht,:beeindigd,:toel)")->execute($data);
            $id = (int) db()->lastInsertId();
        }
    } catch (PDOException $e) {
        if ($e->getCode() === '23000') json_response(['fout' => 'Er bestaat al een deelneming met deze naam'], 422);
        throw $e;
    }
    return ['ok' => true, 'id' => $id];
}

function deelneming_verwijder(int $id): void {
    db()->prepare("DELETE FROM deelnemingen WHERE id = :id")->execute([':id' => $id]);
}

/* Seed het register vanuit een jaarrekening-import; bestaande (zelf beheerde)
 * regels worden NIET overschreven (INSERT IGNORE op unieke naam). */
function deelnemingen_seed(array $deelnemingen): int {
    $ins = db()->prepare(
        "INSERT IGNORE INTO deelnemingen (naam, rekeningnummer, aandeel, status, toelichting)
         VALUES (:naam,:rek,:aandeel,:status,:toel)"
    );
    $n = 0;
    foreach ($deelnemingen as $x) {
        $naam = trim((string) ($x['naam'] ?? ''));
        if ($naam === '') continue;
        $tekst = trim((string) ($x['status'] ?? ''));
        $status = preg_match('/failliet/i', $tekst) ? 'failliet'
            : (preg_match('/opgehev|be[eë]indig|geliquideerd|ontbonden/i', $tekst) ? 'opgeheven'
            : (preg_match('/verkocht|verkoop/i', $tekst) ? 'verkocht' : 'actief'));
        $ins->execute([
            ':naam'   => $naam,
            ':rek'    => trim((string) ($x['rekeningnummer'] ?? '')) ?: null,
            ':aandeel' => trim((string) ($x['aandeel'] ?? '')) ?: null,
            ':status' => $status,
            ':toel'   => $tekst ?: null,
        ]);
        if ($ins->rowCount() > 0) $n++;
    }
    return $n;
}
