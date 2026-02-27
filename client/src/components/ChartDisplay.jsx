import React, { useRef, useState } from 'react';
import {
    BarChart, Bar, LineChart, Line, AreaChart, Area,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend,
    ScatterChart, Scatter, PieChart, Pie, Cell,
    RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
    ResponsiveContainer, ReferenceLine, Brush,
} from 'recharts';
import { Download, ZoomIn, ZoomOut, BarChart2 } from 'lucide-react';
import { motion } from 'framer-motion';
import html2canvas from 'html2canvas';

// ─── COLORS ──────────────────────────────────────────────────────────────────
const PALETTE = [
    '#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b',
    '#ef4444', '#f97316', '#84cc16', '#14b8a6', '#ec4899',
];

const COLOR_MAP = {
    red: '#ef4444', blue: '#6366f1', green: '#10b981', yellow: '#f59e0b',
    purple: '#8b5cf6', orange: '#f97316', cyan: '#06b6d4', pink: '#ec4899',
    teal: '#14b8a6', indigo: '#6366f1',
};

const getColor = (custom, idx = 0) => COLOR_MAP[custom] || PALETTE[idx % PALETTE.length];

const TOOLTIP_STYLE = {
    backgroundColor: '#1e293b', border: '1px solid #334155',
    borderRadius: 12, color: '#f1f5f9', fontSize: 12,
};

// ─── DATA UTILS ───────────────────────────────────────────────────────────────
const sanitize = (data) => {
    if (!Array.isArray(data)) return [];
    return data.map(row => {
        const clean = {};
        Object.entries(row).forEach(([k, v]) => {
            if (v === null || v === undefined) { clean[k] = null; return; }
            const num = typeof v === 'string'
                ? parseFloat(v.replace(/[€$£,% ]/g, ''))
                : Number(v);
            clean[k] = (!isNaN(num) && v !== '') ? num : v;
        });
        return clean;
    }).filter(r => Object.values(r).some(v => v !== null));
};

// ─── FUNNEL CHART (SVG Custom) ────────────────────────────────────────────────
const FunnelChart = ({ data, xKey, yKey, color }) => {
    const max = Math.max(...data.map(d => Number(d[yKey]) || 0));
    const totalHeight = 300;
    const itemH = Math.floor((totalHeight - data.length * 4) / Math.max(data.length, 1));

    return (
        <div className="w-full mt-2 space-y-1">
            {data.map((d, i) => {
                const pct = (Number(d[yKey]) / max) * 100;
                const c = getColor(color, i);
                return (
                    <motion.div
                        key={i}
                        initial={{ opacity: 0, scaleX: 0 }}
                        animate={{ opacity: 1, scaleX: 1 }}
                        transition={{ delay: i * 0.08 }}
                        className="flex items-center gap-3"
                    >
                        <span className="text-xs text-gray-500 dark:text-gray-400 w-24 text-right truncate shrink-0">{d[xKey]}</span>
                        <div className="flex-1 flex items-center gap-2">
                            <motion.div
                                style={{ width: `${pct}%`, backgroundColor: c, minWidth: 8 }}
                                className="h-7 rounded-lg flex items-center px-2 min-w-0"
                            >
                                <span className="text-[10px] text-white font-bold truncate">{d[yKey]?.toLocaleString?.() ?? d[yKey]}</span>
                            </motion.div>
                        </div>
                    </motion.div>
                );
            })}
        </div>
    );
};

