import React, { useState, useEffect } from 'react';
import axios from 'axios';
import API from './config';
import Sidebar from './components/Sidebar';
import Upload from './components/Upload';
import DataPreview from './components/DataPreview';
import Chat from './components/Chat';
import Dashboard from './components/Dashboard';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import AuthForm from './components/AuthForm';
import { motion, AnimatePresence } from 'framer-motion';
import { Database, LayoutDashboard, UploadCloud, Cpu, Sparkles, Zap } from 'lucide-react';

function EmptyDashboardState({ onGoUpload }) {
  return (
    <div className="flex h-full items-center justify-center p-6 lg:p-10">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-3xl glass-panel rounded-[3rem] p-10 shadow-[0_40px_100px_rgba(0,0,0,0.5)] border-white/5 relative overflow-hidden"
      >
        <div className="glow-orb w-64 h-64 bg-emerald-500/10 -top-20 -left-20" />
        
        <div className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-center relative z-10">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/5 px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400">
              <Cpu size={14} />
              Unified Intelligence
            </div>
            <div className="space-y-4">
              <h2 className="text-4xl font-black tracking-tight text-[var(--text-main)] sm:text-5xl italic leading-tight">
                READY FOR <span className="text-emerald-400">ANALYSIS.</span>
              </h2>
              <p className="max-w-xl text-sm leading-8 text-[var(--text-muted)] font-medium">
                Initialize your workspace by uploading a dataset. Our AI engine will automatically scan for trends, quality scores, and interactive visualizations.
              </p>
            </div>
            <div className="flex flex-wrap gap-4 pt-4">
              <button
                onClick={onGoUpload}
                className="btn-primary flex items-center gap-3 px-8 py-4 text-sm tracking-widest uppercase"
              >
                <UploadCloud size={18} />
                Deploy Dataset
              </button>
              <div className="inline-flex items-center gap-3 rounded-2xl border border-white/5 bg-slate-900/50 px-5 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                <Database size={16} className="text-emerald-500/70" />
                CSV / EXCEL / JSON
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {[
              { text: 'Neural pattern recognition', icon: <Sparkles size={14} /> },
              { text: 'Real-time data aggregation', icon: <Zap size={14} /> },
              { text: 'Automated trend discovery', icon: <LayoutDashboard size={14} /> },
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 + i * 0.1 }}
                className="flex items-center gap-4 rounded-[1.5rem] border border-white/5 bg-white/5 p-4 text-[10px] font-bold uppercase tracking-widest text-slate-300"
              >
                <div className="rounded-xl bg-emerald-500/10 p-2 text-emerald-400">
                  {item.icon}
                </div>
                <span>{item.text}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function AppContent() {
  const [currentFile, setCurrentFile] = useState(null);
  const [view, setView] = useState('upload');
  const [initialLoaded, setInitialLoaded] = useState(false);
  const { token } = useAuth();

  // Auto-load most recent session on mount
  useEffect(() => {
    const autoLoad = async () => {
      if (!token || initialLoaded) return;
      try {
        const res = await axios.get(`${API}/files`);
        const files = res.data.files || [];
        if (files.length > 0) {
          await handleLoadSession(files[0]);
        }
      } catch (e) {
        console.warn('Auto-load failed:', e.message);
      } finally {
        setInitialLoaded(true);
      }
    };
    autoLoad();
  }, [token, initialLoaded]);

  const handleUploadSuccess = (data) => {
    setCurrentFile({
      file_id: data.file_id,
      filename: data.filename,
      columns: data.columns,
      score: data.score,
      stats: data.stats,
      quality_report: data.quality_report,
      column_details: data.column_details,
      preview: data.preview,
    });
    setView('preview');
  };

  const handleNewChat = () => {
    setCurrentFile(null);
    setView('upload');
  };

  const handleLoadSession = async (session) => {
    try {
      await axios.post(`${API}/restore-context`, { file_id: session.id });
    } catch (e) {
      console.warn('Context restore failed:', e.message);
    }

    setCurrentFile({
      file_id: session.id,
      filename: session.filename,
      columns: [],
      score: session.quality_score,
      stats: { rows: session.rows, columns: session.columns },
      quality_report: {},
    });
    setView('chat');
  };

  const handleDeleteSession = (deletedFileId) => {
    if (currentFile?.file_id === deletedFileId) {
      setCurrentFile(null);
      setView('upload');
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--bg-app)] text-[var(--text-main)] font-jakarta selection:bg-emerald-500/30 transition-colors duration-300">
      {/* Background elements */}
      <div className="glow-background">
        <div className="glow-orb w-[800px] h-[800px] bg-emerald-500/5 -top-40 -left-40" />
        <div className="glow-orb w-[600px] h-[600px] bg-cyan-500/5 bottom-0 right-0" />
      </div>

      <Sidebar
        setView={setView}
        currentFile={currentFile}
        onNewChat={handleNewChat}
        onLoadSession={handleLoadSession}
        onDeleteSession={handleDeleteSession}
        view={view}
      />

      <main className="min-w-0 flex-1 overflow-hidden p-4 lg:p-6 lg:pl-2">
        <div className="flex h-full min-w-0 flex-col overflow-hidden rounded-[3rem] border border-[var(--border-main)] bg-[var(--bg-card)] shadow-[0_20px_80px_rgba(0,0,0,0.1)] backdrop-blur-md relative transition-all duration-300">
          <AnimatePresence mode="wait">
            <motion.div
              key={view + (currentFile?.file_id || '')}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-1 flex-col overflow-hidden"
            >
              {view === 'upload' && (
                <div className="flex-1 overflow-auto scrollbar-premium">
                  <Upload onUploadSuccess={handleUploadSuccess} />
                </div>
              )}
              {view === 'preview' && currentFile && (
                <div className="flex-1 overflow-auto p-6 lg:p-8 scrollbar-premium">
                  <DataPreview currentFile={currentFile} onContinue={() => setView('chat')} />
                </div>
              )}
              {view === 'chat' && currentFile && <Chat currentFile={currentFile} />}
              {view === 'dashboard' && currentFile && (
                <div className="flex-1 overflow-auto scrollbar-premium">
                  <Dashboard currentFile={currentFile} />
                </div>
              )}
              {view === 'dashboard' && !currentFile && <EmptyDashboardState onGoUpload={() => setView('upload')} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

function AuthGate() {
  const { token } = useAuth();
  if (!token) {
    return <AuthForm />;
  }
  return <AppContent />;
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
