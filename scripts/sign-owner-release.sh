#!/usr/bin/env bash
# Run locally by the owner after the exact artifact and unsigned manifest are ready.
# Reads no Doppler value. The private key and passphrase never enter source or arguments.
set +x
set -euo pipefail
umask 077

if [[ "$#" -ne 3 ]]; then
  printf 'Usage: bash scripts/sign-owner-release.sh /absolute/AppImage /absolute/unsigned.json /absolute/beta-linux.yml\n' >&2
  exit 64
fi
rc_image="$1"
rc_manifest="$2"
rc_output="$3"
for rc_path in "$rc_image" "$rc_manifest" "$rc_output"; do
  [[ "$rc_path" == /* ]] || { printf 'Use absolute paths.\n' >&2; exit 64; }
done
[[ ! -e "$rc_output" && ! -L "$rc_output" ]] || { printf 'Output already exists; it will not be overwritten.\n' >&2; exit 64; }
rc_source_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
rc_public_key="$rc_source_root/docs/publisher-public-key.pem"
rc_fingerprint="$(openssl pkey -pubin -in "$rc_public_key" -outform DER | openssl dgst -sha256)"
[[ "${rc_fingerprint##* }" == '9c524b910bb2c4986f49a209b76dcacb45653946c652a3ccf35276f802442be1' ]] || { printf 'Public-key pin does not match.\n' >&2; exit 65; }

rc_sign_tmp="$(mktemp -d "$(dirname -- "$rc_output")/.rough-cut-sign-XXXXXXXX")"
cleanup() {
  unset rc_sign_passphrase
  exec 3<&- || true
  rm -rf -- "$rc_sign_tmp"
}
trap cleanup EXIT
trap 'exit 130' HUP INT TERM
IFS= read -r -s -p 'Signing passphrase (local terminal only): ' rc_sign_passphrase
printf '\n'
exec 3< <(printf '%s' "$rc_sign_passphrase")
unset rc_sign_passphrase
node "$rc_source_root/scripts/release-metadata.mjs" sign \
  --metadata "$rc_manifest" --appimage "$rc_image" \
  --key "$HOME/.local/share/rough-cut-signing/private.pem" \
  --passphrase-fd 3 --output "$rc_sign_tmp/beta-linux.yml"
exec 3<&-
node "$rc_source_root/scripts/release-metadata.mjs" verify \
  --metadata "$rc_sign_tmp/beta-linux.yml" --appimage "$rc_image" \
  --public-key "$rc_public_key" --current-version 0.1.0-beta.7
# Linking refuses to replace an existing file even if it appeared during signing.
ln -- "$rc_sign_tmp/beta-linux.yml" "$rc_output"
chmod 644 -- "$rc_output"
printf 'Verified owner-key metadata saved. No publication or updater activation performed.\n'
