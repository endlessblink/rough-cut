import { createRequire } from 'node:module';
const semver = createRequire(createRequire(import.meta.url).resolve('electron-updater'))('semver');
const releasesAPI = 'https://api.github.com/repos/endlessblink/rough-cut/releases?per_page=30';
const releaseBase = 'https://github.com/endlessblink/rough-cut/releases/';
export const MAC_UPDATE_INSTRUCTIONS = 'Open it, drag Rough Cut to Applications and choose Replace.';

export function macNoticeOptions(version) {
  return { type: 'info', title: 'Rough Cut update', message: `Rough Cut ${version} is available`, detail: MAC_UPDATE_INSTRUCTIONS, buttons: ['Download', 'Later'], defaultId: 0, cancelId: 1, noLink: true };
}

export function validateMacManifest(manifest, release, arch) {
  if (!semver.valid(manifest?.version) || manifest.releaseTag !== release.tag_name || !/^v\d+\.\d+\.\d+-beta\.[\w.-]+$/.test(release.tag_name)) throw new Error('Invalid Mac release version.');
  if (!manifest.version.startsWith(`${release.tag_name.slice(1)}.mac.`) || !/\.mac\.[1-9]\d*$/.test(manifest.version)) throw new Error('Mac version does not match release.');
  const page = `${releaseBase}tag/${release.tag_name}`;
  const name = manifest.files?.[arch]?.dmg;
  if (!name) return { version: manifest.version, downloadURL: page };
  if (!['arm64', 'x64'].includes(arch) || name !== `Rough-Cut-${manifest.version}-mac-${arch}.dmg`) throw new Error('Invalid Mac download.');
  const asset = release.assets?.find((item) => item.name === name);
  const url = `${releaseBase}download/${release.tag_name}/${name}`;
  if (!asset || asset.browser_download_url !== url) throw new Error('Mac download missing from release.');
  return { version: manifest.version, downloadURL: url };
}

// Ad-hoc signed Mac apps cannot use Squirrel.Mac. Only open a validated public download; never install or quit.
export function createMacUpdateController({ version, arch = process.arch, packaged, approved, fetchJSON = async (url) => {
  const response = await fetch(url, { headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('Release request failed.');
  return response.json();
}, showMessageBox, openExternal, isBusy = () => false } = {}) {
  let state = { status: approved && packaged ? 'idle' : 'disabled', reason: 'Mac update checks require an approved packaged build.' };
  let checking;
  let noticed;
  const controller = {
    status: () => ({ ...state }),
    async check({ notify = false } = {}) {
      if (!approved || !packaged) return controller.status();
      if (isBusy()) return { status: 'busy' };
      if (checking) return checking;
      checking = (async () => {
        try {
          state = { status: 'checking' };
          const releases = await fetchJSON(releasesAPI);
          if (!Array.isArray(releases)) throw new Error('Invalid releases.');
          let newest;
          for (const release of releases) {
            if (release.draft || !/^v\d+\.\d+\.\d+-beta\.[\w.-]+$/.test(release.tag_name)) continue;
            const asset = release.assets?.find((item) => item.name === 'mac-latest.json');
            if (!asset) continue;
            const url = `${releaseBase}download/${release.tag_name}/mac-latest.json`;
            if (asset.browser_download_url !== url) throw new Error('Invalid Mac feed.');
            const candidate = validateMacManifest(await fetchJSON(url), release, arch);
            if (semver.gt(candidate.version, version) && (!newest || semver.gt(candidate.version, newest.version))) newest = candidate;
          }
          state = newest ? { status: 'available', ...newest } : { status: 'current' };
          if (notify && newest && noticed !== newest.version && !isBusy()) {
            noticed = newest.version;
            await controller.prompt();
          }
        } catch { state = { status: 'error', reason: 'Could not check Mac updates. Try again from Help > Check for updates.' }; }
        finally { checking = null; }
        return controller.status();
      })();
      return checking;
    },
    async prompt() {
      if (isBusy()) return { status: 'busy' };
      if (state.status !== 'available') return controller.status();
      const candidate = { ...state };
      const answer = await showMessageBox(macNoticeOptions(candidate.version));
      if (answer.response === 0) await openExternal(candidate.downloadURL);
      return controller.status();
    },
    async updateNow() { await controller.check(); return controller.prompt(); },
    install: () => ({ status: 'unsupported' }),
    canRollback: () => false,
  };
  return controller;
}
