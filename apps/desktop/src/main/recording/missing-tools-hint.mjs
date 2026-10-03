import { readFileSync } from 'node:fs';

// Packages that provide each external tool, per distro family. ffprobe ships inside the ffmpeg package.
const PACKAGES = {
  apt: { label: 'Ubuntu / Debian / Mint', prefix: 'sudo apt install', ffmpeg: 'ffmpeg', xdotool: 'xdotool', xinput: 'xinput' },
  dnf: { label: 'Fedora / RHEL', prefix: 'sudo dnf install', ffmpeg: 'ffmpeg-free', xdotool: 'xdotool', xinput: 'xinput' },
  pacman: { label: 'Arch / Manjaro', prefix: 'sudo pacman -S', ffmpeg: 'ffmpeg', xdotool: 'xdotool', xinput: 'xorg-xinput' },
};

const FAMILY_BY_ID = {
  debian: 'apt', ubuntu: 'apt', linuxmint: 'apt', pop: 'apt', elementary: 'apt', zorin: 'apt', raspbian: 'apt', kali: 'apt', tuxedo: 'apt',
  fedora: 'dnf', rhel: 'dnf', centos: 'dnf', rocky: 'dnf', almalinux: 'dnf', nobara: 'dnf',
  arch: 'pacman', manjaro: 'pacman', endeavouros: 'pacman', garuda: 'pacman', cachyos: 'pacman',
};

export const INSTALL_FAMILIES = Object.keys(PACKAGES);

/** Parse /etc/os-release text into 'apt' | 'dnf' | 'pacman' | null (unknown). */
export function detectDistroFamily(osReleaseText) {
  const fields = {};
  for (const line of String(osReleaseText ?? '').split('\n')) {
    const match = line.match(/^([A-Z_]+)=(.*)$/u);
    if (match) fields[match[1]] = match[2].replace(/^["']|["']$/gu, '').toLowerCase();
  }
  const candidates = [fields.ID, ...String(fields.ID_LIKE ?? '').split(/\s+/u)].filter(Boolean);
  for (const id of candidates) {
    if (FAMILY_BY_ID[id]) return FAMILY_BY_ID[id];
  }
  return null;
}

export function readDistroFamily(path = '/etc/os-release') {
  try {
    return detectDistroFamily(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/** Map missing tool ids (ffmpeg, ffprobe, xdotool, xinput) to unique package names for a family. */
export function packagesForTools(missingToolIds, family) {
  const table = PACKAGES[family];
  if (!table) return [];
  const packages = [];
  for (const id of missingToolIds) {
    const name = id === 'ffprobe' ? table.ffmpeg : table[id];
    if (name && !packages.includes(name)) packages.push(name);
  }
  return packages;
}

/**
 * Install hint for the pre-record notice. Known family: one command. Unknown family: one command per
 * supported family so the user can pick theirs. Returns null when nothing is missing.
 */
export function buildInstallHint(missingToolIds, family) {
  const ids = [...new Set(missingToolIds)];
  if (ids.length === 0) return null;
  const families = PACKAGES[family] ? [family] : INSTALL_FAMILIES;
  const commands = families.map((key) => ({
    family: key,
    label: PACKAGES[key].label,
    command: `${PACKAGES[key].prefix} ${packagesForTools(ids, key).join(' ')}`,
  }));
  return { family: PACKAGES[family] ? family : null, commands };
}
