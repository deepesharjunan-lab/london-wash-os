/* The London Wash service worker: push notifications and an offline notice.
   One worker serves all three apps (/work staff, /owner owners, /my customers). */

const OFFLINE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Offline</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#101828;color:#efe8da;font:16px/1.5 system-ui,sans-serif;text-align:center;padding:24px}
b{display:block;font:500 40px Georgia,serif;color:#e3d2ac;margin-bottom:12px}button{margin-top:18px;min-height:48px;padding:0 22px;border:0;border-radius:999px;background:#efe8da;color:#15213a;font-weight:600;font-size:15px}</style></head>
<body><div><b>LW</b>You're offline.<br>Check your connection and try again.<br><button onclick="location.reload()">Try again</button></div></body></html>`;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// Pages always come from the network (they show live work); only when there's
// no connection do we show a friendly offline screen.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.mode !== "navigate") return;
  event.respondWith(
    fetch(req).catch(() => new Response(OFFLINE_HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } }))
  );
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "The London Wash", body: event.data ? event.data.text() : "" };
  }
  const url = data.url || "/";
  const app = url.startsWith("/work") ? "staff" : url.startsWith("/my") ? "club" : "owner";
  event.waitUntil(
    self.registration.showNotification(data.title || "The London Wash", {
      body: data.body || "",
      icon: `/appicon/${app}-192.png`,
      badge: "/appicon/badge-96.png",
      tag: data.tag || undefined,
      renotify: !!data.tag,
      data: { url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (w.url === url && "focus" in w) return w.focus();
      }
      for (const w of wins) {
        if ("navigate" in w && new URL(w.url).origin === self.location.origin) {
          return w.focus().then(() => w.navigate(url));
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
