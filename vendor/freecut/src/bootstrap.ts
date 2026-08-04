const APP_SHELL_CACHE_PREFIX = 'freecut-app-shell-'

console.info('FreeCut module bootstrap executing')

async function removeProductionAppShellFromDevelopment(): Promise<boolean> {
  if (!import.meta.env.DEV) return false

  const wasControlled = 'serviceWorker' in navigator && navigator.serviceWorker.controller !== null

  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations()
    await Promise.all(
      registrations
        .filter((registration) => registration.scope.startsWith(window.location.origin))
        .map((registration) => registration.unregister()),
    )
  }

  if ('caches' in window) {
    const cacheNames = await caches.keys()
    await Promise.all(
      cacheNames
        .filter((cacheName) => cacheName.startsWith(APP_SHELL_CACHE_PREFIX))
        .map((cacheName) => caches.delete(cacheName)),
    )
  }

  return wasControlled
}

function reportBootstrapError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)
  console.error('FreeCut bootstrap failed to load main module', message)
  if (window.parent !== window) {
    window.parent.postMessage({ type: 'freecut-error', error: `bootstrap: ${message}` }, '*')
  }
}

function loadMainModule(): Promise<unknown> {
  console.info('FreeCut main module import requested')
  return import('./main').then((module) => {
    console.info('FreeCut main module import resolved')
    return module
  })
}

void removeProductionAppShellFromDevelopment()
  .then((requiresReload) => {
    if (requiresReload) {
      window.location.reload()
      return
    }
    return loadMainModule()
  })
  .catch((error) => {
    reportBootstrapError(error)
    return loadMainModule().catch((retryError) => {
      reportBootstrapError(retryError)
      throw retryError
    })
  })
