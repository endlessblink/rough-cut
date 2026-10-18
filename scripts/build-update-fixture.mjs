import { build, Platform, Arch } from 'electron-builder';
import { cp, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = process.cwd();
const fixtureVersion = process.env.ROUGH_CUT_UPDATE_FIXTURE_VERSION || '0.1.0-beta.9';
const fixture = resolve(root, '../update-fixture/app');
await mkdir(fixture, { recursive: true });
await cp(resolve(root, 'release/linux-unpacked/resources/app'), fixture, { recursive: true });
await writeFile(resolve(fixture, 'fixture-main.cjs'), `const {app,BrowserWindow}=require('electron'); const fs=require('node:fs'); app.enableSandbox(); app.whenReady().then(async()=>{const win=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}}); await win.loadURL('data:text/html,<p>Synthetic updater fixture</p>'); const sandbox=await win.webContents.executeJavaScript('typeof require === "undefined"'); if(process.env.ROUGH_CUT_UPDATE_FIXTURE_RESULT)fs.writeFileSync(process.env.ROUGH_CUT_UPDATE_FIXTURE_RESULT,JSON.stringify({version:app.getVersion(),packaged:app.isPackaged,sandbox:win.webContents.getLastWebPreferences().sandbox,rendererNoNode:sandbox}));app.quit();});`);
await build({ targets: Platform.LINUX.createTarget(['AppImage'], Arch.x64), publish: 'never', config: {
  appId: 'org.roughcut.updatefixture', productName: 'Rough Cut Update Fixture', electronVersion: '43.7.7', electronDist: resolve(root, 'apps/desktop/node_modules/electron/dist'),
  directories: { app: fixture, output: resolve(root, '../update-fixture/release') }, asar: false, npmRebuild: false,
  extraMetadata: { version: fixtureVersion, main: 'fixture-main.cjs' }, files: ['**/*'],
  linux: { executableName: 'rough-cut-fixture', category: 'AudioVideo', icon: resolve(root,'apps/desktop/assets/rough-cut-mvp-icon.png'), artifactName: 'Update-fixture-${version}.${ext}' }, publish: null,
} });
