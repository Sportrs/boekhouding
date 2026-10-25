#!/bin/zsh
# Start de boekhouding lokaal. Dubbelklik in Finder, of: ./start.command
# Eerst gaat een verse export van de database naar Proton Drive. Daarna
# start de PHP-server en opent de browser op http://localhost:8000.

cd "${0:A:h}"

POORT=8000
BEWAAR=60   # zoveel exports blijven staan, oudere gaan weg

# Proton Drive-map zoeken (niet de gedateerde kopie "... (07-05-2026 21:59)")
PROTON=$(print -l "$HOME"/Library/CloudStorage/ProtonDrive-*-folder(N/) | head -1)
if [[ -z "$PROTON" ]]; then
  echo "!! Proton Drive niet gevonden. Er is GEEN backup gemaakt."
  read "?Enter om toch te starten, Ctrl+C om te stoppen. "
else
  DOEL="$PROTON/Boekhouding/App-backups"
  mkdir -p "$DOEL"
  BESTAND="$DOEL/boekhouding_$(date +%Y-%m-%d_%H%M).sql"
  if mariadb-dump --single-transaction boekhouding > "$BESTAND.tmp" && grep -q "Dump completed" "$BESTAND.tmp"; then
    mv "$BESTAND.tmp" "$BESTAND"
    echo "Backup: $BESTAND"
    ls -1t "$DOEL"/boekhouding_*.sql | tail -n +$((BEWAAR + 1)) | while read -r oud; do rm -f "$oud"; done
  else
    rm -f "$BESTAND.tmp"
    echo "!! Backup MISLUKT. Draait MariaDB? (brew services start mariadb)"
    read "?Enter om toch te starten, Ctrl+C om te stoppen. "
  fi
fi

if lsof -iTCP:$POORT -sTCP:LISTEN >/dev/null 2>&1; then
  echo "De app draait al."
  open "http://localhost:$POORT"
else
  (sleep 1 && open "http://localhost:$POORT") &
  echo "Boekhouding draait op http://localhost:$POORT. Sluit dit venster om te stoppen."
  php -S "localhost:$POORT"
fi
