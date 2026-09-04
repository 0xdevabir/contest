// Phase 11 — minimal web push receiver. Registered on demand from
// src/components/profile/NotificationPreferencesForm.tsx when a student
// opts into browser push notifications.
self.addEventListener("push", (event) => {
  let data = { title: "Notification", body: "", href: "/" };
  try {
    data = event.data ? event.data.json() : data;
  } catch {
    /* non-JSON payload — use the defaults above */
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Notification", {
      body: data.body || "",
      data: { href: data.href || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = event.notification.data?.href || "/";
  event.waitUntil(clients.openWindow(href));
});
