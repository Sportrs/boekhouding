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
        $r['aandeel'] = (float) ($r['aandeel'] ?? 100);
        $r['saldo'] = centen($r['beginsaldo'] + ($saldi[$r['id']] ?? 0));
        $r['aandeelSaldo'] = centen($r['saldo'] * $r['aandeel'] / 100);
    }
    return $rows;
}

function prive_rekening_opslaan(array $in): array {
    $naam = trim((string) ($in['naam'] ?? ''));
    if ($naam === '') json_response(['fout' => 'Naam is verplicht'], 422);
    $soort = (string) ($in['soort'] ?? 'bank');
    if (!in_array($soort, ['bank', 'spaar', 'contant', 'bezitting', 'overig'], true)) $soort = 'bank';
    $aandeel = (float) str_replace(',', '.', (string) ($in['aandeel'] ?? 100));
    if ($aandeel <= 0 || $aandeel > 100) $aandeel = 100;
    $data = [
        ':naam' => $naam,
        ':soort' => $soort,
        ':iban' => trim((string) ($in['iban'] ?? '')) ?: null,
        ':begin' => centen((float) str_replace(',', '.', (string) ($in['beginsaldo'] ?? 0))),
        ':aandeel' => centen($aandeel),
    ];
    $id = (int) ($in['id'] ?? 0);
    if ($id > 0) {
        $data[':id'] = $id;
        db()->prepare("UPDATE prive_rekeningen SET naam=:naam, soort=:soort, iban=:iban, beginsaldo=:begin, aandeel=:aandeel WHERE id=:id")->execute($data);
    } else {
        db()->prepare("INSERT INTO prive_rekeningen (naam, soort, iban, beginsaldo, aandeel) VALUES (:naam,:soort,:iban,:begin,:aandeel)")->execute($data);
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
    if (!in_array($soort, ['inkomst', 'uitgave', 'neutraal'], true)) $soort = 'uitgave';
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
function prive_regel_onthoud(string $zoekterm, int $categorieId): void {
    $zoekterm = trim($zoekterm);
    if ($zoekterm === '' || $categorieId <= 0) return;
    // Voorkom exacte duplicaten.
    $q = db()->prepare("SELECT id FROM prive_regels WHERE zoekterm = :z AND categorie_id = :c");
    $q->execute([':z' => $zoekterm, ':c' => $categorieId]);
    if ($q->fetch()) return;
    db()->prepare("INSERT INTO prive_regels (zoekterm, categorie_id) VALUES (:z,:c)")->execute([':z' => $zoekterm, ':c' => $categorieId]);
}

/* Beheer van auto-categorisatieregels. */
function prive_regels_lijst(): array {
    $rows = db()->query(
        "SELECT r.id, r.zoekterm, r.categorie_id, c.naam AS categorie_naam, c.soort AS categorie_soort
         FROM prive_regels r JOIN prive_categorieen c ON c.id = r.categorie_id
         ORDER BY r.zoekterm"
    )->fetchAll();
    foreach ($rows as &$x) { $x['id'] = (int) $x['id']; $x['categorie_id'] = (int) $x['categorie_id']; }
    return $rows;
}

function prive_regel_opslaan(array $in): array {
    $zoek = trim((string) ($in['zoekterm'] ?? ''));
    if ($zoek === '') json_response(['fout' => 'Zoekterm is verplicht'], 422);
    $cat = (int) ($in['categorieId'] ?? 0);
    if ($cat <= 0) json_response(['fout' => 'Kies een categorie'], 422);
    $id = (int) ($in['id'] ?? 0);
    if ($id > 0) {
        db()->prepare("UPDATE prive_regels SET zoekterm=:z, categorie_id=:c WHERE id=:id")->execute([':z' => $zoek, ':c' => $cat, ':id' => $id]);
    } else {
        db()->prepare("INSERT INTO prive_regels (zoekterm, categorie_id) VALUES (:z,:c)")->execute([':z' => $zoek, ':c' => $cat]);
        $id = (int) db()->lastInsertId();
    }
    return ['ok' => true, 'id' => $id];
}

function prive_regel_verwijder(int $id): void {
    db()->prepare("DELETE FROM prive_regels WHERE id = :id")->execute([':id' => $id]);
}

/* Pas alle regels toe op nog ongecategoriseerde transacties. */
function prive_regels_toepassen(): array {
    $tx = db()->query("SELECT id, tegenrekening_naam, omschrijving FROM prive_transacties WHERE categorie_id IS NULL")->fetchAll();
    $upd = db()->prepare("UPDATE prive_transacties SET categorie_id = :c WHERE id = :id");
    $n = 0;
    foreach ($tx as $t) {
        $c = prive_categorie_raden((string) $t['tegenrekening_naam'], (string) $t['omschrijving']);
        if ($c) { $upd->execute([':c' => $c, ':id' => $t['id']]); $n++; }
    }
    return ['ok' => true, 'bijgewerkt' => $n];
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
    if (!empty($f['gecategoriseerd'])) { $sql .= " AND t.categorie_id IS NOT NULL"; }
    $sql .= " ORDER BY t.datum DESC, t.id DESC LIMIT 1000";
    $q = db()->prepare($sql);
    $q->execute($p);
    $rows = $q->fetchAll();
    foreach ($rows as &$r) {
        $r['id'] = (int) $r['id'];
        $r['rekening_id'] = (int) $r['rekening_id'];
        $r['bedrag'] = (float) $r['bedrag'];
        $r['categorie_id'] = $r['categorie_id'] !== null ? (int) $r['categorie_id'] : null;
        $r['koppel_id'] = $r['koppel_id'] !== null ? (int) $r['koppel_id'] : null;
        unset($r['ruw']);
    }
    return $rows;
}

/* Aantallen voor de tabs: alles / zonder categorie / met categorie. */
function prive_transacties_tellingen(): array {
    $tot = (int) db()->query("SELECT COUNT(*) FROM prive_transacties")->fetchColumn();
    $onc = (int) db()->query("SELECT COUNT(*) FROM prive_transacties WHERE categorie_id IS NULL")->fetchColumn();
    return ['alle' => $tot, 'ongecat' => $onc, 'gecat' => $tot - $onc];
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
        if ($term !== '') prive_regel_onthoud($term, $categorieId);
    }
    return ['ok' => true];
}

function prive_transactie_verwijder(int $id): void {
    db()->prepare("UPDATE prive_transacties SET koppel_id = NULL WHERE koppel_id = :id")->execute([':id' => $id]);
    db()->prepare("DELETE FROM prive_transacties WHERE id = :id")->execute([':id' => $id]);
}

/* Zorg voor een neutrale categorie "Overboeking eigen rekening" en geef de id. */
function prive_overboeking_categorie_id(): int {
    db()->prepare("INSERT IGNORE INTO prive_categorieen (naam, soort) VALUES ('Overboeking eigen rekening','neutraal')")->execute();
    return (int) db()->query("SELECT id FROM prive_categorieen WHERE naam = 'Overboeking eigen rekening'")->fetchColumn();
}

/* Nieuwe overboeking tussen twee eigen rekeningen: maakt beide kanten aan. */
function prive_overboeking(array $in): array {
    $van = (int) ($in['vanRekening'] ?? 0);
    $naar = (int) ($in['naarRekening'] ?? 0);
    if ($van <= 0 || $naar <= 0) json_response(['fout' => 'Kies een van- en naar-rekening'], 422);
    if ($van === $naar) json_response(['fout' => 'Van- en naar-rekening moeten verschillen'], 422);
    $datum = (string) ($in['datum'] ?? '');
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $datum)) json_response(['fout' => 'Geldige datum is verplicht'], 422);
    $bedrag = centen((float) str_replace(',', '.', (string) ($in['bedrag'] ?? 0)));
    if ($bedrag <= 0) json_response(['fout' => 'Bedrag moet groter dan 0 zijn'], 422);
    $namen = db()->prepare("SELECT id, naam FROM prive_rekeningen WHERE id IN (:a,:b)");
    $namen->execute([':a' => $van, ':b' => $naar]);
    $rk = [];
    foreach ($namen->fetchAll() as $r) $rk[(int) $r['id']] = $r['naam'];
    if (count($rk) !== 2) json_response(['fout' => 'Onbekende rekening'], 422);
    $cat = prive_overboeking_categorie_id();
    $oms = trim((string) ($in['omschrijving'] ?? '')) ?: 'Overboeking eigen rekening';

    db()->beginTransaction();
    $ins = db()->prepare("INSERT INTO prive_transacties (rekening_id, datum, bedrag, tegenrekening_naam, omschrijving, categorie_id) VALUES (:r,:d,:b,:tn,:o,:c)");
    $ins->execute([':r' => $van, ':d' => $datum, ':b' => -$bedrag, ':tn' => $rk[$naar], ':o' => $oms, ':c' => $cat]);
    $idA = (int) db()->lastInsertId();
    $ins->execute([':r' => $naar, ':d' => $datum, ':b' => $bedrag, ':tn' => $rk[$van], ':o' => $oms, ':c' => $cat]);
    $idB = (int) db()->lastInsertId();
    db()->prepare("UPDATE prive_transacties SET koppel_id = :b WHERE id = :a")->execute([':a' => $idA, ':b' => $idB]);
    db()->prepare("UPDATE prive_transacties SET koppel_id = :a WHERE id = :b")->execute([':a' => $idA, ':b' => $idB]);
    db()->commit();
    return ['ok' => true];
}

