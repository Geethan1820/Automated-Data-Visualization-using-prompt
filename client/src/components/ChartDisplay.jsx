import React, { useRef, useState, useMemo } from 'react';
import {
    BarChart, Bar, LineChart, Line, PieChart, Pie, AreaChart, Area, ScatterChart, Scatter,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, Label, ReferenceLine
} from 'recharts';
import { Download, AlertCircle, Settings, X, Check, Sparkles } from 'lucide-react';
import html2canvas from 'html2canvas';

const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#6366f1'];

const ChartDisplay = ({ chartType, data, xKey, yKey, insights, reasoning, customColor }) => {
    const chartRef = useRef(null);
    const [showSettings, setShowSettings] = useState(false);

    // Settings State
    const [range, setRange] = useState({ min: '', max: '' });
    const [limit, setLimit] = useState(20);
    const [showAvgLine, setShowAvgLine] = useState(false);
    const [showMinMaxLines, setShowMinMaxLines] = useState(false);

    // 1. Robust Data Cleaning Function
    const cleanValue = (val) => {
        if (typeof val === 'number') return val;
        if (val === null || val === undefined || val === '') return 0;

        // Handle dates - if it's a date string, leave it for the axis to handle
        if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val)) return val;

        // Remove currency symbols, commas, spaces, etc., and parse
        const cleaned = String(val).replace(/[^\d.-]/g, "");
        const num = parseFloat(cleaned);
        return isNaN(num) ? val : num; // Return original if not a number
    };

    // Filter and Process Data
    const { processedData, stats } = useMemo(() => {
        // console.log("ChartInputs:", { chartType, data, xKey, yKey });
        if (!data || !Array.isArray(data)) return { processedData: [], stats: { avg: 0, min: 0, max: 0 } };

        // Sanitize & Cast Data
        let filtered = data.map(item => ({
            ...item,
            [xKey]: cleanValue(item[xKey]),
            [yKey]: cleanValue(item[yKey])
        }));

        // Filter by Range (Min/Max on Y-Axis)
        if (range.min !== '') filtered = filtered.filter(d => Number(d[yKey]) >= Number(range.min));
        if (range.max !== '') filtered = filtered.filter(d => Number(d[yKey]) <= Number(range.max));

        // Sort & Limit logic for specific charts
        if (['bar', 'pie', 'donut', 'area'].includes(chartType)) {
            const xIsNum = filtered.every(d => !isNaN(Number(d[xKey])));
            if (!xIsNum && chartType !== 'area' && chartType !== 'line') {
                filtered.sort((a, b) => b[yKey] - a[yKey]);
            }
            if (limit > 0) filtered = filtered.slice(0, limit);
        }

        // Calculate Stats
        const values = filtered.map(d => d[yKey]);
        const sum = values.reduce((a, b) => a + b, 0);
        const avg = values.length ? sum / values.length : 0;
        const min = values.length ? Math.min(...values) : 0;
        const max = values.length ? Math.max(...values) : 0;

        return {
            processedData: filtered,
            stats: { avg, min, max }
        };
    }, [data, range, limit, yKey, chartType, xKey]);

    React.useEffect(() => {
        if (processedData && processedData.length > 0) {
            console.log(`[ChartDebug] Type: ${chartType}, xKey: ${xKey}, yKey: ${yKey}`);
            console.log(`[ChartDebug] First Point:`, processedData[0]);
        }
    }, [processedData, chartType, xKey, yKey]);

    if (!data || data.length === 0) {
        return (
            <div className="w-full h-64 flex flex-col items-center justify-center text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-xl border border-dashed border-gray-200 dark:border-gray-700">
                <AlertCircle size={32} className="mb-2 opacity-50" />
                <p className="text-sm">No data generated</p>
            </div>
        );
    }

    if (processedData.length === 0) {
        return (
            <div className="w-full h-64 flex flex-col items-center justify-center text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-xl border border-dashed border-gray-200 dark:border-gray-700">
                <AlertCircle size={32} className="mb-2 opacity-50" />
                <p className="text-sm">Data was filtered out completely.</p>
                <p className="text-xs text-gray-500 mt-1">Check settings or ranges.</p>
            </div>
        );
    }

    const handleDownload = async () => {
        if (chartRef.current) {
            const canvas = await html2canvas(chartRef.current);
            const link = document.createElement('a');
            link.download = `chart-${chartType}-${Date.now()}.png`;
            link.href = canvas.toDataURL();
            link.click();
        }
    };

    const formatLabel = (str) => str ? String(str).charAt(0).toUpperCase() + String(str).slice(1) : "Value";

    const commonProps = {
        margin: { top: 20, right: 30, left: 20, bottom: 20 },
        className: "overflow-visible" // Allow shadows to spill out slightly
    };

    // Shared SVG Defs for 3D Effects
    const renderDefs = () => (
        <defs>
            {/* 3D Drop Shadow */}
            <filter id="shadow3d" height="200%">
                <feDropShadow dx="2" dy="4" stdDeviation="3" floodColor="#000000" floodOpacity="0.3" />
            </filter>

            {/* Glossy Gradient for Bars */}
            <linearGradient id="glossyGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(255,255,255,0.4)" />
                <stop offset="100%" stopColor="rgba(255,255,255,0)" />
            </linearGradient>

            {/* Custom Color Gradient */}
            <linearGradient id="mainGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={customColor || '#3b82f6'} stopOpacity={1} />
                <stop offset="100%" stopColor={customColor || '#3b82f6'} stopOpacity={0.6} />
            </linearGradient>

            <linearGradient id="colorPv" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={customColor || '#8b5cf6'} stopOpacity={0.8} />
                <stop offset="95%" stopColor={customColor || '#8b5cf6'} stopOpacity={0} />
            </linearGradient>
        </defs>
    );

    const axisStroke = "#94a3b8";

    const renderReferenceLines = () => (
        <>
            {showAvgLine && !isNaN(stats.avg) && <ReferenceLine y={stats.avg} label="Avg" stroke="#ef4444" strokeDasharray="3 3" strokeWidth={2} />}
            {showMinMaxLines && !isNaN(stats.max) && <ReferenceLine y={stats.max} label="Max" stroke="#10b981" strokeDasharray="3 3" />}
            {showMinMaxLines && !isNaN(stats.min) && <ReferenceLine y={stats.min} label="Min" stroke="#f59e0b" strokeDasharray="3 3" />}
        </>
    );

    const renderChart = () => {
        switch (chartType) {
            case 'bar':
            case 'histogram': // Treat histogram similarly for now
                return (
                    <BarChart data={processedData} {...commonProps} barCategoryGap={chartType === 'histogram' ? 1 : '20%'}>
                        {renderDefs()}
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.2} vertical={false} />
                        <XAxis dataKey={xKey} tick={{ fontSize: 11, fill: axisStroke }} axisLine={{ stroke: axisStroke, strokeWidth: 1.5 }}>
                            <Label value={formatLabel(xKey)} offset={-10} position="insideBottom" fill={axisStroke} />
                        </XAxis>
                        <YAxis tick={{ fontSize: 11, fill: axisStroke }} axisLine={{ stroke: axisStroke, strokeWidth: 1.5 }}>
                            <Label value={formatLabel(yKey)} angle={-90} position="insideLeft" style={{ textAnchor: 'middle' }} fill={axisStroke} />
                        </YAxis>
                        <Tooltip
                            cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.2)', backgroundColor: 'rgba(255, 255, 255, 0.95)', color: '#1e293b' }}
                        />
                        <Legend verticalAlign="top" iconType="circle" wrapperStyle={{ color: axisStroke, paddingBottom: '20px' }} />
                        <Bar
                            dataKey={yKey}
                            name={formatLabel(yKey)}
                            radius={[8, 8, 4, 4]}
                            animationDuration={1500}
                        >
                            {processedData.map((entry, index) => (
                                <Cell
                                    key={`cell-${index}`}
                                    fill={customColor || COLORS[index % COLORS.length]}
                                    stroke="rgba(255,255,255,0.2)"
                                    strokeWidth={1}
                                />
                            ))}
                        </Bar>
                        {renderReferenceLines()}
                    </BarChart>
                );
            case 'line':
                return (
                    <LineChart data={processedData} {...commonProps}>
                        {renderDefs()}
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.2} vertical={false} />
                        <XAxis dataKey={xKey} tick={{ fontSize: 11, fill: axisStroke }} axisLine={{ stroke: axisStroke, strokeWidth: 1.5 }}>
                            <Label value={formatLabel(xKey)} offset={-10} position="insideBottom" fill={axisStroke} />
                        </XAxis>
                        <YAxis tick={{ fontSize: 11, fill: axisStroke }} axisLine={{ stroke: axisStroke, strokeWidth: 1.5 }}>
                            <Label value={formatLabel(yKey)} angle={-90} position="insideLeft" style={{ textAnchor: 'middle' }} fill={axisStroke} />
                        </YAxis>
                        <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.2)', backgroundColor: 'rgba(255, 255, 255, 0.95)' }} />
                        <Legend verticalAlign="top" iconType="plainline" wrapperStyle={{ color: axisStroke, paddingBottom: '20px' }} />
                        <Line
                            type="monotone"
                            dataKey={yKey}
                            stroke={customColor || "#8b5cf6"}
                            strokeWidth={4}
                            dot={{ r: 6, strokeWidth: 3, fill: 'white', stroke: customColor || "#8b5cf6" }}
                            activeDot={{ r: 10, strokeWidth: 0, fill: customColor || "#8b5cf6" }}
                            name={formatLabel(yKey)}
                            animationDuration={2000}
                            connectNulls={true}
                        />
                        {renderReferenceLines()}
                    </LineChart>
                );
            case 'area':
                return (
                    <AreaChart data={processedData} {...commonProps}>
                        {renderDefs()}
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.2} vertical={false} />
                        <XAxis dataKey={xKey} tick={{ fontSize: 11, fill: axisStroke }} axisLine={{ stroke: axisStroke, strokeWidth: 1.5 }}>
                            <Label value={formatLabel(xKey)} offset={-10} position="insideBottom" fill={axisStroke} />
                        </XAxis>
                        <YAxis tick={{ fontSize: 11, fill: axisStroke }} axisLine={{ stroke: axisStroke, strokeWidth: 1.5 }}>
                            <Label value={formatLabel(yKey)} angle={-90} position="insideLeft" style={{ textAnchor: 'middle' }} fill={axisStroke} />
                        </YAxis>
                        <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.2)', backgroundColor: 'rgba(255, 255, 255, 0.95)' }} />
                        <Area
                            type="monotone"
                            dataKey={yKey}
                            stroke={customColor || "#8b5cf6"}
                            strokeWidth={3}
                            fillOpacity={1}
                            fill="url(#colorPv)"
                            name={formatLabel(yKey)}
                            animationDuration={2000}
                            connectNulls={true}
                        />
                        {renderReferenceLines()}
                    </AreaChart>
                );
            case 'scatter':
                return (
                    <ScatterChart {...commonProps}>
                        {renderDefs()}
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.2} />
                        <XAxis
                            type={typeof processedData[0]?.[xKey] === 'number' ? "number" : "category"}
                            dataKey={xKey}
                            name={xKey}
                            tick={{ fontSize: 11, fill: axisStroke }}
                            axisLine={{ stroke: axisStroke, strokeWidth: 1.5 }}
                        >
                            <Label value={formatLabel(xKey)} offset={-10} position="insideBottom" fill={axisStroke} />
                        </XAxis>
                        <YAxis
                            type={typeof processedData[0]?.[yKey] === 'number' ? "number" : "category"}
                            dataKey={yKey}
                            name={yKey}
                            tick={{ fontSize: 11, fill: axisStroke }}
                            axisLine={{ stroke: axisStroke, strokeWidth: 1.5 }}
                        >
                            <Label value={formatLabel(yKey)} angle={-90} position="insideLeft" style={{ textAnchor: 'middle' }} fill={axisStroke} />
                        </YAxis>
                        <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.2)', backgroundColor: 'rgba(255, 255, 255, 0.95)' }} />
                        <Scatter
                            name="Data"
                            data={processedData}
                            fill={customColor || "#ec4899"}
                            animationDuration={1500}
                        />
                        {renderReferenceLines()}
                    </ScatterChart>
                );
            case 'pie':
            case 'donut': {
                const innerRadius = chartType === 'donut' ? 60 : 0;
                return (
                    <PieChart {...commonProps}>
                        {renderDefs()}
                        <Pie
                            data={processedData}
                            cx="50%"
                            cy="50%"
                            innerRadius={innerRadius}
                            outerRadius={100}
                            paddingAngle={2}
                            dataKey={yKey}
                            nameKey={xKey || "name"}
                            label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}
                            labelLine={false}
                            animationDuration={1500}
                        >
                            {processedData.map((entry, index) => (
                                <Cell
                                    key={`cell-${index}`}
                                    fill={COLORS[index % COLORS.length]}
                                    stroke="white"
                                    strokeWidth={3}
                                />
                            ))}
                        </Pie>
                        <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.2)', backgroundColor: 'rgba(255, 255, 255, 0.95)' }} />
                        <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ color: axisStroke, paddingTop: '20px' }} />
                    </PieChart>
                );
            }
            default:
                return (
                    // Fallback to Bar
                    <BarChart data={processedData} {...commonProps}>
                        {renderDefs()}
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey={xKey || "name"} />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey={yKey || "value"} fill={customColor || "#3b82f6"} filter="url(#shadow3d)" />
                    </BarChart>
                );
        }
    };

    return (
        <div className="w-full mt-4 bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm relative group transition-colors">
            {/* Header Controls */}
            <div className="flex justify-between items-center mb-2 px-2">
                <span className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">{chartType} Chart</span>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setShowSettings(!showSettings)}
                        className={`transition-colors p-1 rounded-md ${showSettings ? 'bg-blue-50 dark:bg-blue-900/30 text-primary' : 'text-gray-400 hover:text-primary dark:hover:text-primary'}`}
                        title="Chart Settings"
                    >
                        <Settings size={16} />
                    </button>
                    <button onClick={handleDownload} className="text-gray-400 hover:text-primary transition-colors p-1" title="Download Chart">
                        <Download size={16} />
                    </button>
                </div>
            </div>

            {/* Settings Panel */}
            {showSettings && (
                <div className="absolute top-12 right-4 z-10 bg-white dark:bg-gray-800 p-4 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 w-64 animate-in fade-in slide-in-from-top-2">
                    <div className="flex justify-between items-center mb-3">
                        <h3 className="text-sm font-bold text-gray-700 dark:text-gray-200">Chart Settings</h3>
                        <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 block mb-1">Value Range</label>
                            <div className="flex gap-2">
                                <input
                                    type="number"
                                    placeholder="Min"
                                    className="w-full px-2 py-1 text-sm border rounded bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                    value={range.min}
                                    onChange={(e) => setRange(prev => ({ ...prev, min: e.target.value }))}
                                />
                                <input
                                    type="number"
                                    placeholder="Max"
                                    className="w-full px-2 py-1 text-sm border rounded bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                    value={range.max}
                                    onChange={(e) => setRange(prev => ({ ...prev, max: e.target.value }))}
                                />
                            </div>
                        </div>

                        <div>
                            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 block mb-1">Items to Show</label>
                            <input
                                type="range"
                                min="5"
                                max="50"
                                step="5"
                                value={limit}
                                onChange={(e) => setLimit(Number(e.target.value))}
                                className="w-full accent-primary"
                            />
                            <div className="text-right text-xs text-gray-400">Top {limit} items</div>
                        </div>

                        <div>
                            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 block mb-2">Reference Lines</label>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setShowAvgLine(!showAvgLine)}
                                    className={`flex-1 px-2 py-1 text-xs rounded border transition-colors ${showAvgLine ? 'bg-blue-50 border-blue-200 text-blue-600 dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-400' : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400'}`}
                                >
                                    Average
                                </button>
                                <button
                                    onClick={() => setShowMinMaxLines(!showMinMaxLines)}
                                    className={`flex-1 px-2 py-1 text-xs rounded border transition-colors ${showMinMaxLines ? 'bg-blue-50 border-blue-200 text-blue-600 dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-400' : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400'}`}
                                >
                                    Min/Max
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div ref={chartRef} className="h-[400px] min-h-[400px] w-full bg-white dark:bg-gray-800 font-sans text-xs transition-colors">
                <ResponsiveContainer width="100%" height="100%" key={`${chartType}-${xKey}-${yKey}-${processedData.length}`}>
                    {renderChart()}
                </ResponsiveContainer>
            </div>

            {/* Reasoning & Insights Footer */}
            <div className="mt-4 space-y-2">
                {reasoning && (
                    <div className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/50 p-2 rounded-lg border border-gray-100 dark:border-gray-700">
                        <Check size={14} className="text-green-500 mt-0.5" />
                        <span>{reasoning}</span>
                    </div>
                )}

                {insights && insights.length > 0 && (
                    <div className="space-y-1">
                        <h4 className="text-xs font-bold text-gray-700 dark:text-gray-300 flex items-center gap-1">
                            <Sparkles size={12} className="text-amber-500" />
                            Key Insights
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {insights.map((insight, idx) => (
                                <div key={idx} className="bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 p-2 rounded-lg text-xs text-amber-900 dark:text-amber-200">
                                    {insight}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ChartDisplay;
