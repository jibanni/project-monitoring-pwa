import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const root = process.cwd()
const distDir = path.join(root, 'dist')
const indexPath = path.join(distDir, 'index.html')
const swPath = path.join(distDir, 'sw.js')
const registerPath = path.join(distDir, 'registerSW.js')
const buildInfoPath = path.join(distDir, 'pms10-apk-build.json')

function fail(message) {
  console.error(`\n[PMS10 Android] ${message}\n`)
  process.exit(1)
}

if (!fs.existsSync(path.join(root, 'package.json'))) {
  fail('Run this script from the PMS10 project root.')
}

if (!fs.existsSync(indexPath)) {
  fail('dist/index.html was not found. Run npm run build first.')
}

let commit = 'unknown'
try {
  commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim()
} catch {
  // Build preparation must still work outside Git.
}

const builtAt = new Date().toISOString()

let html = fs.readFileSync(indexPath, 'utf8')

// The APK must not behave like a browser-installed PWA. Remove Vite PWA's
// automatic registration from the Android copy of index.html only.
html = html
  .replace(
    /<script[^>]*id=["']vite-plugin-pwa:register-sw["'][^>]*>\s*<\/script>/gi,
    '',
  )
  .replace(
    /<script[^>]*src=["']\/?registerSW\.js["'][^>]*>\s*<\/script>/gi,
    '',
  )
  .replace(
    /<link[^>]*rel=["']manifest["'][^>]*>/gi,
    '',
  )

const bootstrap = `
<script id="pms10-native-webview-bootstrap">
(() => {
  window.__PMS10_NATIVE_APK__ = true;
  window.__PMS10_APK_BUILD__ = ${JSON.stringify({ commit, builtAt })};

  const cleanupNativePwaState = async () => {
    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(
          registrations.map((registration) => registration.unregister().catch(() => false)),
        );
      }

      if ('caches' in window) {
        const names = await caches.keys();
        const stalePwaCaches = names.filter((name) =>
          /workbox|precache|vite[-_]?pwa/i.test(name),
        );
        await Promise.all(stalePwaCaches.map((name) => caches.delete(name)));
      }
    } catch (error) {
      console.warn('[PMS10 Android] PWA cleanup warning:', error);
    }
  };

  cleanupNativePwaState();
})();
</script>
`.trim()

if (!html.includes('pms10-native-webview-bootstrap')) {
  if (/<head[^>]*>/i.test(html)) {
    html = html.replace(/<head([^>]*)>/i, `<head$1>\n    ${bootstrap}`)
  } else {
    html = `${bootstrap}\n${html}`
  }
}

fs.writeFileSync(indexPath, html, 'utf8')

// Transition worker:
// An older installed APK may already have a Workbox service worker controlling
// the Capacitor origin. When that old registration checks /sw.js after the APK
// is upgraded, this worker replaces it, clears only PWA shell caches,
// unregisters itself, then reloads controlled windows onto the APK's bundled
// index.html. Dexie/IndexedDB, localStorage, queued updates and queued photos
// are intentionally NOT cleared.
const transitionWorker = `
// PMS10_NATIVE_SW_RESET
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const names = await caches.keys();
      const stalePwaCaches = names.filter((name) =>
        /workbox|precache|vite[-_]?pwa/i.test(name)
      );
      await Promise.all(stalePwaCaches.map((name) => caches.delete(name)));
    } catch (_) {}

    try {
      await self.registration.unregister();
    } catch (_) {}

    try {
      const clients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      await Promise.all(
        clients.map((client) => {
          try {
            return client.navigate(client.url);
          } catch (_) {
            return Promise.resolve();
          }
        }),
      );
    } catch (_) {}
  })());
});
`.trimStart()

fs.writeFileSync(swPath, transitionWorker, 'utf8')

// Keep a tiny registration bridge in the APK. A stale cached index.html from an
// older APK may still reference /registerSW.js. Whether that request is served
// from the old precache or from the new APK, it will register /sw.js and allow
// the transition worker above to retire the stale service worker.
const registrationBridge = `
// PMS10_NATIVE_SW_RESET_BRIDGE
if ('serviceWorker' in navigator) {
  navigator.serviceWorker
    .register('/sw.js', { scope: '/' })
    .then((registration) => registration.update().catch(() => undefined))
    .catch(() => undefined);
}
`.trimStart()

fs.writeFileSync(registerPath, registrationBridge, 'utf8')

// Workbox runtime is no longer needed inside the APK bundle.
for (const entry of fs.readdirSync(distDir)) {
  if (/^workbox-.*\.js$/i.test(entry)) {
    fs.rmSync(path.join(distDir, entry), { force: true })
  }
}

fs.writeFileSync(
  buildInfoPath,
  JSON.stringify(
    {
      product: 'PMS10',
      platform: 'android',
      commit,
      builtAt,
      pwaServiceWorkerEnabled: false,
      preservesIndexedDb: true,
      preservesLocalStorage: true,
    },
    null,
    2,
  ) + '\n',
  'utf8',
)

console.log('')
console.log('PMS10 Android bundle prepared successfully.')
console.log(`Git commit: ${commit}`)
console.log(`Built at:   ${builtAt}`)
console.log('')
console.log('Android-only changes applied to dist/:')
console.log('  ✓ Removed browser/PWA service-worker registration from index.html')
console.log('  ✓ Added native WebView PWA-cache cleanup bootstrap')
console.log('  ✓ Replaced sw.js with one-time self-retiring transition worker')
console.log('  ✓ Added registerSW.js transition bridge for older cached APK shells')
console.log('  ✓ Removed Workbox runtime files from the Android bundle')
console.log('  ✓ Preserves Dexie/IndexedDB, localStorage, offline drafts and queued photos')
console.log('')
console.log('Next: remove android/app/src/main/assets/public and run npx cap sync android.')
