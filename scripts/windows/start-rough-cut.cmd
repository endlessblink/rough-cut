@echo off
rem One-click Windows dev start: installs Node, pnpm and FFmpeg if missing, then runs the app.
cd /d "%~dp0\..\.."
where node >nul 2>nul || winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
where ffmpeg >nul 2>nul || winget install -e --id Gyan.FFmpeg --accept-source-agreements --accept-package-agreements
where pnpm >nul 2>nul || call npm install -g pnpm@9.15.0
echo If a tool was just installed and the next step fails, close this window and double-click again.
call pnpm install
call pnpm --filter @rough-cut/desktop dev
pause
