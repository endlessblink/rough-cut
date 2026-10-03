# Third-party notices

Rough Cut is licensed under AGPL-3.0 (see [LICENSE](LICENSE)). It includes or depends on the following third-party material.

## JavaScript runtime dependencies (MIT)

| Package | Licence |
|---------|---------|
| react | MIT |
| react-dom | MIT |
| scheduler (via react-dom) | MIT |
| zod | MIT |
| @phosphor-icons/react | MIT |
| js-tokens, loose-envify (transitive) | MIT |

The full MIT licence text accompanies each package in its published distribution; run `pnpm licenses list --prod` for the current list. Development-only dependencies (build and test tools) are not shipped.

## Fonts embedded for AI graphics

| Font | Licence |
|------|---------|
| Amatic SC | SIL Open Font License 1.1 |
| Karantina | SIL Open Font License 1.1 |
| Caveat | SIL Open Font License 1.1 |
| Permanent Marker | Apache License 2.0 |

They are embedded (base64) in `apps/desktop/src/shared/graphics-fonts.generated.mjs` so graphics pages work offline.

## Background images

The `pexels-*.jpg` files in `apps/desktop/src/renderer/public/backgrounds/` are photos from [Pexels](https://www.pexels.com/), used under the [Pexels License](https://www.pexels.com/license/). Credit to the photographers named in each file name: codioful, njeromin, steve. `dark-waves.png` is original to this project. See `apps/desktop/src/renderer/public/backgrounds/LICENSE.md`.

## Electron and Chromium

Packaged builds include Electron (MIT) and the Chromium engine, which bundles many components under their own licences (BSD-style, MIT, Apache-2.0, LGPL and others). Electron's `LICENSE` and `LICENSES.chromium.html` files are included in the packaged application folder.

## External tools (not bundled)

`ffmpeg`, `ffprobe`, `xdotool` and `xinput` are separate programs that Rough Cut runs from your system. They are not distributed with Rough Cut and keep their own licences. The optional Claude CLI, `whisper-cli` and Vibe/Sona are likewise separate.
