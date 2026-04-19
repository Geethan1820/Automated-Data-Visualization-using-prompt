import React from 'react';
import { motion } from 'framer-motion';
import { Lightbulb, Sparkles } from 'lucide-react';

// Icon map based on emoji prefix in insight text
const getInsightStyle = (text, index) => {
    const styles = [
        { border: 'border-indigo-200 dark:border-indigo-800/50', bg: 'bg-indigo-50/60 dark:bg-indigo-900/20', dot: 'bg-indigo-500', glow: 'shadow-indigo-500/20' },
        { border: 'border-emerald-200 dark:border-emerald-800/50', bg: 'bg-emerald-50/60 dark:bg-emerald-900/20', dot: 'bg-emerald-500', glow: 'shadow-emerald-500/20' },
        { border: 'border-amber-200 dark:border-amber-800/50', bg: 'bg-amber-50/60 dark:bg-amber-900/20', dot: 'bg-amber-500', glow: 'shadow-amber-500/20' },
        { border: 'border-rose-200 dark:border-rose-800/50', bg: 'bg-rose-50/60 dark:bg-rose-900/20', dot: 'bg-rose-500', glow: 'shadow-rose-500/20' },
        { border: 'border-teal-200 dark:border-teal-800/50', bg: 'bg-teal-50/60 dark:bg-teal-900/20', dot: 'bg-teal-500', glow: 'shadow-teal-500/20' },
        { border: 'border-violet-200 dark:border-violet-800/50', bg: 'bg-violet-50/60 dark:bg-violet-900/20', dot: 'bg-violet-500', glow: 'shadow-violet-500/20' },
    ];
    return styles[index % styles.length];
};

export const InsightsPanel = ({ insights }) => {
    if (!insights || insights.length === 0) return null;

    return (
        <div className="mt-3 mb-1">
            {/* Header */}
            <div className="flex items-center gap-2 mb-3 px-1">
                <div className="p-1.5 bg-indigo-500/10 rounded-lg">
                    <Sparkles size={13} className="text-indigo-500" />
                </div>
                <p className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-[0.25em]">
                    AI Insights
                </p>
                <div className="flex-1 h-px bg-gradient-to-r from-indigo-200/60 to-transparent dark:from-indigo-800/40" />
                <span className="text-[10px] font-bold text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded-full border border-indigo-100 dark:border-indigo-800/50">
                    {insights.length} findings
                </span>
            </div>

            {/* Insight Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
                {insights.map((insight, i) => {
                    const style = getInsightStyle(insight, i);
                    return (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.06, duration: 0.35 }}
                            whileHover={{ y: -2, scale: 1.01 }}
                            className={`flex items-start gap-3 p-3.5 rounded-2xl border ${style.border} ${style.bg} shadow-sm ${style.glow} transition-all duration-200 cursor-default`}
                        >
                            {/* Colored dot */}
                            <div className={`w-2 h-2 rounded-full ${style.dot} mt-1 shrink-0 shadow-[0_0_6px_currentColor]`} />
                            <p className="text-[12px] font-semibold text-slate-700 dark:text-slate-200 leading-relaxed">
                                {insight}
                            </p>
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
};

// Keep KPICard exported for any other usage
const KPICard = ({ label, value, color = 'blue', delay = 0 }) => {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay, duration: 0.4 }}
            className="bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 rounded-2xl p-4"
        >
            <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">{label}</p>
            <p className="text-xl font-extrabold text-slate-800 dark:text-white">{value}</p>
        </motion.div>
    );
};

export { KPICard };
export default KPICard;
