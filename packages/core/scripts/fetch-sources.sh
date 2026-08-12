#!/usr/bin/env bash
# Download the source tarballs for Maude and its dependencies into third_party/.
set -euo pipefail

cd "$(dirname "$0")/.."
# shellcheck source=versions.sh
source scripts/versions.sh

mkdir -p third_party
cd third_party

fetch() {
  local url="$1" out="$2" dir="$3"
  if [ -d "$dir" ]; then
    echo "✔ $dir already present, skipping"
    return
  fi
  if [ ! -f "$out" ]; then
    echo "⇩ downloading $out"
    curl -fL --retry 3 -o "$out" "$url"
  fi
  echo "⇪ extracting $out"
  tar xf "$out"
  [ -d "$dir" ] || { echo "error: expected $dir after extracting $out" >&2; exit 1; }
}

fetch "$MAUDE_URL" "maude-${MAUDE_VERSION}.tar.gz" "$MAUDE_DIR"
fetch "$GMP_URL"   "gmp-${GMP_VERSION}.tar.xz"     "$GMP_DIR"
fetch "$BUDDY_URL" "buddy-${BUDDY_VERSION}.tar.gz" "$BUDDY_DIR"
fetch "$BISON_URL" "bison-${BISON_VERSION}.tar.xz"  "$BISON_DIR"

echo "All sources ready in $(pwd)"
