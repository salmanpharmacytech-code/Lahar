// Minimal service worker — just enough to make the app installable.
// No caching of app data on purpose: Lehar is realtime (live streams, chat,
// wallet balances) so we always want fresh data from the network.
self.addEventListener("install", (e) => { self.skipWaiting(); });
self.addEventListener("activate", (e) => { self.clients.claim(); });
self.addEventListener("fetch", (e) => {
  // pass-through — always hit the network
});
