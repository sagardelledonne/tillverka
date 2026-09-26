#!/usr/bin/env bash
# Foto di controllo di una pagina (WebGL compreso) con Chrome senza finestra.
# Uso: bash dev/shot.sh "dev/scene.html?name=intro&p=0.3&hud=0" dev/shots/intro-030.png [1440,900]
# (il server di anteprima deve girare su http://localhost:8790 : python dev/serve.py 8790)
set -e
URL="$1"; OUT="$2"; SIZE="${3:-1440,900}"
cd "$(dirname "$0")/.."
mkdir -p "$(dirname "$OUT")"
PROFILE="$(mktemp -d)"
"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --use-angle=swiftshader --enable-unsafe-swiftshader \
  --hide-scrollbars --window-size="$SIZE" --virtual-time-budget="${BUDGET:-9000}" \
  --user-data-dir="$(cygpath -w "$PROFILE")" --screenshot="$(cygpath -w "$PWD/$OUT")" "http://localhost:8790/$URL" >/dev/null 2>&1 || true
rm -rf "$PROFILE" 2>/dev/null || true
[ -f "$OUT" ] && echo "ok $OUT" || echo "FALLITA $OUT"