// ─── TREEMAP (SVG Custom) ─────────────────────────────────────────────────────
const CustomTreemap = ({ data, xKey, yKey, color }) => {
    const total = data.reduce((s, d) => s + Number(d[yKey] || 0), 0);
    const sorted = [...data].sort((a, b) => Number(b[yKey]) - Number(a[yKey])).slice(0, 12);

    return (
        <div className="w-full mt-2 grid grid-cols-3 gap-1.5" style={{ minHeight: 200 }}>
            {sorted.map((d, i) => {
                const pct = (Number(d[yKey]) / total) * 100;
                const c = getColor(color, i);
                const relSize = Math.max(0.5, pct / (100 / sorted.length));
                return (
                    <motion.div
                        key={i}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: i * 0.04 }}
                        title={`${d[xKey]}: ${d[yKey]}`}
                        style={{ backgroundColor: c, minHeight: Math.max(40, relSize * 50) + 'px', opacity: 0.85 + (1 - i / sorted.length) * 0.15 }}
                        className="rounded-xl flex flex-col items-center justify-center p-1 cursor-pointer hover:opacity-100 transition-opacity"
                    >
                        <span className="text-[10px] font-bold text-white text-center leading-tight">{d[xKey]}</span>
                        <span className="text-[9px] text-white/80">{pct.toFixed(1)}%</span>
                    </motion.div>
                );
            })}
        </div>
    );
};

