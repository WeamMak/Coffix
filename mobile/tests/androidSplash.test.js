/* global it, __dirname */
const { execFileSync } = require('node:child_process');
const { resolve } = require('node:path');

it('generates the drawable referenced by the native Android splash theme', () => {
  // Run the real Expo resource generator outside Jest's React Native mocks.
  execFileSync(process.execPath, ['-e', `
    const assert = require('node:assert/strict');
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    const pluginRoot = path.dirname(require.resolve('expo-splash-screen/package.json'));
    const { getAndroidSplashConfig } = require(path.join(pluginRoot, 'plugin/build/getAndroidSplashConfig'));
    const { setSplashImageDrawablesAsync } = require(path.join(pluginRoot, 'plugin/build/withAndroidSplashImages'));
    const config = require('./app.json').expo;
    const splash = config.plugins.find(plugin => Array.isArray(plugin) && plugin[0] === 'expo-splash-screen')[1];
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'coffix-splash-'));
    (async () => {
      try {
        if (fs.existsSync('assets')) fs.cpSync('assets', path.join(temporary, 'assets'), { recursive: true });
        await setSplashImageDrawablesAsync(getAndroidSplashConfig(splash), temporary);
        const resources = path.join(temporary, 'android/app/src/main/res');
        const drawables = fs.existsSync(resources) ? fs.readdirSync(resources).filter(name => name.startsWith('drawable')) : [];
        assert(drawables.some(directory => fs.readdirSync(path.join(resources, directory)).some(name => /^splashscreen_logo\\.(png|xml)$/.test(name))),
          'Android splash theme references drawable/splashscreen_logo but it was not generated');
      } finally {
        fs.rmSync(temporary, { recursive: true, force: true });
      }
    })().catch(error => { console.error(error.message); process.exitCode = 1; });
  `], { cwd: resolve(__dirname, '..'), stdio: 'pipe' });
});
