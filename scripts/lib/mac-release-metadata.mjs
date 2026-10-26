// Mac releases have their own version; Linux/Windows keep apps/desktop/package.json unchanged.
export function macReleaseVersion(baseVersion, env = process.env, now = Date.now()) {
  if (!/^\d+\.\d+\.\d+(?:-beta\.\d+)?$/.test(baseVersion)) throw new Error('Expected a stable or beta base version.');
  const build = String(env.ROUGH_CUT_MAC_BUILD ?? env.GITHUB_RUN_NUMBER ?? Math.floor(now / 1000));
  if (!/^[1-9]\d*$/.test(build) || !Number.isSafeInteger(Number(build))) throw new Error('Mac build number must be a positive safe integer.');
  return `${baseVersion}${baseVersion.includes('-') ? '.' : '-'}mac.${build}`;
}

export function macReleaseManifest(version, releaseTag) {
  if (!/^\d+\.\d+\.\d+-(?:beta\.\d+\.)?mac\.[1-9]\d*$/.test(version)) throw new Error('Expected a numbered Mac version.');
  if (!/^v\d+\.\d+\.\d+(?:-beta\.\d+)?$/.test(releaseTag)) throw new Error('Expected the shared release tag.');
  const base = releaseTag.slice(1);
  if (!version.startsWith(`${base}${base.includes('-') ? '.' : '-'}mac.`)) throw new Error('Mac package version does not match the shared release.');
  return {
    version,
    releaseTag,
    files: Object.fromEntries(['arm64', 'x64'].map((arch) => [arch, {
      dmg: `Rough-Cut-${version}-mac-${arch}.dmg`,
      zip: `Rough-Cut-${version}-mac-${arch}.zip`,
    }])),
  };
}
