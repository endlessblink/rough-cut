# rough-cut

Desktop screen recording and editing studio built with Electron, React, TypeScript, and PixiJS.

## Development

```bash
pnpm install
pnpm dev
pnpm test
pnpm build
```

Runtime logs for the Electron app are mirrored to `.logs/app-runtime.log`. When debugging, tail that file to follow the same app output that appears in the terminal.

## Third-Party Attribution

This product includes software developed by Max Bain and WhisperX contributors.

WhisperX-related license text is included in `THIRD_PARTY_LICENSES.md`.

FFmpeg is currently invoked as an external subprocess. If rough-cut ever ships a bundled FFmpeg
binary, the distributed artifact must include the relevant LGPL notices and replacement rights.
