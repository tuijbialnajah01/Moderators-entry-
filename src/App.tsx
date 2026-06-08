import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './lib/auth';
import { ModList } from './components/ModList';
import { ModDetail } from './components/ModDetail';
import { InstallPWA } from './components/InstallPWA';

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="h-screen w-full bg-black font-sans text-zinc-100 flex flex-col overflow-hidden select-none">
          <Routes>
            <Route path="/" element={<ModList />} />
            <Route path="/mod/:id" element={<ModDetail />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <InstallPWA />
        </div>
      </Router>
    </AuthProvider>
  );
}
