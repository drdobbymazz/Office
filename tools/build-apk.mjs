#!/usr/bin/env node
// Builds the Android app: the web game wrapped in a full-screen landscape shell
// (android/). No Gradle: the plain Android build tools, run one after another.
//
//   node tools/build-apk.mjs [--ollama http://MSI.lan:11434,http://192.168.1.124:11434] [--skip-web]
//
// Needs Java (javac, keytool) and Android's build tools: aapt, zipalign, apksigner,
// d8 or dx, and a platform android.jar. They are found on PATH, under
// ANDROID_HOME / ANDROID_SDK_ROOT, or in Ubuntu's packages:
//   apt-get install aapt apksigner zipalign dalvik-exchange android-sdk-platform-23
//
// Output: dist-android/munder-difflin.apk, signed with android/debug.keystore
// (made on first use, never committed). Install with:
//   adb install -r dist-android/munder-difflin.apk
// An install signed with a different key has to be removed first (adb uninstall com.munderdifflin.office),
// which also deletes the game's save.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(ROOT, 'android');
const OUT = path.join(ROOT, 'dist-android');
const BUILD = path.join(OUT, 'build');
const APK = path.join(OUT, 'munder-difflin.apk');
const PACKAGE = 'com.munderdifflin.office';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
// Where the app looks for Ollama on first run, before the address saved in Settings.
// The defaults are the 4090 laptop on the home network.
const OLLAMA = arg('ollama', process.env.MD_OLLAMA ?? 'http://MSI.lan:11434,http://192.168.1.124:11434');
const skipWeb = argv.includes('--skip-web');
const isWin = process.platform === 'win32';

function run(cmd, args, opts = {}) {
  try {
    return execFileSync(cmd, args, { stdio: opts.quiet ? 'pipe' : 'inherit', encoding: 'utf8', ...opts });
  } catch (e) {
    const out = [e.stdout, e.stderr].filter(Boolean).join('\n');
    throw new Error(`${path.basename(cmd)} failed${out ? `:\n${out}` : ''}`);
  }
}

function onPath(name) {
  const exts = isWin ? ['.exe', '.bat', '.cmd', ''] : [''];
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    for (const ext of exts) {
      const p = path.join(dir, name + ext);
      if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
    }
  }
  return null;
}

const sdkRoots = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT, '/usr/lib/android-sdk'].filter(Boolean);
const byVersion = (a, b) => b.localeCompare(a, undefined, { numeric: true });

function inBuildTools(name) {
  const exts = isWin ? ['.exe', '.bat', ''] : [''];
  for (const root of sdkRoots) {
    const dir = path.join(root, 'build-tools');
    if (!fs.existsSync(dir)) continue;
    for (const v of fs.readdirSync(dir).sort(byVersion)) {
      for (const ext of exts) {
        const p = path.join(dir, v, name + ext);
        if (fs.existsSync(p)) return p;
      }
    }
  }
  return null;
}

function tool(...names) {
  for (const n of names) {
    const p = onPath(n) ?? inBuildTools(n);
    if (p) return p;
  }
  throw new Error(`Could not find ${names.join(' or ')}. See the top of tools/build-apk.mjs for what to install.`);
}

function androidJar() {
  for (const root of sdkRoots) {
    const dir = path.join(root, 'platforms');
    if (!fs.existsSync(dir)) continue;
    for (const v of fs.readdirSync(dir).sort(byVersion)) {
      const p = path.join(dir, v, 'android.jar');
      if (fs.existsSync(p)) return p;
    }
  }
  throw new Error('Could not find a platform android.jar (ANDROID_HOME/platforms/android-*/android.jar).');
}

function walk(dir, ext) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p, ext) : p.endsWith(ext) ? [p] : [];
  });
}

const tools = {
  aapt: tool('aapt'),
  zipalign: tool('zipalign'),
  apksigner: tool('apksigner'),
  dex: tool('d8', 'dx', 'dalvik-exchange'),
  javac: tool('javac'),
  keytool: tool('keytool'),
  jar: androidJar()
};

