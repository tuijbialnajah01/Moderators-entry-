import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import { Dashboard } from './components/Dashboard';
import { ModDetail } from './components/ModDetail';
import { ModList } from './components/ModList';

function LayoutShell({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, loading, signIn, logOut } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);
  const location = useLocation();

  // Close sidebar on route change on mobile
  React.useEffect(() => {
    setIsSidebarOpen(false);
  }, [location.pathname]);

  return (
    <div className="flex h-screen w-full bg-slate-50 font-sans text-slate-900 overflow-hidden relative">
      {/* Mobile Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/50 z-40 md:hidden" 
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 flex-shrink-0 flex flex-col transform transition-transform duration-200 ease-in-out md:relative md:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-6 border-b border-slate-800 flex justify-between items-center">
          <h1 className="text-white font-bold text-xl tracking-tight flex items-center gap-2">
            <span className="bg-indigo-500 w-8 h-8 rounded flex items-center justify-center text-sm">M</span>
            MOD MONITOR
          </h1>
          <button className="md:hidden text-slate-400 hover:text-white" onClick={() => setIsSidebarOpen(false)}>
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          <Link to="/" className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${location.pathname === '/' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}>
            <svg className={`w-5 h-5 ${location.pathname === '/' ? 'opacity-80' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16m-7 6h7"></path></svg>
            <span className="font-medium">Dashboard</span>
          </Link>
          <Link to="/mods" className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${location.pathname.startsWith('/mod') ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}>
            <svg className={`w-5 h-5 ${location.pathname.startsWith('/mod') ? 'opacity-80' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
            <span className="font-medium">Moderators</span>
          </Link>
        </nav>
        <div className="p-4 border-t border-slate-800 bg-slate-900 min-h-[72px]">
          {loading ? (
             <div className="animate-pulse flex gap-3 items-center">
                <div className="w-8 h-8 border-2 border-slate-700 bg-slate-800 rounded-full flex-shrink-0"></div>
                <div className="flex-1 w-full bg-slate-800 h-4 rounded"></div>
             </div>
          ) : user ? (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-indigo-200 border-2 border-indigo-400 flex items-center justify-center text-indigo-700 font-bold overflow-hidden">
                 {user?.email?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div className="overflow-hidden flex-1">
                <p className="text-xs text-slate-400 uppercase tracking-widest font-bold">{isAdmin ? 'Admin' : 'User'}</p>
                <p className="text-sm text-white truncate">{user?.email}</p>
              </div>
            </div>
          ) : (
            <button
               onClick={signIn}
               className="w-full flex items-center justify-center py-2 px-4 rounded text-sm font-semibold text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors"
            >
               Sign in with Google
            </button>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden w-full">
        {/* Mobile Header Toggle */}
        <div className="md:hidden h-14 bg-white border-b border-slate-200 flex items-center px-4 flex-shrink-0">
          <button 
            className="text-slate-500 hover:text-slate-900"
            onClick={() => setIsSidebarOpen(true)}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
          </button>
          <span className="ml-4 font-bold text-slate-900">MOD MONITOR</span>
        </div>
        
        <div className="flex-1 overflow-y-auto w-full">
          {children}
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <LayoutShell>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/mods" element={<ModList />} />
            <Route path="/mod/:id" element={<ModDetail />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </LayoutShell>
      </Router>
    </AuthProvider>
  );
}