/* Koppel een bestaande (geïmporteerde) transactie aan een doelrekening:
 * maakt de tegenboeking op die rekening (spiegelbedrag) en linkt beide. */
function prive_transactie_koppel_rekening(int $txId, int $doelRekeningId): array {
    $q = db()->prepare("SELECT * FROM prive_transacties WHERE id = :id");
    $q->execute([':id' => $txId]);
    $t = $q->fetch();
    if (!$t) json_response(['fout' => 'Transactie niet gevonden'], 404);
    if (!empty($t['koppel_id'])) json_response(['fout' => 'Deze transactie is al aan een rekening gekoppeld'], 422);
    if ($doelRekeningId <= 0 || (int) $t['rekening_id'] === $doelRekeningId) json_response(['fout' => 'Kies een andere doelrekening'], 422);
    $n = db()->prepare("SELECT naam FROM prive_rekeningen WHERE id = :id");
    $n->execute([':id' => $doelRekeningId]);
    if ($n->fetchColumn() === false) json_response(['fout' => 'Onbekende doelrekening'], 422);
    $n->execute([':id' => $t['rekening_id']]);
    $bronNaam = (string) $n->fetchColumn();
    $cat = prive_overboeking_categorie_id();   // beide kanten neutraal: geen valse inkomst/uitgave

    db()->beginTransaction();
    $ins = db()->prepare("INSERT INTO prive_transacties (rekening_id, datum, bedrag, tegenrekening_naam, omschrijving, categorie_id, koppel_id) VALUES (:r,:d,:b,:tn,:o,:c,:k)");
    $ins->execute([':r' => $doelRekeningId, ':d' => $t['datum'], ':b' => centen(-(float) $t['bedrag']), ':tn' => $bronNaam, ':o' => 'Overboeking van ' . $bronNaam, ':c' => $cat, ':k' => $txId]);
    $mirror = (int) db()->lastInsertId();
    db()->prepare("UPDATE prive_transacties SET koppel_id = :m, categorie_id = :c WHERE id = :id")->execute([':m' => $mirror, ':c' => $cat, ':id' => $txId]);
    db()->commit();
    return ['ok' => true];
}

