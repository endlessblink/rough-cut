import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInstallHint, detectDistroFamily, packagesForTools } from './missing-tools-hint.mjs';

test('detectDistroFamily maps ID and ID_LIKE to a package manager family', () => {
  assert.equal(detectDistroFamily('NAME="Ubuntu"\nID=ubuntu\nID_LIKE=debian\n'), 'apt');
  assert.equal(detectDistroFamily('ID=fedora\n'), 'dnf');
  assert.equal(detectDistroFamily('ID="endeavouros"\nID_LIKE=arch\n'), 'pacman');
  assert.equal(detectDistroFamily('ID=somethingnew\nID_LIKE="rhel centos fedora"\n'), 'dnf');
  assert.equal(detectDistroFamily('ID=nixos\n'), null);
  assert.equal(detectDistroFamily(''), null);
});

test('packagesForTools uses the right package names and de-duplicates ffprobe into ffmpeg', () => {
  assert.deepEqual(packagesForTools(['ffmpeg', 'ffprobe', 'xdotool', 'xinput'], 'apt'), ['ffmpeg', 'xdotool', 'xinput']);
  assert.deepEqual(packagesForTools(['xinput'], 'pacman'), ['xorg-xinput']);
  assert.deepEqual(packagesForTools(['ffprobe'], 'dnf'), ['ffmpeg-free']);
  assert.deepEqual(packagesForTools(['ffmpeg'], 'unknown'), []);
});

test('buildInstallHint gives one exact command for a known family', () => {
  const hint = buildInstallHint(['ffmpeg', 'ffprobe'], 'apt');
  assert.equal(hint.family, 'apt');
  assert.deepEqual(hint.commands.map((c) => c.command), ['sudo apt install ffmpeg']);
  assert.equal(buildInstallHint(['ffmpeg', 'xinput'], 'pacman').commands[0].command, 'sudo pacman -S ffmpeg xorg-xinput');
});

test('buildInstallHint lists every family when the distro is unknown, and nothing when nothing is missing', () => {
  const hint = buildInstallHint(['xdotool'], null);
  assert.equal(hint.family, null);
  assert.deepEqual(hint.commands.map((c) => c.command), ['sudo apt install xdotool', 'sudo dnf install xdotool', 'sudo pacman -S xdotool']);
  assert.equal(buildInstallHint([], 'apt'), null);
});
