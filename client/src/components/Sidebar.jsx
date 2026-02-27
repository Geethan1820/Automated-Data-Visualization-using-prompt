import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
    LayoutDashboard, MessageSquare, Database, Plus,
    Table, Moon, Sun, LogOut, User, Clock, FileText, RefreshCw, Trash2
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';

const Sidebar = ({ setView, currentFile, onNewChat, onLoadSession, onDeleteSession, view }) => {
    const { theme, toggleTheme } = useTheme();
    const { user, logout } = useAuth();
    const [sessions, setSessions] = useState([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState(null); // { id, filename }
    const [deleting, setDeleting] = useState(false);

    const fetchSessions = async () => {
        setLoadingHistory(true);
        try {
            const res = await axios.get('http://localhost:8000/files');
            setSessions(res.data.files || []);
        } catch (e) {
            console.warn('Could not load session history:', e.message);
        } finally {
            setLoadingHistory(false);
        }
    };

    useEffect(() => { fetchSessions(); }, [currentFile?.file_id]);

    const formatDate = (iso) => {
        if (!iso) return '';
        try {
            return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        } catch { return ''; }
    };

    const handleSessionClick = async (session) => {
        if (onLoadSession) {
            onLoadSession(session);
        }
    };

    const handleDeleteConfirm = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        try {
            await axios.delete(`http://localhost:8000/files/${deleteTarget.id}`);
            setSessions(prev => prev.filter(s => s.id !== deleteTarget.id));
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
            <aside className="w-64 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col h-full transition-colors shrink-0">
                {/* Logo */}
                <div className="p-5 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow">
                            <LayoutDashboard size={16} className="text-white" />
                        </div>
                        <h1 className="text-xl font-extrabold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                            GVS DataNova
                        </h1>
                    </div>
                    <span className="text-[10px] font-bold bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded-full">v2</span>
                </div>

                {/* User Badge */}
                {user && (
                    <div className="px-4 pt-3">
                        <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2">
                            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                                <User size={12} className="text-white" />
                            </div>
                            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 truncate flex-1">{user.username}</span>
                            <button onClick={logout} title="Logout" className="text-gray-400 hover:text-red-500 transition-colors">
                                <LogOut size={13} />
                            </button>
                        </div>
                    </div>
                )}

                {/* New Chat Button */}
                <div className="p-4 pb-0">
                    <motion.button
                        whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                        onClick={onNewChat}
                        className="w-full flex items-center gap-2 justify-center bg-gradient-to-r from-blue-600 to-purple-600 text-white py-2.5 rounded-xl hover:shadow-lg hover:shadow-blue-500/25 transition-all font-semibold text-sm"
                    >
                        <Plus size={16} /> New Analysis
                    </motion.button>
                </div>

                {/* Nav */}
                <nav className="p-4 space-y-1">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-2">Menu</p>
                    <SidebarItem icon={<LayoutDashboard size={16} />} label="Dashboard" active={view === 'dashboard'} onClick={() => setView('dashboard')} />
                    {currentFile && (
                        <>
                            <SidebarItem icon={<MessageSquare size={16} />} label="Chat" active={view === 'chat'} onClick={() => setView('chat')} />
                            <SidebarItem icon={<Table size={16} />} label="Dataset Preview" active={view === 'preview'} onClick={() => setView('preview')} />
                        </>
                    )}
                </nav>

                {/* History */}
                <div className="flex-1 flex flex-col overflow-hidden px-4">
                    <div className="flex items-center justify-between mb-2 mt-2">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">History</p>
                        <button onClick={fetchSessions} className="text-gray-400 hover:text-blue-500 transition-colors" title="Refresh history">
                            <RefreshCw size={11} className={loadingHistory ? 'animate-spin' : ''} />
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto space-y-1 pb-2">
                        {sessions.length === 0 ? (
                            <p className="text-xs text-gray-400 italic px-2">No previous sessions</p>
                        ) : (
                            sessions.map((s, i) => (
                                <motion.div
                                    key={s.id}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: i * 0.04 }}
                                    className={`relative group rounded-xl transition-all ${currentFile?.file_id === s.id
                                        ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/40'
                                        : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                                        }`}
                                >
                                    <button
                                        onClick={() => handleSessionClick(s)}
                                        className="w-full text-left px-3 py-2 pr-8"
                                    >
                                        <div className="flex items-center gap-2">
                                            <FileText size={12} className="text-gray-400 shrink-0" />
                                            <span className="text-xs text-gray-700 dark:text-gray-300 font-medium truncate flex-1">
                                                {s.filename}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2 mt-0.5 pl-5">
                                            <Clock size={9} className="text-gray-300" />
                                            <span className="text-[10px] text-gray-400">{formatDate(s.uploaded_at)}</span>
                                            <span className={`text-[10px] font-bold ml-auto ${s.quality_score >= 80 ? 'text-green-500' : s.quality_score >= 50 ? 'text-amber-500' : 'text-red-400'}`}>
                                                {s.quality_score}%
                                            </span>
                                        </div>
                                    </button>
                                    {/* Delete button — appears on hover */}
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(s); }}
                                        title="Delete this session"
                                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-red-500 dark:text-gray-600 dark:hover:text-red-400"
                                    >
                                        <Trash2 size={13} />
                                    </button>
                                </motion.div>
                            ))
                        )}
                    </div>
                </div>

                {/* Current File Badge */}
                {currentFile && (
                    <div className="px-4 py-2">
                        <div className="flex items-center gap-2 bg-blue-50 dark:bg-blue-900/20 rounded-xl px-3 py-2 border border-blue-100 dark:border-blue-800">
                            <Database size={13} className="text-blue-500 shrink-0" />
                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold text-blue-800 dark:text-blue-300 truncate">{currentFile.filename}</p>
                                <p className="text-[10px] text-blue-500">{currentFile.stats?.rows?.toLocaleString()} rows · Score: {currentFile.score}%</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Theme Toggle */}
                <div className="p-4 border-t border-gray-100 dark:border-gray-800">
                    <button
                        onClick={toggleTheme}
                        className="w-full flex items-center justify-between px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-xl transition-colors"
                    >
                        <span className="flex items-center gap-2 font-medium">
                            {theme === 'light' ? <Sun size={15} /> : <Moon size={15} />}
                            {theme === 'light' ? 'Light Mode' : 'Dark Mode'}
                        </span>
                    </button>
                </div>
            </aside>

            {/* ── Delete Confirmation Dialog ─────────────────────────────── */}
            {deleteTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.92 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.92 }}
                        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 p-6 w-full max-w-sm mx-4"
                    >
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                                <Trash2 size={18} className="text-red-500" />
                            </div>
                            <div>
                                <p className="font-bold text-gray-900 dark:text-white text-sm">Delete Session?</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate max-w-[220px]">{deleteTarget.filename}</p>
                            </div>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-5">
                            This will permanently delete the dataset and all its chat history. This action cannot be undone.
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setDeleteTarget(null)}
                                disabled={deleting}
                                className="flex-1 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDeleteConfirm}
                                disabled={deleting}
                                className="flex-1 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold transition-colors shadow-lg shadow-red-500/25 disabled:opacity-60"
                            >
                                {deleting ? 'Deleting…' : 'Delete'}
                            </button>
                        </div>
                    </motion.div>
                </div>
            )
            }
        </>);
};

const SidebarItem = ({ icon, label, active, onClick }) => (
    <button
        onClick={onClick}
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${active
            ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-semibold border border-blue-100 dark:border-blue-900/40'
            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
    >
        {icon}
        <span>{label}</span>
    </button>
);

export default Sidebar;
