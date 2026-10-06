# Corrective beta.8 release requirements

One release candidate combines canonical Oct5 source with isolated tested beta.6 fixes. Fresh package/test/runtime evidence is recorded in the private release delivery rather than borrowed from earlier packages.

Application source commit, input-file hashes and renderer SHA256 are included in each package. Public release must include matching application source, bundled-media corresponding source, license notices and SHA256SUMS.

Release scope: Linux x86_64/X11, glibc>=2.35. Public updater policy remains inactive; publisher key custody/pin, signed metadata, real public download/install/restart/rollback and activation approval are separate gates. A manual beta with checksums and source is the fallback.

Owner must review the exact fresh package, camera/microphone lifecycle and export sound/sync/visual quality, independent-machine scope and the unexplained intermittent decoder risk. Agent tests never create owner acceptance. Publishing and payment activation remain separate from local preparation.
