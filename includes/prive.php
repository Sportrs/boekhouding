<?php
/* =====================================================================
 *  BV BOEKHOUDING — includes/prive.php
 *  Privéboekhouding, volledig los van de BV. Persoonlijke rekeningen +
 *  bankimport (MT940), categorieën met auto-herkenning, vermogens-
 *  overzicht en een register van te ontvangen/te betalen bedragen.
 *  Transactiebedrag is ONDERTEKEND: + = bij/inkomst, − = af/uitgave.
 * ===================================================================== */

// --- Rekeningen ------------------------------------------------------
function prive_rekeningen_lijst(): array {
    $saldi = [];
    foreach (db()->query("SELECT rekening_id, COALESCE(SUM(bedrag),0) AS s FROM prive_transacties GROUP BY rekening_id")->fetchAll() as $r) {
        $saldi[(int) $r['rekening_id']] = (float) $r['s'];
    }
    $rows = db()->query("SELECT * FROM prive_rekeningen ORDER BY volgorde, naam")->fetchAll();
    foreach ($rows as &$r) {
        $r['id'] = (int) $r['id'];
        $r['beginsaldo'] = (float) $r['beginsaldo'];
        $r['saldo'] = centen($r['beginsaldo'] + ($saldi[$r['id']] ?? 0));
        $r['aantal'] = 0;
    }
    return $rows;
}

function prive_rekening_opslaan(array $in): array {
    $naam = trim((string) ($in['naam'] ?? ''));
    if ($naam === '') json_response(['fout' => 'Naam is verplicht'], 422);
    $soort = (string) ($in['soort'] ?? 'bank');
    if (!in_array($soort, ['bank', 'spaar', 'contant', 'bezitting', 'overig'], true)) $soort = 'bank';
    $data = [
        ':naam' => $naam,
        ':soort' => $soort,
        ':iban' => trim((string) ($in['iban'] ?? '')) ?: null,
        ':begin' => centen((float) str_replace(',', '.', (string) ($in['beginsaldo'] ?? 0))),
    ];
    $id = (int) ($in['id'] ?? 0);
    if ($id > 0) {
        $data[':id'] = $id;
        db()->prepare("UPDATE prive_rekeningen SET naam=:naam, soort=:soort, iban=:iban, beginsaldo=:begin WHERE id=:id")->execute($data);
    } else {
        db()->prepare("INSERT INTO prive_rekeningen (naam, soort, iban, beginsaldo) VALUES (:naam,:soort,:iban,:begin)")->execute($data);
        $id = (int) db()->lastInsertId();
    }
    return ['ok' => true, 'id' => $id];
}

function prive_rekening_verwijder(int $id): void {
    // Transacties hangen met ON DELETE CASCADE mee.
    db()->prepare("DELETE FROM prive_rekeningen WHERE id = :id")->execute([':id' => $id]);
}

// --- Categorieën -----------------------------------------------------
function prive_categorieen_lijst(): array {
    $rows = db()->query("SELECT * FROM prive_categorieen ORDER BY soort DESC, naam")->fetchAll();
    foreach ($rows as &$r) { $r['id'] = (int) $r['id']; }
    return $rows;
}

function prive_categorie_opslaan(array $in): array {
    $naam = trim((string) ($in['naam'] ?? ''));
    if ($naam === '') json_response(['fout' => 'Naam is verplicht'], 422);
    $soort = (string) ($in['soort'] ?? 'uitgave');
    if (!in_array($soort, ['inkomst', 'uitgave'], true)) $soort = 'uitgave';
    $id = (int) ($in['id'] ?? 0);
    try {
        if ($id > 0) {
            db()->prepare("UPDATE prive_categorieen SET naam=:n, soort=:s WHERE id=:id")->execute([':n' => $naam, ':s' => $soort, ':id' => $id]);
        } else {
            db()->prepare("INSERT INTO prive_categorieen (naam, soort) VALUES (:n,:s)")->execute([':n' => $naam, ':s' => $soort]);
            $id = (int) db()->lastInsertId();
        }
    } catch (PDOException $e) {
        if ($e->getCode() === '23000') json_response(['fout' => 'Er bestaat al een categorie met deze naam'], 422);
        throw $e;
    }
    return ['ok' => true, 'id' => $id];
}

