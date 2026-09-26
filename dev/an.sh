#!/usr/bin/env bash
# foglio provini di una scena a più valori di p:  bash dev/an.sh <scena> <out.png> <W,H> <colonne> p1 p2 ...
name=$1; out=$2; size=$3; cols=$4; shift 4
args=()
for p in "$@"; do args+=("dev/scene.html?name=$name&p=$p&hud=0|$name $p"); done
python3 "$(dirname "$0")/sheet.py" "$out" "$size" "$cols" "${args[@]}"
