import React, { useState, useEffect } from 'react';
import { Bot, RefreshCw, Smartphone, AlertCircle, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

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
    if (!phoneNumber) {
      setErrorMsg('Please enter a phone number');
      return;
    }
    setLoading(true);
    setErrorMsg('');
    setPairingCode('');

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
        setErrorMsg(data.error);
      }
    } catch (e: any) {
      setErrorMsg('System Error: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    if (!confirm('Warning: This will disconnect the bot and delete all session data. Are you sure?')) return;
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/whatsapp/logout', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setPairingCode('');
        setErrorMsg('Session cleared. Please wait 10 seconds for the system to restart, then try generating a new code.');
        setTimeout(fetchStatus, 5000);
      } else {
        setErrorMsg('Logout failed: ' + data.error);
      }
    } catch (e: any) {
      setErrorMsg('Logout Error: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  if (!status) return (
    <div className="flex items-center gap-3 p-4 bg-zinc-900 border border-zinc-800 rounded-2xl">
      <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
      <span className="text-sm font-bold text-zinc-500 uppercase tracking-widest">Warming Up System...</span>
    </div>
  );

  return (
    <div className="space-y-4">
      {status.connected ? (
        <div className="p-6 bg-zinc-900 border border-green-500/20 rounded-[2rem] shadow-xl shadow-green-900/5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-green-500/10 flex items-center justify-center border border-green-500/30">
                <Bot className="w-6 h-6 text-green-500" />
              </div>
              <div>
                <h3 className="font-black text-white text-lg tracking-tight uppercase">Bot is Live</h3>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-[10px] font-black text-green-500/70 uppercase tracking-[0.2em]">Active</span>
                </div>
              </div>
            </div>
          </div>
          
          <button
            onClick={handleLogout}
            disabled={loading}
            className="w-full mt-2 py-4 bg-zinc-800 hover:bg-red-950/20 hover:text-red-500 active:scale-[0.98] transition-all rounded-xl text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] border border-white/5 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            Reset & Relink Bot
          </button>
        </div>
      ) : (
        <div className="p-8 bg-zinc-900 border border-zinc-800 rounded-[2.5rem] shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-600 via-purple-600 to-blue-600 animate-gradient-x opacity-30" />
          
          <div className="flex items-center gap-4 mb-8">
            <div className="w-12 h-12 rounded-2xl bg-blue-600/10 flex items-center justify-center border border-blue-500/30">
              <Smartphone className="w-6 h-6 text-blue-500" />
            </div>
            <h3 className="text-xl font-black text-white tracking-tight uppercase">Link WhatsApp Bot</h3>
          </div>

          <AnimatePresence mode="wait">
            {!pairingCode ? (
              <motion.div
                key="input"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="space-y-6"
              >
                <div className="space-y-4">
                  <label className="block text-zinc-500 font-black text-[10px] uppercase tracking-[0.2em] px-2">
                    Phone Number (Format: 919891478164)
                  </label>
                  <div className="relative group">
                    <input
                      type="text"
                      placeholder="Enter number..."
                      value={phoneNumber}
                      onChange={e => setPhoneNumber(e.target.value.replace(/\D/g, ''))}
                      className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-4 text-white placeholder:text-zinc-800 outline-none focus:border-blue-500/50 transition-all font-mono text-xl"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <button
                    onClick={handlePair}
                    disabled={loading || !phoneNumber}
                    className="w-full bg-blue-600 hover:bg-blue-500 active:scale-[0.98] disabled:opacity-50 text-white font-black py-5 rounded-2xl transition-all shadow-xl shadow-blue-900/20 flex items-center justify-center gap-3 text-sm uppercase tracking-widest"
                  >
                    {loading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        <Smartphone className="w-5 h-5" />
                        Generate Code
                      </>
                    )}
                  </button>

                  {status.registered && (
                    <button
                      onClick={handleLogout}
                      disabled={loading}
                      className="w-full py-4 text-[10px] font-black text-zinc-600 hover:text-zinc-400 uppercase tracking-[0.2em] transition-colors"
                    >
                      Clear Stuck Session
                    </button>
                  )}
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="code"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="space-y-6"
              >
                <div className="bg-black/60 rounded-[2rem] p-10 border border-white/5 text-center relative group">
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[10px] font-black uppercase px-4 py-1 rounded-full border border-blue-400/30 tracking-[0.2em] shadow-lg">
                    Pairing Code
                  </div>
                  <div className="text-6xl font-black text-white tracking-[0.2em] font-mono py-4 bg-gradient-to-b from-white to-zinc-600 bg-clip-text text-transparent">
                    {pairingCode}
                  </div>
                </div>

                <div className="bg-blue-600/5 rounded-2xl p-6 border border-blue-500/10 space-y-4">
                  <h4 className="text-blue-500 text-[10px] font-black uppercase tracking-widest">How to link:</h4>
                  <p className="text-zinc-500 text-[11px] font-bold leading-relaxed">
                    Open WhatsApp {'>'} Settings {'>'} Linked Devices {'>'} Link a Device {'>'} Link with phone number instead. Enter the code above.
                  </p>
                </div>

                <button
                  onClick={() => setPairingCode('')}
                  className="w-full text-zinc-500 hover:text-white font-black text-[10px] uppercase tracking-[0.3em] transition-colors"
                >
                  ← Try Another Number
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {errorMsg && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-6 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-start gap-3"
            >
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-red-500 text-[10px] font-black uppercase tracking-widest leading-relaxed">
                {errorMsg}
              </p>
            </motion.div>
          )}
        </div>
      )}
    </div>
  );
}

