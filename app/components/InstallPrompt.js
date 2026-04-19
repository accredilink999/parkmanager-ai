'use client';
import { useState, useEffect } from 'react';

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showBanner, setShowBanner] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
      return;
    }

    // Check if user dismissed recently
    const dismissed = sessionStorage.getItem('pm_install_dismissed');
    if (dismissed) return;

    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowBanner(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // Also show iOS install hint
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
    if (isIOS && isSafari) {
      setShowBanner(true);
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  async function handleInstall() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setShowBanner(false);
        setIsInstalled(true);
      }
      setDeferredPrompt(null);
    }
  }

  function dismiss() {
    setShowBanner(false);
    sessionStorage.setItem('pm_install_dismissed', '1');
  }

  if (!showBanner || isInstalled) return null;

  const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 animate-slide-up">
      <div className="max-w-lg mx-auto bg-white rounded-2xl shadow-2xl border border-slate-200 p-5">
        <div className="flex items-start gap-4">
          <img src="/icon-192.png" alt="ParkManagerAI" className="w-12 h-12 rounded-xl shrink-0" />
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-slate-900">Install ParkManagerAI</h3>
            <p className="text-sm text-slate-500 mt-0.5">
              {isIOS
                ? 'Tap the share button, then "Add to Home Screen" for the best experience.'
                : 'Install as an app for quick access, offline support, and push notifications.'}
            </p>
            <div className="flex items-center gap-3 mt-3">
              {!isIOS && (
                <button
                  onClick={handleInstall}
                  className="px-5 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-500 transition-colors"
                >
                  Install App
                </button>
              )}
              <button
                onClick={dismiss}
                className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700 transition-colors"
              >
                Not now
              </button>
            </div>
          </div>
          <button onClick={dismiss} className="text-slate-400 hover:text-slate-600 shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
