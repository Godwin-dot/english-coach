#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

DB_PATH="${DB_PATH:-/var/www/english-coach/data/english.db}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/english-coach}"
KEEP_BACKUPS=14

mkdir -p "$BACKUP_DIR"
backup_path="$BACKUP_DIR/english_$(date -u +%Y%m%d_%H%M%S).db"

sqlite3 "$DB_PATH" ".backup '$backup_path'"
if [[ ! -s "$backup_path" ]]; then
  printf 'SQLite backup was not created: %s\n' "$backup_path" >&2
  exit 1
fi

mapfile -t backups < <(
  find "$BACKUP_DIR" -maxdepth 1 -type f -name 'english_*.db' -printf '%f\n' |
    LC_ALL=C sort -r
)

for ((index = KEEP_BACKUPS; index < ${#backups[@]}; index += 1)); do
  rm -- "$BACKUP_DIR/${backups[$index]}"
done

printf 'SQLite backup created: %s\n' "$backup_path"