function prive_categorie_verwijder(int $id): void {
    db()->prepare("DELETE FROM prive_categorieen WHERE id = :id")->execute([':id' => $id]);
}

// --- Auto-categorisatie (op zoekterm in naam/omschrijving) -----------
function prive_categorie_raden(string $naam, string $oms): ?int {
    $regels = db()->query("SELECT zoekterm, categorie_id FROM prive_regels")->fetchAll();
    $hooi = mb_strtolower($naam . ' ' . $oms);
    foreach ($regels as $r) {
        $term = mb_strtolower(trim($r['zoekterm']));
        if ($term !== '' && mb_strpos($hooi, $term) !== false) return (int) $r['categorie_id'];
    }
    return null;
}

/* Onthoud: koppel een zoekterm aan een categorie (voor toekomstige import). */
function prive_regel_opslaan(string $zoekterm, int $categorieId): void {
    $zoekterm = trim($zoekterm);
    if ($zoekterm === '' || $categorieId <= 0) return;
    // Voorkom exacte duplicaten.
    $q = db()->prepare("SELECT id FROM prive_regels WHERE zoekterm = :z AND categorie_id = :c");
    $q->execute([':z' => $zoekterm, ':c' => $categorieId]);
    if ($q->fetch()) return;
    db()->prepare("INSERT INTO prive_regels (zoekterm, categorie_id) VALUES (:z,:c)")->execute([':z' => $zoekterm, ':c' => $categorieId]);
}

// --- Transacties -----------------------------------------------------
function prive_transacties_lijst(array $f): array {
    $sql = "SELECT t.*, c.naam AS categorie_naam, c.soort AS categorie_soort, r.naam AS rekening_naam
            FROM prive_transacties t
            LEFT JOIN prive_categorieen c ON c.id = t.categorie_id
            LEFT JOIN prive_rekeningen r ON r.id = t.rekening_id WHERE 1=1";
    $p = [];
    if (!empty($f['rekening'])) { $sql .= " AND t.rekening_id = :rek"; $p[':rek'] = (int) $f['rekening']; }
    if (!empty($f['from']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $f['from'])) { $sql .= " AND t.datum >= :from"; $p[':from'] = $f['from']; }
    if (!empty($f['to']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $f['to'])) { $sql .= " AND t.datum <= :to"; $p[':to'] = $f['to']; }
    if (!empty($f['categorie'])) { $sql .= " AND t.categorie_id = :cat"; $p[':cat'] = (int) $f['categorie']; }
    if (!empty($f['ongecategoriseerd'])) { $sql .= " AND t.categorie_id IS NULL"; }
    $sql .= " ORDER BY t.datum DESC, t.id DESC LIMIT 1000";
    $q = db()->prepare($sql);
    $q->execute($p);
    $rows = $q->fetchAll();
    foreach ($rows as &$r) {
        $r['id'] = (int) $r['id'];
        $r['rekening_id'] = (int) $r['rekening_id'];
        $r['bedrag'] = (float) $r['bedrag'];
        $r['categorie_id'] = $r['categorie_id'] !== null ? (int) $r['categorie_id'] : null;
        unset($r['ruw']);
    }
    return $rows;
}

function prive_transactie_opslaan(array $in): array {
    $rek = (int) ($in['rekeningId'] ?? 0);
    if ($rek <= 0) json_response(['fout' => 'Kies een rekening'], 422);
    $datum = (string) ($in['datum'] ?? '');
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $datum)) json_response(['fout' => 'Geldige datum is verplicht'], 422);
    $bedrag = centen((float) str_replace(',', '.', (string) ($in['bedrag'] ?? 0)));
    if ($bedrag == 0.0) json_response(['fout' => 'Bedrag mag niet 0 zijn (− voor uitgave, + voor inkomst)'], 422);
    $data = [
        ':rek' => $rek, ':datum' => $datum, ':bedrag' => $bedrag,
        ':naam' => trim((string) ($in['tegenrekeningNaam'] ?? '')) ?: null,
        ':oms' => trim((string) ($in['omschrijving'] ?? '')) ?: null,
        ':cat' => (int) ($in['categorieId'] ?? 0) ?: null,
    ];
    $id = (int) ($in['id'] ?? 0);
    if ($id > 0) {
        $data[':id'] = $id;
        db()->prepare("UPDATE prive_transacties SET rekening_id=:rek, datum=:datum, bedrag=:bedrag, tegenrekening_naam=:naam, omschrijving=:oms, categorie_id=:cat WHERE id=:id")->execute($data);
    } else {
        db()->prepare("INSERT INTO prive_transacties (rekening_id, datum, bedrag, tegenrekening_naam, omschrijving, categorie_id) VALUES (:rek,:datum,:bedrag,:naam,:oms,:cat)")->execute($data);
        $id = (int) db()->lastInsertId();
    }
    return ['ok' => true, 'id' => $id];
}

