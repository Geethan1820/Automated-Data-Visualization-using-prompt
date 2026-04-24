import React, { useEffect, useState } from 'react';
import axios from 'axios';
import API from '../config';
import {
  LayoutDashboard,
  MessageSquare,
  Database,
  Plus,
  Table,
  Moon,
  Sun,
  Clock3,
  FileText,
  RefreshCw,
  Trash2,
  ArrowUpRight,
  LogOut,
  BarChart3,
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { motion } from 'framer-motion';

const Sidebar = ({ setView, currentFile, onNewChat, onLoadSession, onDeleteSession, view }) => {
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const fetchSessions = async () => {
    setLoadingHistory(true);
    try {
      const res = await axios.get(`${API}/files`);
      setSessions(res.data.files || []);
    } catch (e) {
      console.warn('Could not load session history:', e.message);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, [currentFile?.file_id]);

  const formatDate = (iso) => {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await axios.delete(`${API}/files/${deleteTarget.id}`);
      setSessions((prev) => prev.filter((session) => session.id !== deleteTarget.id));
      if (onDeleteSession) onDeleteSession(deleteTarget.id);
    } catch (e) {
      console.warn('Delete failed:', e.message);
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  return (
    <>
      <aside className="flex h-full w-24 shrink-0 flex-col border-r border-[var(--border-main)] bg-[var(--bg-sidebar)] text-[var(--text-main)] shadow-[var(--sidebar-shadow)] sm:w-80 z-20 transition-all duration-300">
        <div className="border-b border-[var(--border-main)] px-3 pb-4 pt-4 sm:px-6 sm:pb-6 sm:pt-8 bg-[var(--bg-sidebar-accent)]">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 text-slate-950 shadow-[0_0_20px_rgba(16,185,129,0.3)] animate-float">
                <BarChart3 size={24} />
              </div>
              <div className="hidden sm:block">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-500/80">
                  Data Processor
                </p>
                <h1 className="mt-1 text-2xl font-black tracking-tight text-[var(--text-main)] italic">DATANOVA</h1>
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-2xl bg-emerald-500/5 p-4 border border-emerald-500/10">
            <p className="hidden text-[11px] leading-relaxed text-[var(--text-muted)] sm:block mb-4">
              Harness AI to transform raw datasets into beautiful, interactive visual intelligence.
            </p>
            <motion.button
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={onNewChat}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-black text-slate-950 transition hover:shadow-[0_0_20px_rgba(16,185,129,0.3)]"
            >
              <Plus size={18} />
              <span className="hidden sm:inline tracking-wider">NEW ANALYSIS</span>
            </motion.button>
          </div>
        </div>

        <div className="px-3 pt-6 sm:px-6">
          <p className="hidden px-2 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)] sm:block mb-4">Core Workspace</p>
          <nav className="space-y-1">
            <SidebarItem
              icon={<LayoutDashboard size={18} />}
              label="Dashboard"
              hint="Global Overview"
              active={view === 'dashboard'}
              onClick={() => setView('dashboard')}
            />
            {currentFile && (
              <>
                <SidebarItem
                  icon={<MessageSquare size={18} />}
                  label="AI Chat"
                  hint="Conversational Data"
                  active={view === 'chat'}
                  onClick={() => setView('chat')}
                />
                <SidebarItem
                  icon={<Table size={18} />}
                  label="Data Vault"
                  hint="Raw Records"
                  active={view === 'preview'}
                  onClick={() => setView('preview')}
                />
              </>
            )}
          </nav>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 pb-3 pt-8 sm:px-6 sm:pb-6">
          <div className="mb-4 flex items-center justify-between px-2">
            <p className="hidden text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)] sm:block">Archive</p>
            <button
              onClick={fetchSessions}
              className="rounded-lg p-1.5 text-[var(--text-muted)] transition hover:bg-emerald-500/10 hover:text-emerald-400"
            >
              <RefreshCw size={14} className={loadingHistory ? 'animate-spin' : ''} />
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1 scrollbar-premium">
            {sessions.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--border-main)] bg-white/[0.02] px-4 py-8 text-center text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)]">
                Empty Archive
              </div>
            ) : (
              sessions.map((session, index) => (
                <motion.div
                  key={session.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.03 }}
                  className={`group relative overflow-hidden rounded-2xl border transition-all duration-300 ${
                    currentFile?.file_id === session.id
                      ? 'border-emerald-500/30 bg-emerald-500/5 shadow-[0_0_15px_rgba(16,185,129,0.05)]'
                      : 'border-[var(--border-main)] bg-[var(--bg-sidebar-accent)] hover:border-emerald-500/20 hover:bg-emerald-500/5'
                  }`}
                >
                  <button onClick={() => onLoadSession?.(session)} className="w-full px-4 py-4 text-left">
                    <div className="flex items-start gap-4">
                      <div className={`mt-0.5 rounded-xl p-2.5 transition-colors ${
                        currentFile?.file_id === session.id ? 'bg-emerald-500/20 text-emerald-400' : 'bg-[var(--bg-app)] text-[var(--text-muted)] group-hover:text-emerald-400'
                      }`}>
                        <FileText size={16} />
                      </div>
                      <div className="hidden min-w-0 flex-1 sm:block">
                        <p className={`truncate text-sm font-bold tracking-tight ${
                          currentFile?.file_id === session.id ? 'text-emerald-400' : 'text-[var(--text-main)] group-hover:text-emerald-500'
                        }`}>{session.filename}</p>
                        <div className="mt-2 flex items-center gap-3 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
                          <span className="flex items-center gap-1.5"><Clock3 size={10} /> {formatDate(session.uploaded_at)}</span>
                          <span className="h-1 w-1 rounded-full bg-[var(--border-main)]" />
                          <span className="text-emerald-500/70">{session.quality_score}% Quality</span>
                        </div>
                      </div>
                    </div>
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget(session);
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <span className="flex rounded-lg bg-red-500/10 p-2 text-red-400 hover:bg-red-500/20">
                      <Trash2 size={14} />
                    </span>
                  </button>
                </motion.div>
              ))
            )}
          </div>
        </div>

        <div className="border-t border-[var(--border-main)] space-y-2 p-4 sm:p-6 bg-[var(--bg-sidebar-accent)]">
          <div className="hidden rounded-2xl border border-[var(--border-main)] bg-[var(--bg-sidebar)] px-4 py-3 sm:block">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-500/60 mb-1">OPERATOR</p>
            <p className="truncate text-sm font-black text-[var(--text-main)]">{user?.username ?? 'GUEST'}</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => logout()}
              className="flex items-center justify-center gap-2 rounded-xl border border-[var(--border-main)] bg-[var(--bg-sidebar)] py-3 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] transition hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20"
            >
              <LogOut size={14} />
              <span>EXIT</span>
            </button>
            <button
              onClick={toggleTheme}
              className="flex items-center justify-center gap-2 rounded-xl border border-[var(--border-main)] bg-[var(--bg-sidebar)] py-3 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] transition hover:bg-emerald-500/10 hover:text-emerald-400 hover:border-emerald-500/20"
            >
              {theme === 'light' ? <Sun size={14} /> : <Moon size={14} />}
              <span>{theme === 'light' ? 'DAY' : 'NT'}</span>
            </button>
          </div>
        </div>
      </aside>

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="w-full max-w-sm rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900"
          >
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-red-100 p-3 text-red-500 dark:bg-red-950/40 dark:text-red-400">
                <Trash2 size={18} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900 dark:text-white">Delete session?</p>
                <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{deleteTarget.filename}</p>
              </div>
            </div>

            <p className="mt-4 text-sm leading-6 text-slate-600 dark:text-slate-300">
              This removes the uploaded dataset and its related history. The action cannot be undone.
            </p>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="flex-1 rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={deleting}
                className="flex-1 rounded-2xl bg-red-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-600 disabled:opacity-60"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </>
  );
};

const SidebarItem = ({ icon, label, hint, active, onClick }) => (
  <button
    onClick={onClick}
    className={`flex w-full items-center justify-center gap-3 rounded-2xl px-3 py-3 text-left transition sm:justify-start ${
      active
        ? 'border border-indigo-500/35 bg-indigo-500/10 text-emerald-500'
        : 'border border-transparent text-[var(--text-muted)] hover:bg-white/5'
    }`}
  >
    <span className={`rounded-xl p-2 ${active ? 'bg-indigo-400/25 text-emerald-500' : 'bg-[var(--bg-app)] text-[var(--text-muted)]'}`}>{icon}</span>
    <span className="hidden min-w-0 flex-1 sm:block">
      <span className="block text-sm font-semibold">{label}</span>
      <span className="block text-xs opacity-70">{hint}</span>
    </span>
  </button>
);

export default Sidebar;
