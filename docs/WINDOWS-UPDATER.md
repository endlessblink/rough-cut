# Windows updater

How the Windows app updates itself, what is in place, and what the owner still has to do. Written for the person who
holds the signing key.

**Status: built and tested, switched off.** `release-policy.json` has `"activated": false`, so the updater makes no
request at all until the owner turns it on. No Windows build that has been published so far contains an updater
(0.1.0-beta.10 and earlier): those users update by running the newer `Setup.exe` over the old one. The first build that
can update itself is the next release.

## How it works

The Windows updater uses the same trust model as the Linux AppImage updater (see `UPDATE-SIGNING.json`). Nothing is
trusted because of where it was downloaded from; it is trusted because the owner signed it.

1. The app asks GitHub Releases (the one approved destination, `endlessblink/rough-cut`, channel `beta`) for the newest
   release and reads `beta.yml` from it. (`beta.yml` is the file name electron-updater uses for Windows; Linux uses
   `beta-linux.yml`.)
2. `beta.yml` carries the installer's file name and SHA-512 and an **Ed25519 signature by the owner's key**. The public
   key is pinned inside the app. The signed text includes the version, the platform (`win32`) and the files, so a Linux
   signature can never authorise a Windows file or the other way round, and an edited file name, checksum or version
   fails verification.
3. The installer must be named `Rough-Cut-<version>-Setup.exe`, sit directly in the release `v<version>` of the approved
   repository (no other folders, hosts, query strings or credentials), and be newer than the installed version.
   Anything else is refused, even with a valid signature.
4. The whole installer is downloaded (no differential download) and its SHA-512 is checked against the signed value
   before the app calls it ready. A wrong checksum or a truncated file is refused.
5. Nothing installs without a click: **Help, Check for updates** finds and downloads; **Help, Restart to install update**
   asks, refuses while recording or exporting, then closes the app, runs the installer silently for the current user,
   and starts the app again. Recordings and settings are not touched.
6. If anything fails, the installed version stays as it is. Windows keeps no previous-version copy; to go back, install
   the older `Setup.exe` from GitHub Releases. (The Linux "Restore previous version" menu item is not shown on Windows.)

No user identifier is sent, and there is no automatic install and no background restart.

Not covered: the installer is still not code-signed, so Windows SmartScreen can warn on a manual download. The updater
does not depend on a code-signing certificate (it checks the owner's signature and the SHA-512), but a certificate would
remove the SmartScreen warning.

## What was tested

- Unit tests (`update-controller-windows.test.mjs`): signature and platform binding, asset-name and release-location
  rules, the controller from check to install with a fake backend, busy and error cases, inactive policy.
- Real library probe (`scripts/windows/probe-windows-update.mjs`, run with Electron): electron-updater's `NsisUpdater`
  against a local feed: finds a newer installer, downloads it whole, matches the SHA-512, reports "current" for the same
  version, refuses a wrong checksum and a truncated download, reports an outage. It never runs an installer.
- Metadata tool tests (`scripts/release-metadata.test.mjs`): preparing, signing and verifying Windows metadata, and that
  a Linux signature does not validate a Windows installer.

**Not tested end to end:** the whole path inside a published, activated build with a real signature, because that needs
your key. See "Before you switch it on".

## Publishing an updater-enabled Windows release (owner steps)

Windows and Linux share **one GitHub release per version** (`v<version>`), because the app only trusts files under
`releases/download/v<version>/`. A separate `...-windows` release works for manual downloads but cannot be used by the
updater.

1. **Build** the installer on Windows: `node scripts/prepare-windows-tools.mjs`, `node scripts/package-windows.mjs`,
   `node scripts/build-windows-release.mjs` (output in `release/windows`).
2. **Prepare the unsigned metadata** (computes the SHA-512; signs nothing):
   `node scripts/release-metadata.mjs prepare --platform win32 --version <version> --installer <path>\Rough-Cut-<version>-Setup.exe --output <path>\unsigned-win.json`
3. **Sign it on your Linux machine**, where the key is. Copy `Rough-Cut-<version>-Setup.exe` and `unsigned-win.json` over,
   then run:
   `ROUGH_CUT_SIGN_PLATFORM=win32 bash scripts/sign-owner-release.sh /absolute/Rough-Cut-<version>-Setup.exe /absolute/unsigned-win.json /absolute/beta.yml`
   The helper asks for your passphrase locally, checks the pinned public key and the exact installer bytes, verifies the
   result, and refuses to overwrite an existing file. The key and passphrase never leave your machine.
4. **Upload** `Rough-Cut-<version>-Setup.exe`, the portable zip and the signed `beta.yml` to the release `v<version>`,
   next to the Linux files and `beta-linux.yml`.
5. **Check it** before telling anyone: `node scripts/release-metadata.mjs verify --platform win32 --metadata <beta.yml> --installer <Setup.exe> --public-key docs/publisher-public-key.pem --current-version <older version>`.

## Before you switch it on

`release-policy.json` lists the owner's own conditions (`activationBlockers`). For Windows, the practical checklist is:

1. Install an updater-enabled build by hand (the bootstrap; older builds have no updater).
2. Publish a newer, signed release as above.
3. In the installed app, **Help, Check for updates**, then **Restart to install update**. Confirm it downloads, installs,
   restarts on the new version, and keeps your recordings and settings.
4. Try the failure cases once: a release whose `beta.yml` is missing or edited must change nothing.
5. Only then set `"activated": true` in `release-policy.json` and ship a build with it. Activation is your decision; this
   change does not make it.

Note that `activated` applies to the whole policy file, Linux included, so the Linux acceptance in the blockers list
still applies.