function prive_transactie_categorie(int $id, ?int $categorieId, bool $onthoud): array {
    db()->prepare("UPDATE prive_transacties SET categorie_id = :c WHERE id = :id")->execute([':c' => $categorieId ?: null, ':id' => $id]);
    if ($onthoud && $categorieId) {
        $q = db()->prepare("SELECT tegenrekening_naam FROM prive_transacties WHERE id = :id");
        $q->execute([':id' => $id]);
        $naam = trim((string) ($q->fetchColumn() ?: ''));
        // Strip een variabel (winkel)nummer aan het eind, zodat "ALBERT HEIJN 1234"
        // een generieke regel "ALBERT HEIJN" wordt die ook op andere filialen matcht.
        $term = trim((string) preg_replace('/\s+\d[\d\s\/.\-*]*$/u', '', $naam));
        if (mb_strlen($term) < 3) $term = $naam;
        if ($term !== '') prive_regel_opslaan($term, $categorieId);
    }
    return ['ok' => true];
}

function prive_transactie_verwijder(int $id): void {
    db()->prepare("DELETE FROM prive_transacties WHERE id = :id")->execute([':id' => $id]);
}

// --- Bankimport (MT940) ----------------------------------------------
function prive_bank_import(int $rekeningId, string $inhoud): array {
    require_once __DIR__ . '/mt940.php';
    $q = db()->prepare("SELECT id FROM prive_rekeningen WHERE id = :id");
    $q->execute([':id' => $rekeningId]);
    if (!$q->fetch()) json_response(['fout' => 'Kies eerst een privérekening om op te importeren'], 422);

    $p = mt940_parse($inhoud);
    if (!$p['regels']) throw new RuntimeException('Geen bankregels gevonden — is dit een MT940 (.sta) bestand?');

    $ins = db()->prepare(
        "INSERT IGNORE INTO prive_transacties
         (rekening_id, datum, bedrag, tegenrekening_iban, tegenrekening_naam, omschrijving, categorie_id, hash, ruw)
         VALUES (:rek,:d,:b,:iban,:naam,:oms,:cat,:hash,:ruw)"
    );
    $tellers = [];
    $geimp = 0; $over = 0;
    foreach ($p['regels'] as $r) {
        $bedrag = centen($r['afbij'] === 'af' ? -abs((float) $r['bedrag']) : abs((float) $r['bedrag']));
        $base = sha1($rekeningId . '|' . $r['datum'] . '|' . $bedrag . '|' . $r['tegenrekening_iban'] . '|' . $r['omschrijving']);
        $n = $tellers[$base] ?? 0; $tellers[$base] = $n + 1;
        $hash = sha1($base . '#' . $n);
        $cat = prive_categorie_raden($r['tegenrekening_naam'], $r['omschrijving']);
        $ins->execute([
            ':rek' => $rekeningId, ':d' => $r['datum'], ':b' => $bedrag,
            ':iban' => $r['tegenrekening_iban'] ?: null, ':naam' => $r['tegenrekening_naam'] ?: null,
            ':oms' => $r['omschrijving'] ?: null, ':cat' => $cat, ':hash' => $hash, ':ruw' => $r['ruw'],
        ]);
        if ($ins->rowCount() > 0) $geimp++; else $over++;
    }
    return ['geimporteerd' => $geimp, 'overgeslagen' => $over, 'totaal' => count($p['regels']),
            'iban' => $p['iban'], 'eindsaldo' => $p['eindsaldo']];
}

// --- Te ontvangen / te betalen (register) ----------------------------
function prive_posten_lijst(): array {
    $rows = db()->query("SELECT * FROM prive_posten ORDER BY (status='open') DESC, vervaldatum IS NULL, vervaldatum, naam")->fetchAll();
    foreach ($rows as &$r) { $r['id'] = (int) $r['id']; $r['bedrag'] = (float) $r['bedrag']; }
    return $rows;
}