// 1. The web game, built for the app.
const www = path.join(BUILD, 'assets', 'www');
if (!skipWeb) {
  console.log(`Building the game for the app (looks for Ollama at ${OLLAMA}) ...`);
  fs.rmSync(path.join(BUILD, 'assets'), { recursive: true, force: true });
  const vite = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
  run(process.execPath, [vite, 'build', '--config', 'vite.web.config.ts', '--outDir', www, '--emptyOutDir', '--logLevel', 'warn'], {
    cwd: ROOT,
    env: { ...process.env, VITE_APP_SHELL: '1', VITE_OLLAMA_CANDIDATES: OLLAMA }
  });
  // The app carries every file itself: no service worker.
  fs.rmSync(path.join(www, 'sw.js'), { force: true });
} else if (!fs.existsSync(path.join(www, 'index.html'))) {
  throw new Error('--skip-web, but there is no earlier web build in dist-android/build/assets/www.');
}

// 2. The shell's Java code, compiled and turned into Android bytecode.
console.log('Compiling the Android shell ...');
const classes = path.join(BUILD, 'classes');
fs.rmSync(classes, { recursive: true, force: true });
fs.mkdirSync(classes, { recursive: true });
run(tools.javac, ['--release', '8', '-nowarn', '-Xlint:-options', '-encoding', 'UTF-8', '-cp', tools.jar, '-d', classes, ...walk(path.join(APP, 'src'), '.java')], { quiet: true });
const dexOut = path.join(BUILD, 'dex');
fs.rmSync(dexOut, { recursive: true, force: true });
fs.mkdirSync(dexOut, { recursive: true });
if (/d8/.test(path.basename(tools.dex))) {
  run(tools.dex, ['--release', '--min-api', '26', '--lib', tools.jar, '--output', dexOut, ...walk(classes, '.class')], { quiet: true });
} else {
  run(tools.dex, ['--dex', '--min-sdk-version=26', `--output=${path.join(dexOut, 'classes.dex')}`, classes], { quiet: true });
}

// 3. Package: manifest, resources, the game's files, the code.
console.log('Packaging ...');
const versionCode = String(Math.floor(Date.now() / 60000)); // minutes since 1970: every build installs over the last
const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version ?? '1.0.0';
const unsigned = path.join(BUILD, 'unsigned.apk');
fs.rmSync(unsigned, { force: true });
run(tools.aapt, [
  'package', '-f', '-M', path.join(APP, 'AndroidManifest.xml'), '-S', path.join(APP, 'res'), '-A', path.join(BUILD, 'assets'),
  '-I', tools.jar, '-F', unsigned, '--version-code', versionCode, '--version-name', version,
  // Keep every game file, whatever its name.
  '--ignore-assets', '!.svn:!.git:.*:!CVS:*~'
], { quiet: true });
run(tools.aapt, ['add', unsigned, 'classes.dex'], { cwd: dexOut, quiet: true });
const aligned = path.join(BUILD, 'aligned.apk');
run(tools.zipalign, ['-f', '-p', '4', unsigned, aligned], { quiet: true });

// 4. Sign.
const keystore = process.env.MD_KEYSTORE ?? path.join(APP, 'debug.keystore');
const pass = process.env.MD_KEYSTORE_PASS ?? 'android';
if (!fs.existsSync(keystore)) {
  console.log(`Making a signing key at ${path.relative(ROOT, keystore)} (keep it: later builds must use the same one to install over this) ...`);
  run(tools.keytool, ['-genkeypair', '-keystore', keystore, '-storepass', pass, '-keypass', pass, '-alias', 'md', '-keyalg', 'RSA', '-keysize', '2048',
    '-validity', '10000', '-dname', 'CN=Munder Difflin'], { quiet: true });
}
fs.mkdirSync(OUT, { recursive: true });
run(tools.apksigner, ['sign', '--ks', keystore, '--ks-pass', `pass:${pass}`, '--key-pass', `pass:${pass}`, '--ks-key-alias', 'md', '--out', APK, aligned], { quiet: true });
run(tools.apksigner, ['verify', APK], { quiet: true });

const mb = (fs.statSync(APK).size / 1048576).toFixed(1);
console.log(`\nBuilt ${path.relative(ROOT, APK)} (${mb} MB, ${PACKAGE}, version ${version} / ${versionCode}).`);
console.log('Install it with:  adb install -r dist-android/munder-difflin.apk');
