import React from 'react';
import { LayoutDashboard, MessageSquare, Settings, Database, Plus, Table, Moon, Sun } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

const Sidebar = ({ setView, currentFile, onNewChat, history = [], view }) => {
    const { theme, toggleTheme } = useTheme();
    return (
        <aside className="w-64 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col h-full transition-colors">
            <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                    DataSight
                </h1>
            </div>

            <div className="p-4 pb-0">
                <button
                    onClick={onNewChat}
                    className="w-full flex items-center gap-2 justify-center bg-primary text-white py-3 rounded-xl hover:bg-blue-600 transition-shadow shadow-sm font-medium"
                >
                    <Plus size={20} />
                    New Chat
                </button>
            </div>

            <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 mt-4 px-2">Menu</div>
                <SidebarItem
                    icon={<LayoutDashboard size={20} />}
                    label="Dashboard"
                    active={view === 'dashboard'}
                    onClick={() => setView('dashboard')}
                />

                {currentFile && (
                    <SidebarItem
                        icon={<Table size={20} />}
                        label="View Dataset"
                        active={view === 'preview'}
                        onClick={() => setView('preview')}
                    />
                )}

                <SidebarItem icon={<Settings size={20} />} label="Settings" />

                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 mt-8 px-2">History</div>
                {history.length === 0 ? (
                    <div className="text-sm text-gray-400 px-4 italic">No history yet</div>
                ) : (
                    history.map((h, i) => (
                        <button key={i} className="w-full text-left px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg truncate">
                            {h.title || `Conversation ${i + 1}`}
                        </button>
                    ))
                )}
            </nav>

            {currentFile && (
                <div className="p-4 m-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800">
                    <div className="flex items-center gap-3 mb-2">
                        <Database size={16} className="text-blue-600 dark:text-blue-400" />
                        <span className="text-sm font-semibold text-blue-800 dark:text-blue-300 truncate block w-40">{currentFile.filename}</span>
                    </div>
                    <div className="text-xs text-blue-600 dark:text-blue-400">
                        Score: <span className="font-bold">{currentFile.score}/100</span>
                    </div>
                </div>
            )}

            {/* Theme Toggle */}
            <div className="p-4 border-t border-gray-100 dark:border-gray-800">
                <button
                    onClick={toggleTheme}
                    className="w-full flex items-center justify-between px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors"
                >
                    <span className="flex items-center gap-2">
                        {theme === 'light' ? <Sun size={18} /> : <Moon size={18} />}
                        {theme === 'light' ? 'Light Mode' : 'Dark Mode'}
                    </span>
                </button>
            </div>
        </aside>
    );
};

const SidebarItem = ({ icon, label, active, onClick }) => (
    <button
        onClick={onClick}
        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${active ? 'bg-blue-50 text-blue-600 font-medium' : 'text-gray-600 hover:bg-gray-50'
            }`}
    >
        {icon}
        <span>{label}</span>
    </button>
);

export default Sidebar;
