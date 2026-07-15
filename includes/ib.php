<?php
/* =====================================================================
 *  BV BOEKHOUDING — includes/ib.php
 *  Inkomstenbelasting (privé/DGA). Bewaart de invoer per jaar; de
 *  berekening (box 1/2/3) gebeurt in de frontend. Hier ook wat prefill
 *  uit de BV-boekhouding (rekening-courant-saldo).
 * ===================================================================== */

function ib_ophalen(int $jaar): array {
    $q = db()->prepare("SELECT gegevens FROM ib_gegevens WHERE jaar = :j");
    $q->execute([':j' => $jaar]);
    $row = $q->fetch();
    $gegevens = $row ? json_decode($row['gegevens'], true) : null;
    if (!is_array($gegevens)) $gegevens = [];

    // Prefill: rekening-courant met de BV (uit het grootboek).
    $rc = null;
    foreach (bh_grootboek() as $g) {
        if (preg_match('/rekening.?courant|aandeelhouder|directie/i', (string) $g['naam'])) {
            $rc = (float) $g['saldo'];
            break;
        }
    }

    return [
        'jaar'     => $jaar,
        'gegevens' => $gegevens,
        'prefill'  => ['rekeningCourant' => $rc],
    ];
}

function ib_opslaan(int $jaar, array $gegevens): array {
    db()->prepare("INSERT INTO ib_gegevens (jaar, gegevens) VALUES (:j,:g)
                   ON DUPLICATE KEY UPDATE gegevens = VALUES(gegevens)")
        ->execute([':j' => $jaar, ':g' => json_encode($gegevens, JSON_UNESCAPED_UNICODE)]);
    return ['ok' => true];
}
