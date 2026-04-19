import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { LogIn, UserPlus, Loader2, BarChart3, Sparkles, AlertCircle, Cpu, Zap, ShieldCheck } from 'lucide-react';

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
        <div className="min-h-screen flex items-center justify-center bg-[#020617] relative overflow-hidden font-jakarta">
            {/* Cinematic Background */}
            <div className="glow-background">
                <div className="glow-orb w-[600px] h-[600px] bg-emerald-500/10 -top-20 -left-20 animate-pulse" />
                <div className="glow-orb w-[500px] h-[500px] bg-cyan-500/10 bottom-0 right-0 animate-pulse" style={{ animationDelay: '1s' }} />
                <div className="glow-orb w-[400px] h-[400px] bg-indigo-500/10 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
            </div>

            {/* Grid Pattern */}
            <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none" />
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]" />

            <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="w-full max-w-lg mx-4 z-10"
            >
                {/* Header Section */}
                <div className="text-center mb-10">
                    <motion.div
                        whileHover={{ scale: 1.05 }}
                        className="inline-flex items-center gap-4 mb-4"
                    >
                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center shadow-[0_0_30px_rgba(16,185,129,0.4)] animate-float">
                            <BarChart3 size={28} className="text-slate-950" />
                        </div>
                        <div className="text-left">
                            <h1 className="text-4xl font-black text-white tracking-tight leading-none italic">
                                DATA<span className="text-emerald-400">NOVA</span>
                            </h1>
                            <p className="text-emerald-500/60 text-xs font-bold uppercase tracking-[0.2em] mt-1">GVS Engineering v2.0</p>
                        </div>
                    </motion.div>
                </div>

                {/* Main Auth Card */}
                <div className="glass-panel rounded-[2.5rem] p-1 shadow-2xl overflow-hidden">
                    <div className="bg-slate-950/40 rounded-[2.4rem] p-8 sm:p-10">
                        {/* Custom Tab Switcher */}
                        <div className="flex bg-slate-900/50 rounded-2xl p-1.5 mb-8 border border-white/5">
                            {['login', 'signup'].map(m => (
                                <button
                                    key={m}
                                    onClick={() => { setMode(m); setError(''); }}
                                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all duration-300 ${mode === m
                                        ? 'bg-emerald-500 text-slate-950 shadow-[0_0_20px_rgba(16,185,129,0.3)]'
                                        : 'text-slate-400 hover:text-white hover:bg-white/5'
                                        }`}
                                >
                                    {m === 'login' ? <LogIn size={16} /> : <UserPlus size={16} />}
                                    {m === 'login' ? 'Sign In' : 'Join Now'}
                                </button>
                            ))}
                        </div>

                        <AnimatePresence mode="wait">
                            <motion.form
                                key={mode}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                transition={{ duration: 0.3 }}
                                onSubmit={handleSubmit}
                                className="space-y-6"
                            >
                                <div className="space-y-5">
                                    <div className="group">
                                        <label className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.2em] block mb-2 px-1">
                                            Admin Username
                                        </label>
                                        <div className="relative">
                                            <input
                                                type="text"
                                                value={username}
                                                onChange={e => setUsername(e.target.value)}
                                                placeholder="e.g. dataguy_99"
                                                required
                                                className="w-full bg-slate-900/50 border border-white/5 rounded-2xl px-5 py-4 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/40 transition-all duration-300"
                                            />
                                            <Zap size={16} className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-700 group-focus-within:text-emerald-500 transition-colors" />
                                        </div>
                                    </div>

                                    <div className="group">
                                        <label className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.2em] block mb-2 px-1">
                                            Security Key
                                        </label>
                                        <div className="relative">
                                            <input
                                                type="password"
                                                value={password}
                                                onChange={e => setPassword(e.target.value)}
                                                placeholder={mode === 'signup' ? 'Min. 6 characters' : '••••••••'}
                                                required
                                                className="w-full bg-slate-900/50 border border-white/5 rounded-2xl px-5 py-4 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/40 transition-all duration-300"
                                            />
                                            <ShieldCheck size={16} className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-700 group-focus-within:text-emerald-500 transition-colors" />
                                        </div>
                                    </div>
                                </div>

                                {error && (
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        className="flex items-center gap-3 text-red-400 text-xs font-bold bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-3"
                                    >
                                        <AlertCircle size={14} className="shrink-0" />
                                        {error}
                                    </motion.div>
                                )}

                                <motion.button
                                    type="submit"
                                    disabled={loading || !username || !password}
                                    whileHover={{ scale: 1.01 }}
                                    whileTap={{ scale: 0.99 }}
                                    className="btn-primary w-full py-4 text-sm tracking-wider uppercase"
                                >
                                    {loading ? (
                                        <Loader2 size={20} className="animate-spin mx-auto" />
                                    ) : (
                                        <span className="flex items-center justify-center gap-2">
                                            {mode === 'login' ? 'Access Workspace' : 'Initialize Account'}
                                        </span>
                                    )}
                                </motion.button>
                            </motion.form>
                        </AnimatePresence>

                        {/* Feature Badges */}
                        <div className="mt-8 pt-8 border-t border-white/5 flex flex-wrap justify-center gap-4 opacity-40">
                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
                                <Cpu size={12} /> PG SQL
                            </div>
                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
                                <Sparkles size={12} /> AI ENGINE
                            </div>
                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
                                <ShieldCheck size={12} /> SECURE
                            </div>
                        </div>
                    </div>
                </div>

                <p className="text-center text-slate-500 text-[10px] mt-8 font-medium tracking-[0.1em]">
                    DESIGNED BY GVS ENGINEERING · POWERED BY GEN-AI
                </p>
            </motion.div>
        </div>
    );
};

export default AuthForm;