// --- Bankimport (MT940 of ING CSV) -----------------------------------
function prive_bank_import(int $rekeningId, string $inhoud): array {
    require_once __DIR__ . '/mt940.php';
    require_once __DIR__ . '/csv_ing.php';
    $q = db()->prepare("SELECT id FROM prive_rekeningen WHERE id = :id");
    $q->execute([':id' => $rekeningId]);
    if (!$q->fetch()) json_response(['fout' => 'Kies eerst een privérekening om op te importeren'], 422);

    // Formaat herkennen: ING CSV of MT940.
    if (ing_csv_is($inhoud)) {
        $p = ing_csv_parse($inhoud);
        $formaat = 'ING CSV';
    } else {
        $p = mt940_parse($inhoud);
        $formaat = 'MT940';
    }
    if (!$p['regels']) throw new RuntimeException('Geen bankregels gevonden — is dit een MT940 (.sta) of ING CSV bestand?');

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
            'iban' => $p['iban'], 'eindsaldo' => $p['eindsaldo'], 'formaat' => $formaat];
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

/* Volledige schone lei voor de privéboekhouding: wist rekeningen, transacties,
 * posten en regels. Categorieën blijven staan. */
function prive_reset(): array {
    db()->exec("DELETE FROM prive_transacties");
    db()->exec("DELETE FROM prive_posten");
    db()->exec("DELETE FROM prive_regels");
    db()->exec("DELETE FROM prive_rekeningen");
    return ['ok' => true];
}

