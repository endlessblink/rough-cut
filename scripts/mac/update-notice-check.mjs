// Native Mac notice proof from the packaged executable and packaged updater module.
// All release responses and browser actions in this check are fixtures.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const root = resolve(import.meta.dirname, '..', '..');
const args = process.argv.slice(2);
const value = (name) => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
if (process.platform !== 'darwin') throw new Error('This native notice check requires macOS.');
const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
const bundle = value('--app') ?? join(root, 'dist', `rough-cut-mvp-darwin-${arch}`, 'Rough Cut.app');
const exe = join(bundle, 'Contents', 'MacOS', 'Electron');
const appRoot = join(bundle, 'Contents', 'Resources', 'app');
const out = resolve(value('--out') ?? join(tmpdir(), `rough-cut-mac-update-notice-${arch}`));
const packagedController = join(appRoot, 'apps/desktop/src/main/mac-update-controller.mjs');
for (const file of [exe, packagedController, join(appRoot, 'package-identity.json')]) if (!existsSync(file)) throw new Error(`Missing packaged file: ${file}`);
const temp = mkdtempSync(join(tmpdir(), 'rough-cut-mac-notice-'));
mkdirSync(out, { recursive: true });
const testBundle = join(temp, 'Rough Cut.app');
try { execFileSync('/bin/cp', ['-cR', bundle, testBundle]); }
catch { rmSync(testBundle, { recursive: true, force: true }); cpSync(bundle, testBundle, { recursive: true }); }
const testAppRoot = join(testBundle, 'Contents', 'Resources', 'app');
const testExe = join(testBundle, 'Contents', 'MacOS', 'Electron');
const hash = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
if (hash(exe) !== hash(testExe)) throw new Error('Copied packaged executable differs.');
const harness = join(testAppRoot, 'notice.cjs');
const testPackage = JSON.parse(readFileSync(join(testAppRoot, 'package.json'), 'utf8'));
testPackage.main = 'notice.cjs';
writeFileSync(join(testAppRoot, 'package.json'), JSON.stringify(testPackage));
// A disposable bundle copy changes only its main entrypoint. The original signed app is untouched.
// The separate test entrypoint ensures the real app's startup update check never runs.
// The UI and controller below come from the exact packaged app, not the checkout.
writeFileSync(harness, `const { app, BrowserWindow, dialog } = require('electron');
app.whenReady().then(async () => {
  const { createMacUpdateController } = await import(${JSON.stringify(pathToFileURL(join(testAppRoot, 'apps/desktop/src/main/mac-update-controller.mjs')).href)});
  const current = ${JSON.stringify(JSON.parse(readFileSync(join(appRoot, 'package.json'), 'utf8')).version)};
  const next = current.replace(/(\\d+)$/, build => String(Number(build) + 1));
  const releaseTag = 'v' + current.split('.mac.')[0];
  const arch = ${JSON.stringify(arch)};
  const name = 'Rough-Cut-' + next + '-mac-' + arch + '.dmg';
  const base = 'https://github.com/endlessblink/rough-cut/releases/download/' + releaseTag + '/';
  const release = {tag_name:releaseTag,assets:['mac-latest.json',name].map(name=>({name,browser_download_url:base+name}))};
  const manifest = {version:next,releaseTag,files:{[arch]:{dmg:name}}};
  const window = new BrowserWindow({width:900,height:600,title:'Rough Cut — packaged native update notice test',webPreferences:{sandbox:true}});
  await window.loadURL('data:text/html,'+encodeURIComponent('<html style="font:16px -apple-system;background:#17191c;color:#f2f3f5;padding:32px"><h2>Rough Cut</h2><p>Packaged native update notice test · mocked release</p></html>'));
  const result = {platform:process.platform,arch,current,next,packagedController:${JSON.stringify(packagedController)},requests:[],opened:[]};
  const controller = createMacUpdateController({version:current,arch,packaged:true,approved:true,
    fetchJSON:async url=>{result.requests.push(url);return url.includes('api.github.com')?[release]:manifest},
    openExternal:async url=>{result.opened.push(url)},
    showMessageBox:async options=>{
      result.options=options;
      require('node:fs').writeFileSync(${JSON.stringify(join(temp, 'ready.json'))},JSON.stringify(result));
      return dialog.showMessageBox(window,options);
    }});
  controller.check({notify:true}).catch(error=>{console.error(error);app.exit(1)});
});
`);
const require = createRequire(join(root, 'package.json'));
const { _electron } = require('playwright-core');
let app;
try {
  app = await _electron.launch({ executablePath: testExe, args: [ `--user-data-dir=${join(temp, 'profile')}`], timeout: 60000 });
  const deadline = Date.now() + 30000;
  while (!existsSync(join(temp, 'ready.json'))) {
    if (Date.now() > deadline) throw new Error('Native update notice did not appear.');
    await new Promise(resolveWait => setTimeout(resolveWait, 100));
  }
  await new Promise(resolveWait => setTimeout(resolveWait, 1000));
  const screenshot = join(out, 'mac-update-notice.png');
  execFileSync('screencapture', ['-x', screenshot]);
  if (readFileSync(screenshot).length < 1000) throw new Error('Native screenshot is missing or empty.');
  const result = JSON.parse(readFileSync(join(temp, 'ready.json'), 'utf8'));
  if (result.requests.length !== 2 || result.opened.length !== 0) throw new Error('Notice did not use exactly the mocked release and manifest.');
  const identity = JSON.parse(readFileSync(join(appRoot, 'package-identity.json'), 'utf8'));
  writeFileSync(join(out, 'report.json'), JSON.stringify({ status: 'captured', proofScope: 'byte-identical packaged binary and controller in a disposable bundle copy with isolated test entrypoint; not original signature, real-editor or startup wiring proof', executableSha256: hash(exe), updaterModuleSha256: hash(packagedController), ...result, identity, screenshot, screenshotSha256: createHash('sha256').update(readFileSync(screenshot)).digest('hex') }, null, 2) + '\n');
  console.info(`NATIVE MAC UPDATE NOTICE PASSED: ${screenshot}`);
} finally {
  if (app) await app.close();
  rmSync(temp, { recursive: true, force: true });
}
