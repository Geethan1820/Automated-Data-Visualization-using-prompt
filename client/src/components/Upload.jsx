import React, { useState } from 'react';
import axios from 'axios';
import API from '../config';
import { Upload as UploadIcon, FileText, Loader2, Sparkles, ShieldCheck } from 'lucide-react';
import { motion } from 'framer-motion';

const Upload = ({ onUploadSuccess }) => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleFileChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        setLoading(true);
        setError(null);

        try {
            const res = await axios.post(`${API}/upload`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            onUploadSuccess(res.data);
        } catch (err) {
            setError("Analysis initialization failed. Please try a different dataset.");
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-[500px] h-full relative overflow-hidden bg-[var(--bg-app)]">
            <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                className="w-full max-w-xl px-6"
            >
                <div className="glass-panel rounded-[3rem] p-12 text-center relative overflow-hidden border-[var(--border-main)] bg-[var(--bg-card)]">
                    <div className="glow-orb w-64 h-64 bg-emerald-500/10 -top-20 -right-20" />
                    
                    <motion.div
                        whileHover={{ scale: 1.05, rotate: 2 }}
                        className="w-24 h-24 rounded-3xl bg-gradient-to-br from-emerald-400 to-teal-500 text-slate-950 flex items-center justify-center mx-auto mb-8 shadow-[0_0_30px_rgba(16,185,129,0.3)] relative z-10"
                    >
                        <UploadIcon size={36} />
                    </motion.div>

                    <div className="space-y-4 mb-10 relative z-10">
                        <h2 className="text-4xl font-black tracking-tighter text-[var(--text-main)] italic uppercase">
                            LOAD <span className="text-emerald-400">INTELLIGENCE</span>
                        </h2>
                        <p className="text-[var(--text-muted)] text-sm font-medium leading-relaxed max-w-xs mx-auto">
                            Import your raw dataset to start the automated visualization and audit process.
                        </p>
                    </div>

                    <label className="block w-full cursor-pointer relative z-10 group">
                        <input type="file" className="hidden" onChange={handleFileChange} accept=".csv, .xlsx, .xls" />
                        <motion.div
                            whileHover={{ scale: 1.02, y: -2 }}
                            whileTap={{ scale: 0.98 }}
                            className="w-full btn-primary py-5 text-[10px] tracking-[0.3em] font-black uppercase flex items-center justify-center gap-4"
                        >
                            {loading ? <Loader2 className="animate-spin" size={18} /> : <FileText size={18} />}
                            {loading ? "UPLOADING DATASET..." : "UPLOAD DATASET"}
                        </motion.div>
                    </label>

                    <div className="mt-10 flex items-center justify-center gap-8 border-t border-[var(--border-main)] pt-8 relative z-10">
                        <div className="flex items-center gap-2 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">
                            <ShieldCheck size={14} className="text-emerald-500/50" />
                            Secure Audit
                        </div>
                        <div className="flex items-center gap-2 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">
                            <Sparkles size={14} className="text-emerald-500/50" />
                            AI Ready
                        </div>
                    </div>

                    {error && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="mt-6 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-[11px] font-bold uppercase tracking-wider"
                        >
                            {error}
                        </motion.div>
                    )}
                </div>
            </motion.div>
        </div>
    );
};

export default Upload;