// --- Overzicht (vermogen + uitgaven per categorie) -------------------
function prive_overzicht(string $from, string $to): array {
    $rek = prive_rekeningen_lijst();
    $totRek = 0.0;
    foreach ($rek as $r) $totRek += $r['aandeelSaldo'];   // jouw aandeel per rekening
    $vord = (float) db()->query("SELECT COALESCE(SUM(bedrag),0) FROM prive_posten WHERE soort='vordering' AND status='open'")->fetchColumn();
    $schuld = (float) db()->query("SELECT COALESCE(SUM(bedrag),0) FROM prive_posten WHERE soort='schuld' AND status='open'")->fetchColumn();

    // Bedragen wegen we naar het aandeel van de rekening (gedeelde rekening telt half).
    // Neutrale categorieën (overboekingen) tellen NIET mee als inkomst/uitgave.
    $q = db()->prepare(
        "SELECT t.bedrag * r.aandeel / 100 AS bedrag, c.naam AS cat, c.soort AS catsoort
         FROM prive_transacties t
         JOIN prive_rekeningen r ON r.id = t.rekening_id
         LEFT JOIN prive_categorieen c ON c.id = t.categorie_id
         WHERE t.datum BETWEEN :f AND :t"
    );
    $q->execute([':f' => $from, ':t' => $to]);
    $inkomsten = 0.0; $uitgaven = 0.0; $perCat = [];
    foreach ($q->fetchAll() as $r) {
        $cs = $r['catsoort'] ?? '';
        if ($cs === 'neutraal') continue;
        $b = (float) $r['bedrag'];
        // Classificeer op categoriesoort; zonder categorie op het teken. Een teruggaaf
        // (positief) in een uitgave-categorie verrekent zo met de betaalde bedragen.
        if ($cs === 'inkomst') {
            $inkomsten += $b;
        } elseif ($cs === 'uitgave') {
            $uitgaven += $b;
            $perCat[$r['cat']] = ($perCat[$r['cat']] ?? 0) + (-$b);
        } elseif ($b >= 0) {
            $inkomsten += $b;
        } else {
            $uitgaven += $b;
            $perCat['Ongecategoriseerd'] = ($perCat['Ongecategoriseerd'] ?? 0) + (-$b);
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

/* Maand-op-maand: per categorie 12 maanden + totalen (gewogen naar aandeel). */
function prive_maandcijfers(int $jaar): array {
    $q = db()->prepare(
        "SELECT MONTH(t.datum) AS m, t.bedrag * r.aandeel / 100 AS bedrag, c.naam AS cat, c.soort AS catsoort
         FROM prive_transacties t
         JOIN prive_rekeningen r ON r.id = t.rekening_id
         LEFT JOIN prive_categorieen c ON c.id = t.categorie_id
         WHERE YEAR(t.datum) = :j"
    );
    $q->execute([':j' => $jaar]);

    $ink = array_fill(1, 12, 0.0);
    $uit = array_fill(1, 12, 0.0);
    $cats = [];
    foreach ($q->fetchAll() as $row) {
        $cs = $row['catsoort'] ?? '';
        if ($cs === 'neutraal') continue;   // overboekingen niet meetellen
        $m = (int) $row['m'];
        $b = (float) $row['bedrag'];
        // Classificeer op categoriesoort; zonder categorie op het teken.
        if ($cs === 'inkomst') $ink[$m] += $b;
        elseif ($cs === 'uitgave') $uit[$m] += $b;
        elseif ($b >= 0) $ink[$m] += $b;
        else $uit[$m] += $b;
        $key = $row['cat'] ?: 'Ongecategoriseerd';
        if (!isset($cats[$key])) {
            $cats[$key] = ['naam' => $key, 'soort' => $row['catsoort'] ?: ($b >= 0 ? 'inkomst' : 'uitgave'), 'perMaand' => array_fill(1, 12, 0.0), 'totaal' => 0.0];
        }
        $cats[$key]['perMaand'][$m] += $b;
        $cats[$key]['totaal'] += $b;
    }

    $lijst = array_values($cats);
    usort($lijst, function ($a, $b) {
        $au = $a['totaal'] < 0 ? 0 : 1;   // uitgaven eerst
        $bu = $b['totaal'] < 0 ? 0 : 1;
        if ($au !== $bu) return $au - $bu;
        return abs($b['totaal']) <=> abs($a['totaal']);
    });

    $reeks = function (array $assoc): array {
        $out = [];
        for ($m = 1; $m <= 12; $m++) $out[] = centen($assoc[$m]);
        return $out;
    };
    $categorieen = [];
    foreach ($lijst as $c) {
        $categorieen[] = ['naam' => $c['naam'], 'soort' => $c['soort'], 'perMaand' => $reeks($c['perMaand']), 'totaal' => centen($c['totaal'])];
    }
    $saldo = [];
    for ($m = 1; $m <= 12; $m++) $saldo[] = centen($ink[$m] + $uit[$m]);

    return [
        'jaar' => $jaar,
        'categorieen' => $categorieen,
        'inkomstenPerMaand' => $reeks($ink),
        'uitgavenPerMaand'  => $reeks($uit),
        'saldoPerMaand'     => $saldo,
        'totaalInkomsten'   => centen(array_sum($ink)),
        'totaalUitgaven'    => centen(array_sum($uit)),
    ];
}
