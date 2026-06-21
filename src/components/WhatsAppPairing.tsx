import React, { useState, useEffect } from 'react';
import { Bot, RefreshCw } from 'lucide-react';

export function WhatsAppPairing() {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [pairingCode, setPairingCode] = useState('');
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/whatsapp/status');
      const data = await res.json();
      setStatus(data);
    } catch (e) {
      console.error(e);
    }
  };

  const handlePair = async () => {
    if (!phoneNumber) return;
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/whatsapp/pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber })
      });
      const data = await res.json();
      if (data.success) {
        setPairingCode(data.code);
      } else {
        setErrorMsg('Failed to get pairing code: ' + data.error);
      }
    } catch (e: any) {
      setErrorMsg('Error: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  if (!status) return <div className="p-4 text-zinc-500">Loading WhatsApp Status...</div>;

  if (status.registered) {
    return (
      <div className="flex items-center gap-2 text-green-400 p-4 border border-green-900/50 rounded-lg bg-green-500/10">
        <Bot className="w-5 h-5" />
        <span className="font-medium text-sm">WhatsApp Bot is connected and active.</span>
      </div>
    );
  }

  return (
    <div className="p-4 border border-zinc-800 rounded-lg bg-zinc-900/50 space-y-4">
      <div className="flex items-center gap-2 text-blue-400">
        <Bot className="w-5 h-5" />
        <h3 className="font-medium">WhatsApp Bot Pairing</h3>
      </div>
      
      {!pairingCode ? (
        <div className="space-y-3">
          <p className="text-sm text-zinc-400">Enter your WhatsApp number (with country code, e.g., 919891478164) to pair the bot.</p>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="e.g. 919891478164"
              value={phoneNumber}
              onChange={e => setPhoneNumber(e.target.value)}
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100"
            />
            <button
              onClick={handlePair}
              disabled={loading || !phoneNumber}
              className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              {loading ? 'Wait...' : 'Get Code'}
            </button>
          </div>
          {errorMsg && (
            <p className="text-sm text-red-500">{errorMsg}</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-zinc-400">Enter this pairing code in WhatsApp (Linked Devices {'>'} Link with Phone Number):</p>
          <div className="text-4xl font-mono tracking-widest text-center py-4 bg-zinc-950 rounded-lg text-blue-400 select-all">
            {pairingCode}
          </div>
          <button
            onClick={() => setPairingCode('')}
            className="flex items-center justify-center gap-2 w-full text-sm text-zinc-500 hover:text-zinc-300 py-2"
          >
            <RefreshCw className="w-4 h-4" />
            Try another number
          </button>
        </div>
      )}
    </div>
  );
}
