# Rough Cut beta.6 media-tool source build

FFmpeg 8.1.3 was built from the official release source, with GPL/version3 features, shared libraries, libx264/libass, X11/PulseAudio capture and NVIDIA codec headers. This replaces the beta.2 opaque autobuild. It is a separate candidate; beta.2 was not changed.

Evidence: `evidence/offline-reproduction-result.json` compares 23 FFmpeg executable/shared-library files from two separate builds. All are byte-identical. The second build used `docker --network=none`, the preserved Ubuntu image and exact saved compiler packages. This proves that comparison, not independent reproduction on arbitrary machines.

The 45 Ubuntu source-package versions corresponding to the bundled tools/libraries are preserved as 147 files. `evidence/ubuntu-source-provenance.json` records Canonical publication URLs and hashes; `.dsc` entries were checked for exact package/version and SHA-256 checksums of their orig/debian source archives. Superseded versions were retained exactly. Runtime provenance separately lists standard libraries excluded from bundling. The source release contains original source archives, Debian patches/build scripts, build recipes, exact build-package version manifests and hashes. Compiler-package binaries used for the local offline test remain in the local test cache; they are not included in the source release. Standard license texts and package copyright notices accompany the runtime.

## Reproduce FFmpeg offline

For the already verified local offline reproduction, use the complete local work directory, including `build/compiler-debs`. The distributable source archive omits those generic compiler binaries; it preserves their versions/hashes and the online build recipe instead. Docker must have the pinned image below available locally; acquiring it is a separate network operation. No privileged/unconfined flags or host security changes are needed.

```sh
docker run --rm --network=none -v "$PWD:/work" ubuntu@sha256:2edbbc5dc405e9612ba3584ce95480277e3eb374407b5505fe26f17df77c7dbc bash /work/build/reproduce-ffmpeg-offline.sh
```

For a source-only rebuild, use `build/rebuild-ffmpeg-preserved-sources.sh` with the same container and network enabled; it installs generic build tools from Ubuntu. This path does not promise byte identity with future Ubuntu package revisions.

Offline outputs: `build/reproduction/install/opt/roughcut-tools`. The script validates cached compiler package hashes, installs only inside the disposable container, configures the preserved sources and compiles with `SOURCE_DATE_EPOCH=1790000000`. Ubuntu-bundled libraries/programs were obtained as authenticated distribution binaries; their exact sources and build scripts are provided, but this task did not rebuild every Ubuntu library. No claim is made that those distribution binaries were independently reproduced.

Run `python3 build/verify-preserved-inputs.py` to verify all 147 saved Ubuntu source files. The original acquisition recipe and Canonical source fetcher are also retained. They use the network and are not the offline reproduction path.

## Release conditions

The app/source archives are local candidates. For public distribution, publish the exact application source and media corresponding-source archive with equivalent access alongside each binary, keep the source available, include license notices and explain relinking/build instructions. GNU GPL §1 and §6(d), and FFmpeg's official legal guidance, informed this technical work. This is not a blanket legal compliance certification.

GitHub Releases at endlessblink/rough-cut, beta channel, is the approved destination. No artifact was published and no signing credential was created. The updater remains disabled until an owner-approved public key is pinned and signed update/install acceptance passes. Manual beta distribution with checksums and corresponding source does not require enabling that updater. Owner hardware acceptance remains a separate release gate.

References: https://www.gnu.org/licenses/gpl-3.0.html (sections 1 and 6(d)); https://www.ffmpeg.org/legal.html.
