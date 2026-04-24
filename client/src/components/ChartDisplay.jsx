import React, { useRef, useState, useMemo } from 'react';
import axios from 'axios';
import API from '../config';
import {
    BarChart, Bar, LineChart, Line, AreaChart, Area,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend,
    ScatterChart, Scatter, PieChart, Pie, Cell,
    ResponsiveContainer, Brush, LabelList,
} from 'recharts';
import { 
    Download, ZoomIn, ZoomOut, BarChart2, Info, Settings, 
    X, Palette, Layout, Maximize2, Check, Eye, Type, AlignLeft, RefreshCcw, Database,
    TrendingUp, PieChart as PieIcon, ScanSearch, AreaChart as AreaIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import html2canvas from 'html2canvas';

// ─── PREMIUM DESIGN TOKENS ──────────────────────────────────────────────────
const PALETTES = {
    emerald: ['#10b981', '#06b6d4', '#4ade80', '#22d3ee', '#34d399', '#0891b2'],
    midnight: ['#6366f1', '#8b5cf6', '#d946ef', '#ec4899', '#f43f5e', '#f97316'],
    ocean: ['#0ea5e9', '#0891b2', '#0d9488', '#059669', '#2dd4bf', '#7dd3fc'],
    sunset: ['#f43f5e', '#fb7185', '#fb923c', '#fbbf24', '#f59e0b', '#ea580c'],
    slate: ['#94a3b8', '#64748b', '#475569', '#334155', '#1e293b', '#0f172a'],
};

const CHART_TYPES = [
    { id: 'bar', label: 'Bar', icon: BarChart2 },
    { id: 'line', label: 'Line', icon: TrendingUp },
    { id: 'area', label: 'Area', icon: AreaIcon },
    { id: 'pie', label: 'Pie', icon: PieIcon },
    { id: 'donut', label: 'Donut', icon: PieIcon },
    { id: 'scatter', label: 'Scatter', icon: ScanSearch },
];

const AGG_TYPES = [
    { id: 'sum', label: 'Sum' },
    { id: 'avg', label: 'Avg' },
    { id: 'count', label: 'Count' },
    { id: 'min', label: 'Min' },
    { id: 'max', label: 'Max' },
];

const CUSTOM_TOOLTIP_STYLE = {
    backgroundColor: 'rgba(2, 6, 23, 0.85)',
    border: '1px solid rgba(16, 185, 129, 0.2)',
    borderRadius: '16px',
    padding: '16px',
    boxShadow: '0 20px 40px -5px rgba(0, 0, 0, 0.5)',
    backdropFilter: 'blur(16px)',
};

// ─── COMPONENTS ─────────────────────────────────────────────────────────────

const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
        return (
            <div style={CUSTOM_TOOLTIP_STYLE} className="text-white">
                <p className="text-[10px] font-bold text-slate-400 mb-2 uppercase tracking-tighter">{label}</p>
                <div className="space-y-1.5">
                    {payload.map((entry, idx) => (
                        <div key={idx} className="flex items-center justify-between gap-6">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color || entry.fill }} />
                                <span className="text-[11px] font-medium text-slate-200">{entry.name}:</span>
                            </div>
                            <span className="text-[11px] font-mono font-bold text-white">
                                {entry.value?.toLocaleString?.() ?? entry.value}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        );
    }
    return null;
};

const sanitize = (data) => {
    if (!Array.isArray(data)) return [];
    return data.map(row => {
        const clean = {};
        Object.entries(row).forEach(([k, v]) => {
            if (v === null || v === undefined) { clean[k] = null; return; }
            if (typeof v === 'string') {
                const stripped = v.replace(/[€$£,% ]/g, '');
                if (stripped !== '' && !isNaN(stripped) && !/^\d+[a-zA-Z]/.test(stripped)) {
                    clean[k] = parseFloat(stripped);
                    return;
                }
            }
            clean[k] = (typeof v === 'number' && !isNaN(v)) ? v : v;
        });
        return clean;
    }).filter(r => Object.values(r).some(v => v !== null));
};

