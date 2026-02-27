import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Send, Loader2, Bot, User, Sparkles, Download,
    Brain, TrendingUp, AlertCircle, Lightbulb, BarChart2, FileText
} from 'lucide-react';
import ChartDisplay from './ChartDisplay';
import { KPIRow } from './KPICard';

const API = 'http://localhost:8000';

const Chat = ({ currentFile, initialMessages = null }) => {
    const [messages, setMessages] = useState(() => {
        if (initialMessages?.length > 0) return initialMessages;
        return [{
            role: 'bot',
            content: `Hello! I've loaded **${currentFile?.filename}** (${currentFile?.stats?.rows?.toLocaleString() ?? '?'} rows). Ask me anything about your data!\n\n**Try:** "Show sales trend" · "Predict next 6 months" · "Cluster customers" · "Create dashboard"`,
            isWelcome: true,
        }];
    });
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const messagesEndRef = useRef(null);
    // Map of msgIndex -> DOM element for chart containers
    const chartRefs = useRef({});

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Load DB history for this file on mount
    useEffect(() => {
        if (currentFile?.file_id && !initialMessages) {
            loadHistory();
        }
    }, [currentFile?.file_id]);

    const loadHistory = async () => {
        try {
            const res = await axios.get(`${API}/history/${currentFile.file_id}`);
            if (res.data.chats?.length > 0) {
                const historyMsgs = [];
                for (const chat of res.data.chats) {
                    historyMsgs.push({ role: 'user', content: chat.user_prompt });
                    historyMsgs.push({
                        role: 'bot',
                        content: chat.summary || '',
                        chart: chat.chart_data?.length > 0 ? chat : null,
                        insights: chat.insights || [],
                        kpis: chat.kpis,
                        confidence: chat.confidence,
                        reasoning: chat.reasoning,
                        customColor: chat.color,
                        isHistory: true,
                    });
                }
                setMessages(prev => [prev[0], ...historyMsgs]);
            }
        } catch (e) {
            console.warn('History load failed:', e.message);
        }
    };

    const suggestions = [
        '📈 Show trend over time',
        '🥧 Show category breakdown',
        '🔮 Predict next 6 months',
        '🏆 Top 10 by value',
        '📊 Create dashboard',
        '🔗 Cluster analysis',
    ];

    const handleSend = async (promptOverride) => {
        const userMsg = promptOverride || input.trim();
        if (!userMsg || isLoading) return;
        setInput('');

        setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
        setIsLoading(true);

        try {
            const res = await axios.post(`${API}/query`, {
                prompt: userMsg,
                file_id: currentFile.file_id,
            });
            const data = res.data;

            if (data.error) {
                setMessages(prev => [...prev, {
                    role: 'bot',
                    content: data.message || 'Could not process your request.',
                    isError: true,
                    suggestions: data.suggestions || [],
                }]);
            } else if (data.is_dashboard) {
                setMessages(prev => [...prev, {
                    role: 'bot',
                    content: data.summary || 'Here is your dashboard overview.',
                    isDashboard: true,
                    dashboardCharts: data.dashboard_charts,
                    kpis: data.kpis,
                }]);
            } else {
                const isML = data.is_ml;
                const mlResult = data.ml_result;
                const chartSrc = isML ? mlResult : data;
                const hasChart = (chartSrc?.chart_data?.length > 0 || mlResult?.data?.length > 0);

                setMessages(prev => [...prev, {
                    role: 'bot',
                    content: data.summary || (isML ? mlResult?.summary : ''),
                    isML,
                    mlType: data.ml_type,
                    chart: hasChart ? {
                        chart_type: isML ? mlResult?.chart_type : data.intent?.chart_type,
                        chart_data: isML ? mlResult?.data : data.chart_data,
                        x_column: isML ? mlResult?.x_key : data.intent?.x_column,
                        y_column: isML ? mlResult?.y_key : data.intent?.y_column,
                    } : null,
                    mlResult: isML ? mlResult : null,
                    insights: data.insights || [],
                    kpis: data.kpis,
                    confidence: data.confidence,
                    reasoning: data.intent?.reasoning,
                    customColor: data.custom_color,
                    responseTime: data.response_time,
                }]);
            }
        } catch (err) {
            setMessages(prev => [...prev, {
                role: 'bot',
                content: err.response?.data?.detail || 'Connection error. Is the server running?',
                isError: true,
            }]);
        } finally {
            setIsLoading(false);
        }
    };

    const exportPDF = async () => {
        if (isExporting) return;
        setIsExporting(true);
        try {
            const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
                import('jspdf'),
                import('html2canvas'),
            ]);

            const doc = new jsPDF({ unit: 'mm', format: 'a4' });
            const PAGE_W = 210;
            const PAGE_H = 297;
            const MARGIN = 14;
            const CONTENT_W = PAGE_W - MARGIN * 2;
            let y = 0;

            const checkPage = (needed = 10) => {
                if (y + needed > PAGE_H - 18) {
                    doc.addPage();
                    y = 16;
                    drawFooter();
                }
            };

            const drawFooter = () => {
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(7);
                doc.setTextColor(170, 170, 180);
                doc.text(
                    `GVS DataNova  ·  ${currentFile?.filename}  ·  Generated ${new Date().toLocaleString()}`,
                    MARGIN, PAGE_H - 8
                );
                doc.setTextColor(0, 0, 0);
            };

            // ── Header ──────────────────────────────────────────────────────
            doc.setFillColor(37, 99, 235);
            doc.rect(0, 0, PAGE_W, 28, 'F');
            doc.setFillColor(109, 40, 217);
            doc.rect(PAGE_W * 0.6, 0, PAGE_W * 0.4, 28, 'F');

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(16);
            doc.setTextColor(255, 255, 255);
            doc.text('GVS DataNova — Chat Export', MARGIN, 12);
            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.text(`Dataset: ${currentFile?.filename}`, MARGIN, 19);
            doc.text(
                `Rows: ${currentFile?.stats?.rows?.toLocaleString() ?? '?'}  ·  Quality: ${currentFile?.score ?? '?'}%  ·  Messages: ${messages.length}`,
                MARGIN, 24.5
            );
            doc.setTextColor(0, 0, 0);
            y = 36;
            drawFooter();

            // ── Messages ────────────────────────────────────────────────────
            for (let idx = 0; idx < messages.length; idx++) {
                const msg = messages[idx];

                if (msg.isWelcome) {
                    // Skip the welcome message or render it lightly
                    checkPage(12);
                    doc.setFillColor(239, 246, 255);
                    doc.roundedRect(MARGIN, y, CONTENT_W, 10, 2, 2, 'F');
                    doc.setFont('helvetica', 'italic');
                    doc.setFontSize(8);
                    doc.setTextColor(100, 120, 160);
                    const welcomeLines = doc.splitTextToSize(
                        msg.content.replace(/\*\*/g, '').replace(/\n/g, ' '),
                        CONTENT_W - 6
                    );
                    doc.text(welcomeLines[0] ?? '', MARGIN + 3, y + 6.5);
                    doc.setTextColor(0, 0, 0);
                    y += 14;
                    continue;
                }

                if (msg.role === 'user') {
                    // ── User bubble ───────────────────────────────────────
                    checkPage(16);
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(8);
                    doc.setTextColor(37, 99, 235);
                    doc.text('YOU', MARGIN, y + 4);
                    doc.setTextColor(0, 0, 0);

                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(9.5);
                    const userLines = doc.splitTextToSize(msg.content, CONTENT_W - 10);
                    const userH = userLines.length * 5.5 + 6;
                    checkPage(userH + 4);
                    doc.setFillColor(37, 99, 235);
                    doc.roundedRect(MARGIN + CONTENT_W - (CONTENT_W - 10) - 4, y + 2, CONTENT_W - 10, userH, 3, 3, 'F');
                    doc.setTextColor(255, 255, 255);
                    doc.text(userLines, MARGIN + CONTENT_W - (CONTENT_W - 10), y + 6);
                    doc.setTextColor(0, 0, 0);
                    y += userH + 8;

                } else {
                    // ── Bot bubble ────────────────────────────────────────
                    checkPage(10);
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(8);
                    doc.setTextColor(109, 40, 217);
                    doc.text(msg.isML ? `AI (ML — ${msg.mlType?.toUpperCase() ?? ''})` : 'AI', MARGIN, y + 4);
                    doc.setTextColor(0, 0, 0);
                    y += 6;

                    // Text content
                    if (msg.content) {
                        const cleanContent = msg.content.replace(/\*\*/g, '');
                        doc.setFont('helvetica', msg.isError ? 'italic' : 'normal');
                        doc.setFontSize(9.5);
                        if (msg.isError) doc.setTextColor(180, 30, 30);
                        const botLines = doc.splitTextToSize(cleanContent, CONTENT_W - 10);
                        const botH = botLines.length * 5.5 + 6;
                        checkPage(botH + 4);
                        doc.setFillColor(msg.isError ? 255 : 248, msg.isError ? 240 : 250, msg.isError ? 240 : 255);
                        doc.roundedRect(MARGIN, y, CONTENT_W - 10, botH, 3, 3, 'F');
                        doc.text(botLines, MARGIN + 3, y + 5);
                        doc.setTextColor(0, 0, 0);
                        y += botH + 4;
                    }

                    // Confidence
                    if (msg.confidence) {
                        checkPage(8);
                        const pct = (msg.confidence * 100).toFixed(0);
                        const confColor = msg.confidence >= 0.8 ? [22, 163, 74] : msg.confidence >= 0.6 ? [202, 138, 4] : [220, 38, 38];
                        doc.setFillColor(...confColor);
                        doc.roundedRect(MARGIN, y, 38, 5.5, 1.5, 1.5, 'F');
                        doc.setFont('helvetica', 'bold');
                        doc.setFontSize(7);
                        doc.setTextColor(255, 255, 255);
                        doc.text(`Confidence: ${pct}%`, MARGIN + 2, y + 3.8);
                        doc.setTextColor(0, 0, 0);
                        if (msg.reasoning) {
                            doc.setFont('helvetica', 'italic');
                            doc.setFontSize(7);
                            doc.setTextColor(120, 120, 130);
                            const rLines = doc.splitTextToSize(msg.reasoning, CONTENT_W - 45);
                            doc.text(rLines[0] ?? '', MARGIN + 41, y + 3.8);
                            doc.setTextColor(0, 0, 0);
                        }
                        y += 9;
                    }

                    // KPIs
                    if (msg.kpis && typeof msg.kpis === 'object') {
                        const kpiEntries = Object.entries(msg.kpis).filter(([k]) => k !== 'column');
                        if (kpiEntries.length > 0) {
                            checkPage(20);
                            doc.setFont('helvetica', 'bold');
                            doc.setFontSize(8);
                            doc.setTextColor(55, 65, 81);
                            doc.text('📊 KPI Summary', MARGIN, y + 4);
                            y += 7;
                            const colW = Math.min(38, CONTENT_W / kpiEntries.length);
                            kpiEntries.forEach(([key, val], ki) => {
                                const cx = MARGIN + ki * (colW + 2);
                                doc.setFillColor(237, 233, 254);
                                doc.roundedRect(cx, y, colW, 12, 2, 2, 'F');
                                doc.setFont('helvetica', 'bold');
                                doc.setFontSize(8.5);
                                doc.setTextColor(109, 40, 217);
                                const valStr = typeof val === 'number' ? val.toLocaleString() : String(val);
                                doc.text(valStr.slice(0, 8), cx + colW / 2, y + 5.5, { align: 'center' });
                                doc.setFont('helvetica', 'normal');
                                doc.setFontSize(6.5);
                                doc.setTextColor(100, 100, 120);
                                doc.text(key.toUpperCase(), cx + colW / 2, y + 9.5, { align: 'center' });
                            });
                            doc.setTextColor(0, 0, 0);
                            y += 16;
                        }
                    }

                    // Chart image
                    const chartEl = chartRefs.current[idx];
                    if (chartEl) {
                        try {
                            const canvas = await html2canvas(chartEl, {
                                scale: 2,
                                useCORS: true,
                                backgroundColor: '#ffffff',
                                logging: false,
                            });
                            const imgData = canvas.toDataURL('image/png');
                            const imgW = CONTENT_W;
                            const imgH = Math.min((canvas.height / canvas.width) * imgW, 90);
                            checkPage(imgH + 6);
                            doc.setDrawColor(200, 200, 215);
                            doc.roundedRect(MARGIN - 1, y - 1, imgW + 2, imgH + 2, 3, 3);
                            doc.addImage(imgData, 'PNG', MARGIN, y, imgW, imgH);
                            y += imgH + 6;
                        } catch (e) {
                            console.warn('Chart capture failed:', e);
                        }
                    }

                    // Insights
                    if (msg.insights?.length > 0 && !msg.isDashboard) {
                        checkPage(14);
                        doc.setFillColor(239, 246, 255);
                        const insightLines = msg.insights.slice(0, 5).flatMap(ins =>
                            doc.splitTextToSize(`• ${ins}`, CONTENT_W - 10)
                        );
                        const insH = insightLines.length * 5 + 8;
                        checkPage(insH + 4);
                        doc.roundedRect(MARGIN, y, CONTENT_W - 10, insH, 2, 2, 'F');
                        doc.setFont('helvetica', 'bold');
                        doc.setFontSize(7.5);
                        doc.setTextColor(29, 78, 216);
                        doc.text('💡 AI Insights', MARGIN + 3, y + 5);
                        doc.setFont('helvetica', 'normal');
                        doc.setFontSize(8);
                        doc.setTextColor(55, 65, 81);
                        doc.text(insightLines, MARGIN + 3, y + 10);
                        doc.setTextColor(0, 0, 0);
                        y += insH + 6;
                    }

                    // Dashboard charts (capture the whole dashboard block if available)
                    if (msg.isDashboard && chartRefs.current[idx]) {
                        try {
                            const canvas = await html2canvas(chartRefs.current[idx], {
                                scale: 1.5,
                                useCORS: true,
                                backgroundColor: '#ffffff',
                                logging: false,
                            });
                            const imgData = canvas.toDataURL('image/png');
                            const imgW = CONTENT_W;
                            const imgH = Math.min((canvas.height / canvas.width) * imgW, 140);
                            checkPage(imgH + 6);
                            doc.addImage(imgData, 'PNG', MARGIN, y, imgW, imgH);
                            y += imgH + 6;
                        } catch (e) {
                            console.warn('Dashboard capture failed:', e);
                        }
                    }

                    y += 4; // gap between messages
                }

                // Separator line between turns
                if (idx < messages.length - 1) {
                    checkPage(6);
                    doc.setDrawColor(230, 230, 240);
                    doc.setLineWidth(0.2);
                    doc.line(MARGIN, y, PAGE_W - MARGIN, y);
                    y += 5;
                }
            }

            doc.save(`DataNova_Chat_${(currentFile?.filename ?? 'report').replace(/\.[^.]+$/, '')}_${Date.now()}.pdf`);
        } catch (err) {
            console.error('PDF export failed:', err);
            alert('PDF export failed. Please try again.');
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-950">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 shrink-0">
                <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                        <BarChart2 size={14} className="text-white" />
                    </div>
                    <div>
                        <h2 className="text-sm font-bold text-gray-800 dark:text-white">{currentFile?.filename}</h2>
                        <p className="text-[11px] text-gray-400">{currentFile?.stats?.rows?.toLocaleString()} rows · Quality: {currentFile?.score}%</p>
                    </div>
                </div>
                <motion.button
                    whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }}
                    onClick={exportPDF}
                    disabled={isExporting}
                    className="flex items-center gap-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-blue-50 dark:hover:bg-blue-900/30 text-gray-600 dark:text-gray-300 text-xs font-semibold px-3 py-1.5 rounded-xl transition-all disabled:opacity-60"
                >
                    {isExporting
                        ? <><Loader2 size={13} className="animate-spin" /> Exporting…</>
                        : <><Download size={13} /> Export PDF</>
                    }
                </motion.button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                <AnimatePresence initial={false}>
                    {messages.map((msg, idx) => (
                        <motion.div
                            key={idx}
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                            className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
                        >
                            {/* Avatar */}
                            <div className={`w-8 h-8 rounded-2xl flex items-center justify-center shrink-0 ${msg.role === 'user'
                                ? 'bg-blue-600'
                                : msg.isError ? 'bg-red-500' : 'bg-gradient-to-br from-blue-500 to-purple-600'
                                }`}>
                                {msg.role === 'user' ? <User size={14} className="text-white" /> : <Bot size={14} className="text-white" />}
                            </div>

                            {/* Bubble */}
                            <div className={`max-w-[85%] ${msg.role === 'user' ? 'items-end' : 'items-start'} flex flex-col gap-2`}>
                                {msg.content && (
                                    <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${msg.role === 'user'
                                        ? 'bg-blue-600 text-white rounded-tr-sm'
                                        : msg.isError
                                            ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-100 dark:border-red-900 rounded-tl-sm'
                                            : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 border border-gray-100 dark:border-gray-700 rounded-tl-sm shadow-sm'
                                        }`}>
                                        {msg.isML && (
                                            <div className="flex items-center gap-1.5 text-purple-600 dark:text-purple-400 text-xs font-bold mb-1">
                                                <Brain size={12} /> ML — {msg.mlType?.toUpperCase()}
                                            </div>
                                        )}
                                        <span className="whitespace-pre-line">{msg.content}</span>

                                        {/* Error suggestions */}
                                        {msg.isError && msg.suggestions?.length > 0 && (
                                            <div className="mt-2 space-y-1">
                                                {msg.suggestions.map((s, i) => (
                                                    <button key={i} onClick={() => handleSend(s)}
                                                        className="block text-xs text-blue-600 hover:underline text-left">
                                                        → {s}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Confidence + Reasoning Badge */}
                                {msg.role === 'bot' && !msg.isError && !msg.isDashboard && msg.confidence && (
                                    <div className="flex flex-wrap gap-2 items-center">
                                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${msg.confidence >= 0.8 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                            : msg.confidence >= 0.6 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                                                : 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                                            }`}>
                                            Confidence: {(msg.confidence * 100).toFixed(0)}%
                                        </span>
                                        {msg.reasoning && (
                                            <span className="text-[11px] text-gray-400 italic">{msg.reasoning}</span>
                                        )}
                                    </div>
                                )}

                                {/* KPI Row */}
                                {msg.kpis && <KPIRow kpis={msg.kpis} />}

                                {/* Chart */}
                                {msg.chart && msg.chart.chart_data?.length > 0 && (
                                    <div
                                        ref={el => { chartRefs.current[idx] = el; }}
                                        className="w-full bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden"
                                    >
                                        <ChartDisplay
                                            chartType={msg.chart.chart_type}
                                            data={msg.chart.chart_data}
                                            xKey={msg.chart.x_column}
                                            yKey={msg.chart.y_column}
                                            insights={msg.insights || []}
                                            reasoning={msg.reasoning}
                                            customColor={msg.customColor}
                                            mlResult={msg.mlResult}
                                        />
                                    </div>
                                )}

                                {/* Dashboard Charts */}
                                {msg.isDashboard && msg.dashboardCharts && (
                                    <div
                                        ref={el => { chartRefs.current[idx] = el; }}
                                        className="w-full space-y-3"
                                    >
                                        {msg.kpis && <KPIRow kpis={msg.kpis} />}
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            {msg.dashboardCharts.map((c, i) => (
                                                <div key={i} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
                                                    {c.title && <p className="text-[11px] font-bold text-gray-400 px-3 pt-2">{c.title}</p>}
                                                    <ChartDisplay
                                                        chartType={c.chart_type} data={c.data}
                                                        xKey={c.x_key} yKey={c.y_key}
                                                        insights={[]} reasoning="" customColor={null} compact={true}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Insights */}
                                {msg.insights?.length > 0 && !msg.isDashboard && (
                                    <div className="w-full bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-2xl border border-blue-100 dark:border-blue-900/30 px-4 py-3 space-y-1.5">
                                        <div className="flex items-center gap-1.5 text-xs font-bold text-blue-700 dark:text-blue-400 mb-1">
                                            <Lightbulb size={12} /> AI Insights
                                        </div>
                                        {msg.insights.slice(0, 5).map((insight, i) => (
                                            <p key={i} className="text-[12px] text-gray-700 dark:text-gray-300 leading-relaxed">{insight}</p>
                                        ))}
                                    </div>
                                )}

                                {/* Response time */}
                                {msg.responseTime && (
                                    <span className="text-[10px] text-gray-300">⚡ {msg.responseTime}s</span>
                                )}
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>

                {/* Loading Indicator */}
                {isLoading && (
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-start gap-3"
                    >
                        <div className="w-8 h-8 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                            <Bot size={14} className="text-white" />
                        </div>
                        <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                            <div className="flex items-center gap-2 text-gray-400 text-sm">
                                <Loader2 size={14} className="animate-spin text-blue-500" />
                                <span>Analyzing your data...</span>
                                <Sparkles size={12} className="text-purple-500 animate-pulse" />
                            </div>
                        </div>
                    </motion.div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Suggestions */}
            {messages.length <= 2 && !isLoading && (
                <div className="px-4 pb-2 flex flex-wrap gap-2">
                    {suggestions.map((s, i) => (
                        <motion.button
                            key={i}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: i * 0.05 }}
                            whileHover={{ scale: 1.04 }}
                            onClick={() => handleSend(s.replace(/^[^\s]+\s/, ''))}
                            className="text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 px-3 py-1.5 rounded-xl hover:border-blue-300 hover:text-blue-600 transition-all"
                        >
                            {s}
                        </motion.button>
                    ))}
                </div>
            )}

            {/* Input */}
            <div className="p-4 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 shrink-0">
                <form onSubmit={e => { e.preventDefault(); handleSend(); }} className="flex gap-2">
                    <input
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        placeholder="Ask anything about your data… (e.g. 'Predict next 6 months sales')"
                        disabled={isLoading}
                        className="flex-1 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 text-gray-800 dark:text-white placeholder-gray-400 transition-all disabled:opacity-50"
                    />
                    <motion.button
                        type="submit"
                        disabled={isLoading || !input.trim()}
                        whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                        className="flex items-center justify-center w-11 h-11 rounded-2xl bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg shadow-blue-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition-all shrink-0"
                    >
                        {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                    </motion.button>
                </form>
            </div>
        </div>
    );
};

export default Chat;
