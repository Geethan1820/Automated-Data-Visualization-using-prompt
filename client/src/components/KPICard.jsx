import React from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

const formatValue = (val) => {
    if (val === null || val === undefined) return '—';
    const num = Number(val);
    if (isNaN(num)) return val;
    if (Math.abs(num) >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
    if (Math.abs(num) >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
    return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
};

const KPICard = ({ label, value, icon: Icon, color = 'blue', trend = null, delay = 0 }) => {
    const colorConfig = {
        blue: { bg: 'from-blue-500 to-blue-600', light: 'bg-blue-50 dark:bg-blue-900/20', text: 'text-blue-600 dark:text-blue-400', badge: 'bg-blue-100 dark:bg-blue-900/40' },
        purple: { bg: 'from-purple-500 to-purple-600', light: 'bg-purple-50 dark:bg-purple-900/20', text: 'text-purple-600 dark:text-purple-400', badge: 'bg-purple-100 dark:bg-purple-900/40' },
        green: { bg: 'from-green-500 to-emerald-500', light: 'bg-green-50 dark:bg-green-900/20', text: 'text-green-600 dark:text-green-400', badge: 'bg-green-100 dark:bg-green-900/40' },
        amber: { bg: 'from-amber-500 to-orange-500', light: 'bg-amber-50 dark:bg-amber-900/20', text: 'text-amber-600 dark:text-amber-400', badge: 'bg-amber-100 dark:bg-amber-900/40' },
        red: { bg: 'from-red-500 to-rose-500', light: 'bg-red-50 dark:bg-red-900/20', text: 'text-red-600 dark:text-red-400', badge: 'bg-red-100 dark:bg-red-900/40' },
    };
    const c = colorConfig[color] || colorConfig.blue;

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay, duration: 0.4 }}
            whileHover={{ y: -4, scale: 1.02 }}
            className={`${c.light} border border-${color}-100/50 dark:border-${color}-900/30 rounded-2xl p-4 relative overflow-hidden group cursor-default transition-all duration-200`}
        >
            {/* Background gradient accent */}
            <div className={`absolute -top-4 -right-4 w-20 h-20 bg-gradient-to-br ${c.bg} opacity-10 rounded-full group-hover:opacity-20 transition-opacity`} />

            <div className="flex items-start justify-between mb-3">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{label}</p>
                {Icon && (
                    <div className={`${c.badge} p-1.5 rounded-lg`}>
                        <Icon size={14} className={c.text} />
                    </div>
                )}
            </div>

            <p className={`text-2xl font-extrabold ${c.text} leading-none`}>
                {formatValue(value)}
            </p>

            {trend !== null && (
                <div className="flex items-center gap-1 mt-2">
                    {trend > 0 ? (
                        <TrendingUp size={12} className="text-green-500" />
                    ) : trend < 0 ? (
                        <TrendingDown size={12} className="text-red-500" />
                    ) : (
                        <Minus size={12} className="text-gray-400" />
                    )}
                    <span className={`text-xs font-semibold ${trend > 0 ? 'text-green-600' : trend < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                        {trend > 0 ? '+' : ''}{trend?.toFixed(1)}%
                    </span>
                </div>
            )}
        </motion.div>
    );
};

export const KPIRow = ({ kpis }) => {
    if (!kpis || !kpis.column) return null;

    const cards = [
        { label: 'Total', value: kpis.total, color: 'blue', icon: null },
        { label: 'Average', value: kpis.average, color: 'purple', icon: null },
        { label: 'Maximum', value: kpis.max, color: 'green', icon: null },
        { label: 'Minimum', value: kpis.min, color: 'amber', icon: null },
        { label: 'Records', value: kpis.count, color: 'red', icon: null },
    ];

    return (
        <div className="mt-3">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">
                📊 KPIs — {kpis.column}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                {cards.map((card, i) => (
                    <KPICard key={card.label} {...card} delay={i * 0.07} />
                ))}
            </div>
        </div>
    );
};

export default KPICard;