function prive_post_opslaan(array $in): array {
    $naam = trim((string) ($in['naam'] ?? ''));
    if ($naam === '') json_response(['fout' => 'Naam is verplicht'], 422);
    $soort = (string) ($in['soort'] ?? 'vordering');
    if (!in_array($soort, ['vordering', 'schuld'], true)) $soort = 'vordering';
    $status = (string) ($in['status'] ?? 'open');
    if (!in_array($status, ['open', 'afgehandeld'], true)) $status = 'open';
    $dv = fn($k) => (preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) ($in[$k] ?? '')) ? (string) $in[$k] : null);
    $data = [
        ':naam' => $naam, ':soort' => $soort,
        ':bedrag' => centen((float) str_replace(',', '.', (string) ($in['bedrag'] ?? 0))),
        ':tp' => trim((string) ($in['tegenpartij'] ?? '')) ?: null,
        ':datum' => $dv('datum'), ':verval' => $dv('vervaldatum'),
        ':status' => $status, ':toel' => trim((string) ($in['toelichting'] ?? '')) ?: null,
    ];
    $id = (int) ($in['id'] ?? 0);
    if ($id > 0) {
        $data[':id'] = $id;
        db()->prepare("UPDATE prive_posten SET naam=:naam, soort=:soort, bedrag=:bedrag, tegenpartij=:tp, datum=:datum, vervaldatum=:verval, status=:status, toelichting=:toel WHERE id=:id")->execute($data);
    } else {
        db()->prepare("INSERT INTO prive_posten (naam, soort, bedrag, tegenpartij, datum, vervaldatum, status, toelichting) VALUES (:naam,:soort,:bedrag,:tp,:datum,:verval,:status,:toel)")->execute($data);
        $id = (int) db()->lastInsertId();
    }
    return ['ok' => true, 'id' => $id];
}

function prive_post_status(int $id, string $status): void {
    if (!in_array($status, ['open', 'afgehandeld'], true)) $status = 'open';
    db()->prepare("UPDATE prive_posten SET status = :s WHERE id = :id")->execute([':s' => $status, ':id' => $id]);
}

function prive_post_verwijder(int $id): void {
    db()->prepare("DELETE FROM prive_posten WHERE id = :id")->execute([':id' => $id]);
}

// --- Overzicht (vermogen + uitgaven per categorie) -------------------
function prive_overzicht(string $from, string $to): array {
    $rek = prive_rekeningen_lijst();
    $totRek = 0.0;
    foreach ($rek as $r) $totRek += $r['saldo'];
    $vord = (float) db()->query("SELECT COALESCE(SUM(bedrag),0) FROM prive_posten WHERE soort='vordering' AND status='open'")->fetchColumn();
    $schuld = (float) db()->query("SELECT COALESCE(SUM(bedrag),0) FROM prive_posten WHERE soort='schuld' AND status='open'")->fetchColumn();

    $q = db()->prepare(
        "SELECT t.bedrag, c.naam AS cat, c.soort AS catsoort
         FROM prive_transacties t LEFT JOIN prive_categorieen c ON c.id = t.categorie_id
         WHERE t.datum BETWEEN :f AND :t"
    );
    $q->execute([':f' => $from, ':t' => $to]);
    $inkomsten = 0.0; $uitgaven = 0.0; $perCat = [];
    foreach ($q->fetchAll() as $r) {
        $b = (float) $r['bedrag'];
        if ($b >= 0) $inkomsten += $b; else $uitgaven += $b;
        if ($b < 0) {
            $key = $r['cat'] ?: 'Ongecategoriseerd';
            $perCat[$key] = ($perCat[$key] ?? 0) + (-$b);
        }
    }
    arsort($perCat);
    $cats = [];
    foreach ($perCat as $naam => $bedrag) $cats[] = ['naam' => $naam, 'bedrag' => centen($bedrag)];

    return [
        'from' => $from, 'to' => $to,
        'vermogen'    => centen($totRek + $vord - $schuld),
        'totRekeningen' => centen($totRek),
        'vorderingen' => centen($vord),
        'schulden'    => centen($schuld),
        'rekeningen'  => $rek,
        'inkomsten'   => centen($inkomsten),
        'uitgaven'    => centen($uitgaven),
        'perCategorie' => $cats,
    ];
}
