import React, { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

export function InstallPWA() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Check if the app is already installed/running in standalone mode
    if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone) {
      setIsStandalone(true);
      return;
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      // If we don't have the prompt, perhaps the user is on iOS or the prompt already fired.
      // We could show instructions for iOS here.
      alert('To install on iOS: tap the Share button and then "Add to Home Screen". On Android/Desktop: Look for the install icon in the address bar.');
      return;
    }
    
    // Show the install prompt
    deferredPrompt.prompt();
    
    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      console.log('User accepted the install prompt');
    } else {
      console.log('User dismissed the install prompt');
    }
    
    setDeferredPrompt(null);
    setShowPrompt(false);
  };

  if (isStandalone) {
    return null; // Don't show if already installed
  }

  // We are running inside an iframe in AI Studio context if window.self !== window.top
  const isIframe = window.self !== window.top;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {isIframe && (
        <div className="bg-amber-950/80 border border-amber-500/50 text-amber-200 text-xs p-3 rounded-xl shadow-lg backdrop-blur-sm max-w-[250px]">
          <p className="mb-2"><strong>Tip:</strong> Find the "Install" option after opening the app in a new tab.</p>
          <a 
            href={window.location.href} 
            target="_blank" 
            rel="noopener noreferrer"
            className="block text-center bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 py-1.5 px-3 rounded-lg border border-amber-500/30 transition-colors"
          >
            Open in New Tab
          </a>
        </div>
      )}
      
      {(!isIframe && showPrompt) && (
        <div className="bg-indigo-600 border border-indigo-500 text-white p-4 rounded-2xl shadow-xl shadow-indigo-900/50 w-72 relative animate-in slide-in-from-bottom-8 flex flex-col gap-3">
          <button 
            onClick={() => setShowPrompt(false)}
            className="absolute top-2 right-2 text-indigo-300 hover:text-white transition-colors"
          >
            <X size={16} />
          </button>
          
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" className="w-8 h-8 rounded-lg overflow-hidden">
                <rect width="512" height="512" rx="100" fill="#4f46e5" />
                <path d="M149.33 224L256 117.33 362.67 224v170.67c0 36.8-19.2 71.47-51.2 91.73L256 512l-55.47-25.6c-32-20.27-51.2-54.93-51.2-91.73V224zM245.33 460.8V145.07l-74.66 74.66v174.94c0 23.46 12.8 44.8 34.13 57.6l40.53 18.13v-9.6zm21.34 0v9.6l40.53-18.13c21.33-12.8 34.13-34.14 34.13-57.6V219.73l-74.66-74.66v315.73z" fill="#ffffff" />
              </svg>
            </div>
            <div>
              <h3 className="font-bold text-sm">Install App</h3>
              <p className="text-xs text-indigo-200">Install Moderators Report on your device for a better experience.</p>
            </div>
          </div>
          
          <button 
            onClick={handleInstallClick}
            className="w-full bg-white text-indigo-600 hover:bg-slate-100 font-bold py-2 rounded-lg flex items-center justify-center gap-2 text-sm transition-colors"
          >
            <Download size={16} />
            Install to Home Screen
          </button>
        </div>
      )}
    </div>
  );
}
