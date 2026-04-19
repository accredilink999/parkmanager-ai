'use client';
import { useEffect } from 'react';

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
        .then((reg) => {
          // Check for updates immediately on every page load
          reg.update();

          // When a new SW is found, activate it straight away
          reg.addEventListener('updatefound', () => {
            const newSW = reg.installing;
            if (newSW) {
              newSW.addEventListener('statechange', () => {
                if (newSW.state === 'activated') {
                  // New SW active — reload to get fresh content
                  window.location.reload();
                }
              });
            }
          });
        })
        .catch((err) => {
          console.log('SW registration failed:', err);
        });
    }
  }, []);

  return null;
}
