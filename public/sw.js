const CACHE_NAME = 'parkmanager-v16';
const STATIC_ASSETS = [
  '/',
  '/login',
  '/dashboard',
  '/portal',
  '/manifest.json',
  '/icon-192.svg',
  '/icon-512.svg',
  '/hero-bg.jpg',
];

// Install — cache core pages
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate — clean ALL old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — network first, fallback to cache
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// ── PUSH NOTIFICATIONS — works even when app is closed ──
self.addEventListener('push', (event) => {
  let data = { title: '🚨 EMERGENCY', body: 'Emergency on site — open the app immediately' };
  try {
    if (event.data) data = event.data.json();
  } catch {}

  const options = {
    body: data.body || 'Emergency on site — open the app immediately',
    icon: '/icon-192.svg',
    badge: '/icon-192.svg',
    tag: 'emergency-alert',
    renotify: true,
    requireInteraction: true, // stays until user interacts
    vibrate: [500, 200, 500, 200, 500, 200, 500], // long urgent vibration pattern
    actions: [
      { action: 'open', title: 'Open App' },
    ],
    data: { url: '/dashboard/chat', convId: data.convId },
  };

  event.waitUntil(
    self.registration.showNotification(data.title || '🚨 EMERGENCY ON SITE', options)
  );
});

// When user taps the notification — open the app to the chat page
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data?.url || '/dashboard/chat';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // If app is already open, focus it and navigate
      for (const client of clients) {
        if (client.url.includes('/dashboard') || client.url.includes('/portal')) {
          client.focus();
          client.navigate(url);
          return;
        }
      }
      // Otherwise open a new window
      return self.clients.openWindow(url);
    })
  );
});
