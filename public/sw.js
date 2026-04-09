self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  let payload = { title: 'Handy Dudes', body: 'You have a new notification.' }
  try {
    const parsed = event.data?.json()
    if (parsed && typeof parsed === 'object') payload = { ...payload, ...parsed }
  } catch {
    // no-op
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      data: payload.data || {},
    })
  )
})