// ─── ML FORECAST CHART ────────────────────────────────────────────────────────
const ForecastChart = ({ data, xKey, yKey, actualKey }) => {
    const historical = data.filter(d => d.type === 'historical');
    const forecast = data.filter(d => d.type === 'forecast');

    return (
        <ResponsiveContainer width="100%" height={340}>
            <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.5} />
                <XAxis dataKey={xKey} tick={{ fontSize: 10 }} tickLine={false} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend />
                {historical.length > 0 && actualKey && (
                    <Line
                        type="monotone" dataKey={actualKey} name="Actual"
                        stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }}
                        data={historical}
                    />
                )}
                <Line
                    type="monotone" dataKey={yKey} name="Forecast"
                    stroke="#10b981" strokeWidth={2} dot={{ r: 3 }}
                    strokeDasharray="5 3"
                />
                {/* Divider between historical and forecast */}
                {historical.length > 0 && (
                    <ReferenceLine
                        x={historical[historical.length - 1]?.[xKey]}
                        stroke="#f59e0b" strokeDasharray="4 4"
                        label={{ value: 'Forecast →', fontSize: 10, fill: '#f59e0b' }}
                    />
                )}
            </LineChart>
        </ResponsiveContainer>
    );
};

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
const ChartDisplay = ({
    chartType, data, xKey, yKey, insights = [], reasoning = '',
    customColor, mlResult, compact = false,
}) => {
    const chartRef = useRef(null);
    const [limit, setLimit] = useState(25);

    const cleanData = sanitize(data || []);
    const limitedData = cleanData.slice(0, limit);
    const primaryColor = getColor(customColor, 0);

    // Infer keys if not provided
    const resolvedXKey = xKey || (cleanData[0] && Object.keys(cleanData[0])[0]);
    const resolvedYKey = yKey || (cleanData[0] && Object.keys(cleanData[0]).find(k => typeof cleanData[0][k] === 'number')) || '';

    const downloadChart = async () => {
        if (chartRef.current) {
            const canvas = await html2canvas(chartRef.current);
            const link = document.createElement('a');
            link.download = `datasight_chart_${Date.now()}.png`;
            link.href = canvas.toDataURL();
            link.click();
        }
    };

    const renderChart = () => {
        // ML Forecast special case
        if (mlResult?.ml_type === 'forecast') {
            return (
                <ForecastChart
                    data={cleanData}
                    xKey={mlResult.x_key || 'label'}
                    yKey={mlResult.y_key || 'predicted'}
                    actualKey={mlResult.actual_key}
                />
            );
        }

        const commonProps = { margin: { top: 10, right: 20, left: 0, bottom: 10 } };
        const axisProps = {
            tick: { fontSize: compact ? 9 : 11 },
            tickLine: false,
        };
        const gridProps = { strokeDasharray: '3 3', stroke: '#e2e8f0', strokeOpacity: 0.5 };
        const height = compact ? 200 : 320;

        switch (chartType) {
            case 'bar':
                return (
                    <ResponsiveContainer width="100%" height={height}>
                        <BarChart data={limitedData} {...commonProps}>
                            <CartesianGrid {...gridProps} />
                            <XAxis dataKey={resolvedXKey} {...axisProps} />
                            <YAxis {...axisProps} axisLine={false} />
                            <Tooltip contentStyle={TOOLTIP_STYLE} />
                            {!compact && <Brush dataKey={resolvedXKey} height={20} />}
                            <Bar dataKey={resolvedYKey} name={resolvedYKey} radius={[4, 4, 0, 0]}>
                                {limitedData.map((_, i) => <Cell key={i} fill={getColor(customColor, i)} />)}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                );

            case 'line':
                return (
                    <ResponsiveContainer width="100%" height={height}>
                        <LineChart data={limitedData} {...commonProps}>
                            <CartesianGrid {...gridProps} />
                            <XAxis dataKey={resolvedXKey} {...axisProps} />
                            <YAxis {...axisProps} axisLine={false} />
                            <Tooltip contentStyle={TOOLTIP_STYLE} />
                            <Line type="monotone" dataKey={resolvedYKey} stroke={primaryColor} strokeWidth={2.5} dot={{ r: 3, fill: primaryColor }} activeDot={{ r: 5 }} />
                        </LineChart>
                    </ResponsiveContainer>
                );

            case 'area':
                return (
                    <ResponsiveContainer width="100%" height={height}>
                        <AreaChart data={limitedData} {...commonProps}>
                            <defs>
                                <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={primaryColor} stopOpacity={0.25} />
                                    <stop offset="95%" stopColor={primaryColor} stopOpacity={0.02} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid {...gridProps} />
                            <XAxis dataKey={resolvedXKey} {...axisProps} />
                            <YAxis {...axisProps} axisLine={false} />
                            <Tooltip contentStyle={TOOLTIP_STYLE} />
                            <Area type="monotone" dataKey={resolvedYKey} stroke={primaryColor} strokeWidth={2.5} fill="url(#areaGrad)" />
                        </AreaChart>
                    </ResponsiveContainer>
                );

            case 'scatter':
                return (
                    <ResponsiveContainer width="100%" height={height}>
                        <ScatterChart {...commonProps}>
                            <CartesianGrid {...gridProps} />
                            <XAxis dataKey={resolvedXKey} name={resolvedXKey} {...axisProps} />
                            <YAxis dataKey={resolvedYKey} name={resolvedYKey} {...axisProps} axisLine={false} />
                            <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ strokeDasharray: '3 3' }} />
                            <Scatter data={limitedData} fill={primaryColor} opacity={0.72} />
                        </ScatterChart>
                    </ResponsiveContainer>
                );

            case 'pie':
            case 'donut':
                return (
                    <ResponsiveContainer width="100%" height={height}>
                        <PieChart>
                            <Pie
                                data={limitedData}
                                dataKey={resolvedYKey}
                                nameKey={resolvedXKey}
                                cx="50%" cy="50%"
                                outerRadius={compact ? 70 : 120}
                                innerRadius={chartType === 'donut' ? (compact ? 35 : 60) : 0}
                                paddingAngle={3}
                                label={compact ? null : ({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                            >
                                {limitedData.map((_, i) => <Cell key={i} fill={getColor(customColor, i)} />)}
                            </Pie>
                            <Tooltip contentStyle={TOOLTIP_STYLE} />
                            {!compact && <Legend />}
                        </PieChart>
                    </ResponsiveContainer>
                );

            case 'histogram':
                return (
                    <ResponsiveContainer width="100%" height={height}>
                        <BarChart data={limitedData} {...commonProps}>
                            <CartesianGrid {...gridProps} />
                            <XAxis dataKey="bin" {...axisProps} />
                            <YAxis {...axisProps} axisLine={false} />
                            <Tooltip contentStyle={TOOLTIP_STYLE} />
                            <Bar dataKey="count" fill={primaryColor} radius={[3, 3, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                );

            case 'radar': {
                const numKeys = Object.keys(cleanData[0] || {}).filter(k => typeof cleanData[0][k] === 'number').slice(0, 5);
                const radarData = numKeys.map(k => ({
                    subject: k,
                    value: cleanData.reduce((s, d) => s + (Number(d[k]) || 0), 0) / cleanData.length,
                }));
                return (
                    <ResponsiveContainer width="100%" height={height}>
                        <RadarChart data={radarData}>
                            <PolarGrid stroke="#e2e8f0" />
                            <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11 }} />
                            <PolarRadiusAxis tick={{ fontSize: 9 }} />
                            <Radar name="avg" dataKey="value" stroke={primaryColor} fill={primaryColor} fillOpacity={0.35} />
                            <Tooltip contentStyle={TOOLTIP_STYLE} />
                        </RadarChart>
                    </ResponsiveContainer>
                );
            }

            case 'funnel':
                return <FunnelChart data={limitedData} xKey={resolvedXKey} yKey={resolvedYKey} color={customColor} />;

            case 'treemap':
                return <CustomTreemap data={limitedData} xKey={resolvedXKey} yKey={resolvedYKey} color={customColor} />;

            case 'bubble': {
                const sizeKey = Object.keys(cleanData[0] || {}).filter(k => typeof cleanData[0][k] === 'number')[2];
                return (
                    <ResponsiveContainer width="100%" height={height}>
                        <ScatterChart {...commonProps}>
                            <CartesianGrid {...gridProps} />
                            <XAxis dataKey={resolvedXKey} name={resolvedXKey} {...axisProps} />
                            <YAxis dataKey={resolvedYKey} name={resolvedYKey} {...axisProps} axisLine={false} />
                            <Tooltip contentStyle={TOOLTIP_STYLE} />
                            <Scatter
                                data={limitedData}
                                fill={primaryColor}
                                opacity={0.65}
                            />
                        </ScatterChart>
                    </ResponsiveContainer>
                );
            }

            default:
                return (
                    <ResponsiveContainer width="100%" height={height}>
                        <BarChart data={limitedData} {...commonProps}>
                            <CartesianGrid {...gridProps} />
                            <XAxis dataKey={resolvedXKey} {...axisProps} />
                            <YAxis {...axisProps} axisLine={false} />
                            <Tooltip contentStyle={TOOLTIP_STYLE} />
                            <Bar dataKey={resolvedYKey} fill={primaryColor} radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                );
        }
    };

    if (!cleanData.length) return null;

    return (
        <div className="w-full">
            {/* Controls */}
            {!compact && (
                <div className="flex items-center justify-between px-3 pt-2 pb-1">
                    <div className="flex items-center gap-1.5">
                        <BarChart2 size={13} className="text-gray-400" />
                        <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            {chartType?.toUpperCase()} · {cleanData.length} pts
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        {cleanData.length > 25 && (
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => setLimit(l => Math.max(10, l - 10))}
                                    className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 p-0.5 rounded"
                                    title="Show fewer"
                                >
                                    <ZoomOut size={13} />
                                </button>
                                <span className="text-[10px] text-gray-400">{Math.min(limit, cleanData.length)} shown</span>
                                <button
                                    onClick={() => setLimit(l => Math.min(cleanData.length, l + 10))}
                                    className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 p-0.5 rounded"
                                    title="Show more"
                                >
                                    <ZoomIn size={13} />
                                </button>
                            </div>
                        )}
                        <button
                            onClick={downloadChart}
                            className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            title="Download chart"
                        >
                            <Download size={13} />
                        </button>
                    </div>
                </div>
            )}

            {/* Chart */}
            <div ref={chartRef} className={compact ? 'px-1' : 'px-2 pb-2'}>
                {renderChart()}
            </div>
        </div>
    );
};

export default ChartDisplay;
