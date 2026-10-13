#!/bin/bash
# Push SIMAK-MOSA ke GitHub dalam 1 perintah
# Cara pakai: ./push.sh <PAT>
# Contoh: ./push.sh ghp_xxxx
#
# PAT tidak disimpan di file manapun — hanya dipakai saat push.

if [ -z "$1" ]; then
  echo "Cara pakai: ./push.sh <GitHub-PAT>"
  exit 1
fi

cd "$(dirname "$0")"
git push "https://$1@github.com/faruqeclypst/SIMAK-MOSA.git" main 2>&1 | grep -v "ghp_"
