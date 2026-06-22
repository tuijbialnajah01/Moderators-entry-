import React, { useState, useEffect } from 'react';
import { Bot, Smartphone, AlertCircle, Loader2, Copy, Check, LogOut, ChevronLeft, ShieldCheck, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export function WhatsAppPairing() {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [pairingCode, setPairingCode] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [status, setStatus] = useState<{ connected: boolean; registered: boolean; initialising: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/whatsapp/status');
      const data = await res.json();
      setStatus(data);
    } catch (e) {}
  };

  useEffect(() => {
    fetchStatus();
    const inv = setInterval(fetchStatus, 3000);
    return () => clearInterval(inv);
  }, []);

  const handleCopy = () => {
    if (pairingCode) {
      navigator.clipboard.writeText(pairingCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handlePair = async () => {
    if (!phoneNumber) {
      setErrorMsg('Enter phone number');
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
        setErrorMsg(data.error || 'Pairing failed. Try again.');
      }
    } catch (e: any) {
      setErrorMsg('Engine offline. Try again in 5s.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    if (!confirm('This will disconnect the bot. Proceed?')) return;
    setLoading(true);
    try {
      await fetch('/api/whatsapp/logout', { method: 'POST' });
      setPairingCode('');
      setErrorMsg('System reset. Please wait...');
      setTimeout(fetchStatus, 3000);
    } catch (e) {} finally {
      setLoading(false);
    }
  };

  if (!status) return (
    <div className="flex flex-col items-center justify-center p-20 space-y-6">
      <Loader2 className="w-10 h-10 text-blue-500 animate-spin opacity-50" />
      <span className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.4em]">Booting Core...</span>
    </div>
  );

  return (
    <div className="max-w-lg mx-auto py-8">
      <AnimatePresence mode="wait">
        {status.connected ? (
          <motion.div 
            key="online"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-zinc-900 border border-green-500/10 rounded-[3rem] p-12 text-center space-y-10 shadow-2xl overflow-hidden relative"
          >
            <div className="absolute -top-24 -left-24 w-64 h-64 bg-green-500/5 blur-[100px] rounded-full" />
            
            <div className="relative">
              <div className="w-24 h-24 bg-green-500/10 rounded-[2.5rem] flex items-center justify-center mx-auto border border-green-500/20 mb-8 group">
                <ShieldCheck className="w-12 h-12 text-green-500 group-hover:scale-110 transition-transform" />
              </div>
              <div className="space-y-2">
                <h3 className="text-4xl font-black text-white uppercase tracking-tighter">System Active</h3>
                <p className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.4em]">Bot Linked Successfully</p>
              </div>
            </div>

            <button
              onClick={handleLogout}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 py-6 bg-zinc-800/40 hover:bg-red-500/10 hover:text-red-500 text-zinc-500 rounded-[1.5rem] transition-all font-black text-[10px] uppercase tracking-[0.3em] border border-white/5 disabled:opacity-30 active:scale-95"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
              Disconnect Bot
            </button>
          </motion.div>
        ) : (
          <motion.div 
            key="offline"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-zinc-900 border border-white/5 rounded-[3.5rem] p-3 shadow-2xl overflow-hidden"
          >
            <div className="bg-black/20 rounded-[3rem] p-8 md:p-14 space-y-12">
              <AnimatePresence mode="wait">
                {!pairingCode ? (
                  <motion.div
                    key="input"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="space-y-12"
                  >
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <h3 className="text-5xl font-black text-white uppercase tracking-tighter leading-none">Pair</h3>
                        <p className="text-blue-500 text-[10px] font-black uppercase tracking-[0.5em] opacity-80">WhatsApp Engine</p>
                      </div>
                      <div className="w-20 h-20 bg-blue-600/10 rounded-3xl flex items-center justify-center border border-blue-500/20">
                        <Smartphone className="w-10 h-10 text-blue-500" />
                      </div>
                    </div>

                    <div className="space-y-8">
                      <div className="space-y-4">
                        <label className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.4em] px-2 block">
                          Phone Number
                        </label>
                        <input
                          type="text"
                          placeholder="919891478164"
                          value={phoneNumber}
                          onChange={e => setPhoneNumber(e.target.value.replace(/\D/g, ''))}
                          className="w-full bg-black/60 border border-white/5 rounded-[2rem] px-8 py-8 text-white text-4xl font-mono tracking-tighter outline-none focus:border-blue-500/40 transition-all placeholder:text-zinc-900 shadow-inner"
                        />
                      </div>

                      <button
                        onClick={handlePair}
                        disabled={loading || !phoneNumber}
                        className="w-full h-24 bg-blue-600 hover:bg-blue-500 disabled:opacity-30 text-white font-black rounded-[2.5rem] transition-all shadow-2xl shadow-blue-900/40 flex items-center justify-center gap-4 text-xs uppercase tracking-[0.4em] active:scale-[0.98]"
                      >
                        {loading ? (
                          <Loader2 className="w-6 h-6 animate-spin" />
                        ) : (
                          <>
                            <RefreshCw className="w-6 h-6" />
                            Link Device
                          </>
                        )}
                      </button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="code"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="space-y-12"
                  >
                    <div className="flex items-center justify-between">
                      <button 
                        onClick={() => setPairingCode('')}
                        className="w-14 h-14 rounded-2xl bg-zinc-800 flex items-center justify-center text-zinc-500 hover:text-white transition-all border border-white/5 active:scale-90"
                      >
                        <ChevronLeft className="w-7 h-7" />
                      </button>
                      <h3 className="text-xs font-black text-white uppercase tracking-[0.5em] opacity-40">Auth Code</h3>
                      <div className="w-14" />
                    </div>

                    <div 
                      onClick={handleCopy}
                      className="bg-black/60 rounded-[2.5rem] p-8 md:p-12 border border-blue-500/20 text-center relative group cursor-pointer active:scale-95 transition-all shadow-2xl flex flex-col items-center justify-center min-h-[220px]"
                    >
                      <div className="text-5xl sm:text-6xl md:text-7xl font-black text-white tracking-[0.15em] font-mono select-none flex-1 flex items-center mb-6 break-all">
                        {pairingCode}
                      </div>
                      
                      <div className="flex items-center justify-center gap-3 w-full">
                         {copied ? (
                           <div className="flex items-center gap-2 text-green-500 bg-green-500/10 px-4 py-2 rounded-full border border-green-500/20">
                             <Check className="w-3.5 h-3.5" />
                             <span className="text-[10px] font-black uppercase tracking-widest leading-none">Copied!</span>
                           </div>
                         ) : (
                           <div className="flex items-center gap-2 text-zinc-500 group-hover:text-blue-400 transition-colors uppercase font-black text-[10px] tracking-[0.3em] bg-white/5 px-4 py-2 rounded-full">
                             <Copy className="w-3.5 h-3.5" />
                             Tap to Copy
                           </div>
                         )}
                      </div>
                    </div>

                    <div className="bg-zinc-800/20 rounded-[2rem] p-6 md:p-8 border border-white/5 flex flex-col items-center justify-center">
                      <p className="text-zinc-500 text-[10px] md:text-[11px] font-bold uppercase tracking-[0.25em] leading-loose text-center">
                        <span className="text-zinc-400">Settings</span> 
                        <span className="text-zinc-700 mx-2">→</span> 
                        <span className="text-zinc-400">Linked Devices</span><br/>
                        <span className="text-zinc-700 mx-2">→</span> 
                        <span className="text-zinc-400">Link Device</span><br/>
                        <span className="text-zinc-700 mx-2">→</span> 
                        <span className="text-blue-500 font-black">Link with phone number</span>
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {errorMsg && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-8 p-8 bg-red-500/5 border border-red-500/10 rounded-[2rem] flex items-start gap-6"
                >
                  <AlertCircle className="w-6 h-6 text-red-500 shrink-0 mt-1" />
                  <div className="space-y-6 flex-1">
                    <p className="text-red-500/80 text-[11px] font-black uppercase tracking-widest leading-relaxed">
                      {errorMsg}
                    </p>
                    <button 
                      onClick={handleLogout} 
                      className="w-full py-5 bg-red-500/10 text-red-500 text-[10px] font-black uppercase tracking-[0.3em] rounded-2xl border border-red-500/20 hover:bg-red-500/20 transition-all active:scale-95"
                    >
                      Reset Core
                    </button>
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
