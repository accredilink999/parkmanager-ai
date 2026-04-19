'use client';
import { useEffect } from 'react';

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
        .then((reg) => {
          // Check for updates on every page load
          reg.update();

          // Only auto-reload on SW update (not first install)
          reg.addEventListener('updatefound', () => {
            const newSW = reg.installing;
            if (newSW && navigator.serviceWorker.controller) {
              // There's already a SW controlling — this is an update
              newSW.addEventListener('statechange', () => {
                if (newSW.state === 'activated') {
                  window.location.reload();
                }
              });
            }
          });
        })
        .catch(() => {});
    }
  }, []);

  return null;
}
