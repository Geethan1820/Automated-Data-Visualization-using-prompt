import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { BarChart3, Loader2, RefreshCw, AlertCircle } from 'lucide-react';
import ChartDisplay from './ChartDisplay';
import { KPIRow } from './KPICard';

const Dashboard = ({ currentFile }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const loadDashboard = async () => {
        if (!currentFile?.file_id) return;
        setLoading(true); setError(null);
        try {
            const res = await axios.get(`http://localhost:8000/dashboard/${currentFile.file_id}`);
            setData(res.data);
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to load dashboard.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadDashboard(); }, [currentFile?.file_id]);

    if (loading) return (
        <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400">
            <Loader2 size={32} className="animate-spin text-blue-500" />
            <p className="text-sm">Generating dashboard insights...</p>
        </div>
    );

    if (error) return (
        <div className="flex flex-col items-center justify-center h-full gap-3 text-red-400">
            <AlertCircle size={32} />
            <p className="text-sm">{error}</p>
            <button onClick={loadDashboard} className="text-xs text-blue-500 hover:underline flex items-center gap-1">
                <RefreshCw size={12} /> Retry
            </button>
        </div>
    );

    if (!data) return null;

    return (
        <div className="h-full overflow-y-auto p-2">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <BarChart3 size={20} className="text-blue-500" />
                    <h2 className="font-bold text-gray-800 dark:text-white text-lg">
                        Dashboard — {currentFile.filename}
                    </h2>
                </div>
                <button
                    onClick={loadDashboard}
                    className="text-xs flex items-center gap-1 text-gray-400 hover:text-blue-500 transition-colors"
                >
                    <RefreshCw size={12} /> Refresh
                </button>
            </div>

            {/* Summary */}
            {data.summary && (
                <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-sm text-gray-500 dark:text-gray-400 mb-4 bg-blue-50 dark:bg-blue-900/20 px-4 py-2 rounded-xl border border-blue-100 dark:border-blue-800"
                >
                    {data.summary}
                </motion.p>
            )}

            {/* KPI Row */}
            {data.kpis && <div className="mb-5"><KPIRow kpis={data.kpis} /></div>}

            {/* Charts Grid */}
            {data.dashboard_charts && data.dashboard_charts.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {data.dashboard_charts.map((chart, idx) => (
                        <motion.div
                            key={idx}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.12 }}
                            className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-1 overflow-hidden"
                        >
                            {chart.title && (
                                <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest px-3 pt-3 pb-1">
                                    {chart.title}
                                </p>
                            )}
                            <ChartDisplay
                                chartType={chart.chart_type}
                                data={chart.data}
                                xKey={chart.x_key}
                                yKey={chart.y_key}
                                insights={[]}
                                reasoning=""
                                customColor={null}
                                compact={true}
                            />
                        </motion.div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default Dashboard;