const ChartErrorBoundary = ({ children }) => {
    const [hasError, setHasError] = React.useState(false);
    React.useEffect(() => { setHasError(false); }, [children]);
    if (hasError) {
        return (
            <div className="flex flex-col items-center justify-center p-12 bg-slate-50 dark:bg-slate-900/40 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-800">
                <BarChart2 className="text-slate-300 dark:text-slate-700 mb-4 animate-pulse" size={48} />
                <p className="text-sm text-slate-500 font-semibold">Intelligence Fallback Active</p>
                <p className="text-[11px] text-slate-400 mt-1">Unable to render this specific visualization with the current data structure.</p>
            </div>
        );
    }
    try {
        return children;
    } catch (e) {
        setHasError(true);
        return null;
    }
};

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

const ChartDisplay = ({
    fileId, chartType: initialType, data: initialData, xKey, yKey, insights = [], reasoning = '',
    customColor, mlResult, compact = false,
}) => {
    const chartRef = useRef(null);
    const [limit, setLimit] = useState(30);
    const [showInsights, setShowInsights] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [activeTab, setActiveTab] = useState('Visual'); 

    // ── Data & Aggregation State ──
    const [currentData, setCurrentData] = useState(initialData || []);
    const [currentAgg, setCurrentAgg] = useState('sum');
    const [isRecomputing, setIsRecomputing] = useState(false);

    // ── Settings State (Overrides) ──
    const [chartType, setChartType] = useState(initialType);
    const [paletteKey, setPaletteKey] = useState('emerald');
    const [chartHeight, setChartHeight] = useState(compact ? 220 : 380);
    const [isStacked, setIsStacked] = useState(false);
    const [showGrid, setShowGrid] = useState(true);
    const [showLabels, setShowLabels] = useState(false);
    const [legendPos, setLegendPos] = useState('bottom');
    const [showXTitle, setShowXTitle] = useState(true);
    const [showYTitle, setShowYTitle] = useState(true);

    // Sync local state when external props change (Fixes "Apply Changes" sync bug)
    React.useEffect(() => {
        if (initialData) setCurrentData(initialData);
        if (initialType) setChartType(initialType);
    }, [initialData, initialType]);

    const activePalette = PALETTES[paletteKey];
    
    // Synergize cleanData and limitedData with the live currentData
    const cleanData = useMemo(() => sanitize(currentData || []), [currentData]);
    const limitedData = useMemo(() => cleanData.slice(0, limit), [cleanData, limit]);

    // Enhanced Multi-Series Discovery
    const resolvedXKey = xKey || (cleanData[0] && Object.keys(cleanData[0])[0]);
    const yKeys = useMemo(() => {
        if (!cleanData[0]) return [];
        const numericKeys = Object.keys(cleanData[0]).filter(k => 
            k !== resolvedXKey && (typeof cleanData[0][k] === 'number' || (!isNaN(parseFloat(cleanData[0][k]))))
        );
        return numericKeys.length > 0 ? numericKeys.slice(0, 4) : [];
    }, [cleanData, resolvedXKey]);

    const handleAggChange = async (newAgg) => {
        if (newAgg === currentAgg || isRecomputing) return;
        setIsRecomputing(true);
        try {
            const res = await axios.post(`${API}/chart/recompute`, {
                file_id: fileId,
                x_col: resolvedXKey,
                y_cols: yKeys,
                aggregation: newAgg,
                chart_type: chartType
            });
            if (res.data.success) {
                setCurrentData(res.data.chart_data);
                setCurrentAgg(newAgg);
            }
        } catch (e) {
            console.error('Recompute failed:', e);
        } finally {
            setIsRecomputing(false);
        }
    };

    const downloadChart = async () => {
        if (!chartRef.current) return;

        const element = chartRef.current;
        const { scrollWidth, scrollHeight } = element;

        const canvas = await html2canvas(element, {
            backgroundColor: '#ffffff',
            scale: 2,                        // 2× for crisp, high-res output
            useCORS: true,
            allowTaint: true,
            width: scrollWidth,
            height: scrollHeight,
            windowWidth: scrollWidth,
            windowHeight: scrollHeight,
            scrollX: 0,
            scrollY: 0,
            x: 0,
            y: 0,
            logging: false,
        });

        const link = document.createElement('a');
        link.download = `datanova_viz_${Date.now()}.png`;
        link.href = canvas.toDataURL('image/png', 1.0);
        link.click();
    };

    const commonProps = { margin: { top: 30, right: 30, left: 20, bottom: 30 } };
    const axisProps = {
        tick: { fontSize: compact ? 9 : 11, fill: '#64748b', fontWeight: 600 },
        tickLine: false,
        axisLine: { stroke: 'rgba(255,255,255,0.05)', strokeWidth: 1 },
    };
    const gridProps = { 
        vertical: false, 
        strokeDasharray: '8 8', 
        stroke: 'rgba(255,255,255,0.05)', 
        strokeOpacity: showGrid ? 0.3 : 0 
    };

    const renderChartCore = () => {
        if (!yKeys.length && chartType !== 'histogram') return null;

        switch (chartType) {
            case 'bar':
                return (
                    <BarChart data={limitedData} {...commonProps}>
                        <CartesianGrid {...gridProps} />
                        <XAxis dataKey={resolvedXKey} {...axisProps} />
                        <YAxis {...axisProps} />
                        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(226, 232, 240, 0.4)' }} />
                        <Legend verticalAlign={legendPos === 'top' ? 'top' : 'bottom'} wrapperStyle={{ paddingTop: 20, fontSize: 11 }} />
                        {yKeys.map((k, i) => (
                            <Bar 
                                key={k} dataKey={k} name={k} 
                                stackId={isStacked ? 'a' : undefined}
                                fill={activePalette[i % activePalette.length]} 
                                radius={isStacked ? [0, 0, 0, 0] : [6, 6, 0, 0]}
                                animationDuration={800}
                                barSize={yKeys.length > 1 && !isStacked ? undefined : 40}
                            >
                                {showLabels && <LabelList position="top" fontSize={10} />}
                            </Bar>
                        ))}
                    </BarChart>
                );

            case 'line':
                return (
                    <LineChart data={limitedData} {...commonProps}>
                        <CartesianGrid {...gridProps} />
                        <XAxis dataKey={resolvedXKey} {...axisProps} />
                        <YAxis {...axisProps} />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend verticalAlign={legendPos === 'top' ? 'top' : 'bottom'} wrapperStyle={{ paddingTop: 20, fontSize: 11 }} />
                        {yKeys.map((k, i) => (
                            <Line 
                                key={k} type="monotone" dataKey={k} name={k} 
                                stroke={activePalette[i % activePalette.length]} 
                                strokeWidth={3} dot={{ r: 4, strokeWidth: 2, fill: '#fff' }}
                                animationDuration={800}
                            />
                        ))}
                    </LineChart>
                );

            case 'area':
                return (
                    <AreaChart data={limitedData} {...commonProps}>
                        <CartesianGrid {...gridProps} />
                        <XAxis dataKey={resolvedXKey} {...axisProps} />
                        <YAxis {...axisProps} />
                        <Tooltip content={<CustomTooltip />} />
                        <Area dataKey={yKeys[0]} fill={activePalette[0]} stroke={activePalette[0]} fillOpacity={0.3} />
                    </AreaChart>
                );

            case 'pie':
            case 'donut':
                return (
                    <PieChart>
                        <Pie
                            data={limitedData} dataKey={yKeys[0]} nameKey={resolvedXKey}
                            cx="50%" cy="50%" outerRadius={compact ? 80 : chartHeight * 0.35}
                            innerRadius={chartType === 'donut' ? (compact ? 50 : chartHeight * 0.22) : 0}
                            paddingAngle={5} animationDuration={1000} stroke="none"
                        >
                            {limitedData.map((_, i) => <Cell key={i} fill={activePalette[i % activePalette.length]} />)}
                        </Pie>
                        <Tooltip content={<CustomTooltip />} />
                        <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: 10 }} />
                    </PieChart>
                );

            default: return <p className="text-sm text-slate-400">Visualization rendering...</p>;
        }
    };

    if (!cleanData.length) return null;

    if (compact) {
        return (
            <div className="overflow-hidden rounded-[1.35rem] border border-slate-200/80 bg-[linear-gradient(180deg,_rgba(248,250,252,0.95),_rgba(255,255,255,1))] dark:border-slate-800 dark:bg-[linear-gradient(180deg,_rgba(15,23,42,0.92),_rgba(2,6,23,0.98))]">
                <div className="flex items-center justify-between border-b border-slate-200/70 px-4 py-3 dark:border-slate-800">
                    <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Visualization</p>
                        <p className="mt-1 text-sm font-bold text-slate-900 dark:text-white">
                            {resolvedXKey} vs {yKeys[0] || yKey || 'value'}
                        </p>
                    </div>
                    <button
                        onClick={downloadChart}
                        className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 transition hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                        title="Export PNG"
                    >
                        <Download size={14} />
                    </button>
                </div>

                <div ref={chartRef} className="px-3 pb-3 pt-4">
                    <ResponsiveContainer width="100%" height={230}>
                        <ChartErrorBoundary>{renderChartCore()}</ChartErrorBoundary>
                    </ResponsiveContainer>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full bg-white dark:bg-slate-950 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 overflow-hidden shadow-2xl relative group">
            
            {/* ── SETTINGS SIDEBAR (PowerBI Style) ── */}
            <AnimatePresence>
                {showSettings && (
                    <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} className="absolute right-0 top-0 bottom-0 w-80 bg-white/98 dark:bg-slate-950/98 backdrop-blur-xl z-50 border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col">
                        <div className="p-6 border-b border-white/5 flex items-center justify-between">
                            <h3 className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.2em] flex items-center gap-2"><Settings size={14} />Format Visual</h3>
                            <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-white/5 rounded-xl transition-colors"><X size={16} /></button>
                        </div>
                        <div className="flex px-4 pt-1 bg-slate-50 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800">
                            {['Visual', 'General'].map(tab => (
                                <button key={tab} onClick={() => setActiveTab(tab)} className={`px-4 py-3 text-[10px] font-black uppercase tracking-wider border-b-2 transition-all ${activeTab === tab ? 'border-indigo-500 text-indigo-500' : 'border-transparent text-slate-400'}`}>{tab}</button>
                            ))}
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 space-y-8">
                            {activeTab === 'Visual' ? (
                                <>
                                    {/* Data Fields (PowerBI Style) */}
                                    <div>
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 block flex items-center gap-2"><Database size={10} />Data Aggregation</label>
                                        <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-50 dark:bg-slate-800 rounded-xl">
                                            {AGG_TYPES.map((agg) => (
                                                <button
                                                    key={agg.id}
                                                    onClick={() => handleAggChange(agg.id)}
                                                    className={`py-2 text-[9px] font-black rounded-lg transition-all ${currentAgg === agg.id ? 'bg-indigo-500 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-100'}`}
                                                >
                                                    {agg.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Visual Symbols */}
                                    <div>
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 block">Visual Type</label>
                                        <div className="grid grid-cols-3 gap-2">
                                            {CHART_TYPES.map((type) => (
                                                <button key={type.id} onClick={() => setChartType(type.id)} className={`flex flex-col items-center justify-center p-2.5 rounded-xl border transition-all ${chartType === type.id ? 'bg-indigo-500 border-indigo-500 text-white' : 'border-slate-100 dark:border-slate-800 text-slate-400'}`}>
                                                    <type.icon size={14} /><span className="text-[8px] font-bold mt-1 uppercase">{type.label}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Series Colors */}
                                    <div>
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 block flex items-center gap-2"><Palette size={10} />Series Colors</label>
                                        <div className="space-y-2">
                                            {Object.entries(PALETTES).map(([key, colors]) => (
                                                <button key={key} onClick={() => setPaletteKey(key)} className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${paletteKey === key ? 'border-indigo-500 bg-indigo-50/5' : 'border-slate-100 dark:border-slate-800'}`}>
                                                    <div className="flex gap-1">{colors.slice(0, 5).map((c, i) => (<div key={i} className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: c }} />))}</div>
                                                    <Check size={10} className={paletteKey === key ? 'text-indigo-500' : 'opacity-0'} />
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div className="space-y-6">
                                    <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl space-y-3">
                                        <div className="flex justify-between items-center"><span className="text-[10px] font-black uppercase text-slate-400">Canvas Height</span><span className="text-xs font-bold text-indigo-500">{chartHeight}px</span></div>
                                        <input type="range" min="250" max="700" step="50" value={chartHeight} onChange={(e) => setChartHeight(parseInt(e.target.value))} className="w-full h-1 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500" />
                                    </div>
                                    {[{label:'Data Labels', state:showLabels, set:setShowLabels, icon:Eye}, {label:'Grid Lines', state:showGrid, set:setShowGrid, icon:AlignLeft}].map((opt, i) => (
                                        <div key={i} className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800 rounded-xl">
                                            <div className="flex items-center gap-3"><div className="p-2 bg-white dark:bg-slate-700 rounded-lg shadow-sm"><opt.icon size={12} className="text-indigo-500" /></div><span className="text-[11px] font-bold">{opt.label}</span></div>
                                            <button onClick={() => opt.set(!opt.state)} className={`w-9 h-5 rounded-full relative transition-colors ${opt.state ? 'bg-indigo-500' : 'bg-slate-300'}`}><div className={`w-3.5 h-3.5 bg-white rounded-full absolute top-0.5 transition-all ${opt.state ? 'right-0.5' : 'left-0.5'}`} /></button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Header ── */}
            <div className="px-10 py-10 border-b border-slate-100 dark:border-slate-800/40 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="p-4 bg-indigo-500/10 dark:bg-indigo-500/20 rounded-3xl"><BarChart2 size={28} className="text-indigo-600 dark:text-indigo-400" /></div>
                    <div>
                        <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight leading-none mb-2">{chartType} Visualization</h3>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-2">Intelligence Applied · <span className="text-indigo-500 font-black px-2 py-0.5 bg-indigo-50 dark:bg-indigo-900/40 rounded-lg border border-indigo-100 dark:border-indigo-800/50">Agg: {currentAgg}</span></p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {isRecomputing && <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }} className="text-indigo-500"><RefreshCcw size={16} /></motion.div>}
                    <button 
                        onClick={() => setShowSettings(true)} 
                        className="flex items-center gap-2 px-5 py-3 bg-white dark:bg-slate-900 shadow-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:border-indigo-500 hover:text-indigo-600 rounded-2xl transition-all font-black text-[11px] uppercase tracking-widest"
                    >
                        <Settings size={16} className="text-indigo-500" />
                        Format Visual
                    </button>
                    <button 
                        onClick={downloadChart} 
                        className="p-3 bg-white dark:bg-slate-900 shadow-xl border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-indigo-500 rounded-2xl transition-all"
                        title="Export PNG"
                    >
                        <Download size={18} />
                    </button>
                </div>
            </div>

            {/* ── Body ── */}
            <div ref={chartRef} className="p-10 relative">
                <AnimatePresence mode="wait">
                    {showInsights ? (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="overflow-auto pr-4" style={{ height: chartHeight }}>
                            <div className="space-y-6">
                                <div className="p-8 bg-indigo-50/50 dark:bg-indigo-500/5 rounded-[2.5rem] border border-indigo-100/30 dark:border-indigo-500/10">
                                    <h4 className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.4em] mb-4">AI Interpretation</h4>
                                    <p className="text-sm text-slate-700 dark:text-slate-300 italic font-medium">"{reasoning}"</p>
                                </div>
                                <div className="space-y-4">
                                    {insights.map((ins, i) => (
                                        <div key={i} className="flex gap-4 p-5 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-100/50 dark:border-slate-800/10">
                                            <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5 shrink-0 shadow-[0_0_8px_rgba(99,102,241,1)]" />
                                            <p className="text-xs text-slate-800 dark:text-slate-100 font-bold leading-relaxed">{ins}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </motion.div>
                    ) : (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="relative">
                            <ResponsiveContainer width="100%" height={chartHeight}>
                                <ChartErrorBoundary>{renderChartCore()}</ChartErrorBoundary>
                            </ResponsiveContainer>
                            <div className="mt-8 flex items-center justify-between">
                                <button onClick={() => setShowInsights(true)} className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-indigo-500/20 active:scale-95 transition-all"><Info size={14} /> View AI Report</button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};

export default ChartDisplay;
