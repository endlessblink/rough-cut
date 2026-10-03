# Security

Rough Cut runs locally. The app code makes no network calls of its own (no telemetry, analytics, crash reporting or auto-update). The embedded Chromium engine may make DNS-related connections on its own. The optional graphics and AI features call the Claude CLI you have installed and logged in, which sends your prompt to Anthropic.

## Reporting a vulnerability

Open a private security advisory on the GitHub repository (Security tab > Report a vulnerability). Please do not file public issues for security problems. We aim to reply within a week.

## Known limitations

- Rough Cut 0.1.0-beta ships Electron 35, which is out of support and has published advisories. The upgrade to a supported Electron is planned for 0.1.1. The app loads only local content, and AI graphics run in sandboxed frames with no network access.
- Beta software: it has been tested on one setup (KDE Plasma, NVIDIA, X11).
