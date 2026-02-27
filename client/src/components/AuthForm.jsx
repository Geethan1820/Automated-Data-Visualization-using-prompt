import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { LogIn, UserPlus, Loader2, BarChart3, Sparkles, AlertCircle } from 'lucide-react';

const AuthForm = ({ onSuccess }) => {
    const { login, signup, loading } = useAuth();
    const [mode, setMode] = useState('login'); // 'login' | 'signup'
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        const fn = mode === 'login' ? login : signup;
        const result = await fn(username, password);
        if (result.success) {
            onSuccess?.();
        } else {
            setError(result.error);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-950 to-purple-950 relative overflow-hidden">
            {/* Background orbs */}
            <div className="absolute top-0 left-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
            <div className="absolute bottom-0 right-0 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl translate-x-1/2 translate-y-1/2 pointer-events-none" />

            <motion.div
                initial={{ opacity: 0, y: 30, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.5, type: 'spring' }}
                className="w-full max-w-md mx-4"
            >
                {/* Logo */}
                <div className="text-center mb-8">
                    <motion.div
                        whileHover={{ scale: 1.05 }}
                        className="inline-flex items-center gap-3 mb-3"
                    >
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-xl shadow-blue-500/30">
                            <BarChart3 size={24} className="text-white" />
                        </div>
                        <h1 className="text-3xl font-extrabold text-white tracking-tight">GVS DataNova</h1>
                    </motion.div>
                    <p className="text-blue-300/80 text-sm">AI-Powered Conversational Data Analytics</p>
                </div>

                {/* Card */}
                <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl">
                    {/* Tab Switch */}
                    <div className="flex bg-white/5 rounded-xl p-1 mb-6">
                        {['login', 'signup'].map(m => (
                            <button
                                key={m}
                                onClick={() => { setMode(m); setError(''); }}
                                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${mode === m
                                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30'
                                    : 'text-white/50 hover:text-white/80'
                                    }`}
                            >
                                {m === 'login' ? '🔑 Sign In' : '✨ Sign Up'}
                            </button>
                        ))}
                    </div>

                    <AnimatePresence mode="wait">
                        <motion.form
                            key={mode}
                            initial={{ opacity: 0, x: mode === 'login' ? -20 : 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            onSubmit={handleSubmit}
                            className="space-y-4"
                        >
                            <div>
                                <label className="text-xs font-semibold text-white/60 uppercase tracking-wider block mb-1.5">
                                    Username
                                </label>
                                <input
                                    type="text"
                                    value={username}
                                    onChange={e => setUsername(e.target.value)}
                                    placeholder="Enter username"
                                    required
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-white/60 uppercase tracking-wider block mb-1.5">
                                    Password
                                </label>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    placeholder={mode === 'signup' ? 'Min. 6 characters' : 'Enter password'}
                                    required
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                                />
                            </div>

                            {error && (
                                <motion.div
                                    initial={{ opacity: 0, y: -6 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2"
                                >
                                    <AlertCircle size={14} />
                                    {error}
                                </motion.div>
                            )}

                            <motion.button
                                type="submit"
                                disabled={loading || !username || !password}
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                            >
                                {loading ? (
                                    <Loader2 size={18} className="animate-spin" />
                                ) : mode === 'login' ? (
                                    <><LogIn size={18} /> Sign In</>
                                ) : (
                                    <><UserPlus size={18} /> Create Account</>
                                )}
                            </motion.button>
                        </motion.form>
                    </AnimatePresence>

                    {/* Guest note */}
                    <p className="text-center text-white/30 text-xs mt-5">
                        <Sparkles className="inline w-3 h-3 mr-1" />
                        AI-powered insights · Persistent history · ML predictions
                    </p>
                </div>
            </motion.div>
        </div>
    );
};

export default AuthForm;
