// Service worker minimal pour Webnote — sert uniquement à afficher des
// notifications de façon fiable via showNotification(), ce que Chrome/Opera
// sur mobile EXIGENT (le new Notification() classique y est bloqué).
// Ne gère pas de vrai "push" en arrière-plan (ça nécessiterait Firebase
// Cloud Messaging + un serveur) : il sert juste de relais pendant que
// l'onglet Webnote est ouvert (même en arrière-plan/minimisé).

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Au clic sur la notification : ramène l'onglet Webnote au premier plan,
// ou en ouvre un nouveau si aucun n'est déjà ouvert.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || './inbox.html';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
