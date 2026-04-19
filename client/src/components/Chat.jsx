import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Send, Loader2, Bot, User, Sparkles, Download,
    Brain, TrendingUp, AlertCircle, Lightbulb, BarChart2, FileText
} from 'lucide-react';
import ChartDisplay from './ChartDisplay';
import { InsightsPanel } from './KPICard';
import API from '../config';

const Chat = ({ currentFile, initialMessages = null }) => {
    const [messages, setMessages] = useState(() => {
        if (initialMessages?.length > 0) return initialMessages;
        return [{
            role: 'bot',
            content: `Hello! I've loaded **${currentFile?.filename}** (${currentFile?.stats?.rows?.toLocaleString() ?? '?'} rows). Ask me anything about your data!\n\n**Try:** "Show sales trend" · "Predict next 6 months" · "Cluster customers" · "Create dashboard"`,
            isWelcome: true,
        }];
    });
    const [suggestions, setSuggestions] = useState([]);
    const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const messagesEndRef = useRef(null);
    const chartRefs = useRef({});

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Load DB history and AI Suggestions on mount/file change
    useEffect(() => {
        if (currentFile?.file_id) {
            if (!initialMessages) loadHistory();
            fetchSuggestions();
        }
    }, [currentFile?.file_id]);

    const fetchSuggestions = async () => {
        setIsLoadingSuggestions(true);
        try {
            const res = await axios.get(`${API}/suggestions/${currentFile.file_id}`);
            setSuggestions(res.data || []);
        } catch (e) {
            console.warn('Suggestions fetch failed:', e);
        } finally {
            setIsLoadingSuggestions(false);
        }
    };

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
                    insights: data.insights || [],
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
            doc.setFillColor(79, 70, 229);
            doc.rect(0, 0, PAGE_W, 28, 'F');
            doc.setFillColor(13, 148, 136);
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
                    doc.setFillColor(238, 242, 255);
                    doc.roundedRect(MARGIN, y, CONTENT_W, 10, 2, 2, 'F');
                    doc.setFont('helvetica', 'italic');
                    doc.setFontSize(8);
                    doc.setTextColor(99, 102, 241);
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
                    doc.setTextColor(79, 70, 229);
                    doc.text('YOU', MARGIN, y + 4);
                    doc.setTextColor(0, 0, 0);

                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(9.5);
                    const userLines = doc.splitTextToSize(msg.content, CONTENT_W - 10);
                    const userH = userLines.length * 5.5 + 6;
                    checkPage(userH + 4);
                    doc.setFillColor(79, 70, 229);
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
                    doc.setTextColor(124, 58, 237);
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

                    // Reasoning (formerly in confidence section)
                    if (msg.reasoning) {
                        checkPage(8);
                        doc.setFont('helvetica', 'italic');
                        doc.setFontSize(7);
                        doc.setTextColor(120, 120, 130);
                        const rLines = doc.splitTextToSize(msg.reasoning, CONTENT_W - 10);
                        doc.text(rLines[0] ?? '', MARGIN, y + 3.8);
                        doc.setTextColor(0, 0, 0);
                        y += 6;
                    }

                    // KPIs removed — insights rendered below instead

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
                        doc.setFillColor(238, 242, 255);
                        const insightLines = msg.insights.slice(0, 5).flatMap(ins =>
                            doc.splitTextToSize(`• ${ins}`, CONTENT_W - 10)
                        );
                        const insH = insightLines.length * 5 + 8;
                        checkPage(insH + 4);
                        doc.roundedRect(MARGIN, y, CONTENT_W - 10, insH, 2, 2, 'F');
                        doc.setFont('helvetica', 'bold');
                        doc.setFontSize(7.5);
                        doc.setTextColor(67, 56, 202);
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
        <div className="flex flex-col h-full bg-[#020617] relative">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-white/5 bg-slate-900/40 relative z-10 backdrop-blur-md">
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-[0_0_15px_rgba(16,185,129,0.2)]">
                        <BarChart2 size={20} className="text-slate-950" />
                    </div>
                    <div>
                        <h2 className="text-sm font-black text-white uppercase tracking-wider">{currentFile?.filename}</h2>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-none bg-white/5 px-2 py-0.5 rounded-md border border-white/5">
                                {currentFile?.stats?.rows?.toLocaleString()} Records
                            </span>
                            <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest leading-none bg-emerald-500/5 px-2 py-0.5 rounded-md border border-emerald-500/10">
                                {currentFile?.score}% Quality
                            </span>
                        </div>
                    </div>
                </div>
                <motion.button
                    whileHover={{ scale: 1.05, y: -2 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={exportPDF}
                    disabled={isExporting}
                    className="flex items-center gap-2.5 bg-white/5 hover:bg-emerald-500/10 border border-white/5 hover:border-emerald-500/20 text-slate-400 hover:text-emerald-400 text-[10px] font-black uppercase tracking-widest px-5 py-3 rounded-xl transition-all disabled:opacity-60"
                >
                    {isExporting
                        ? <><Loader2 size={13} className="animate-spin" /> EXPORTING…</>
                        : <><Download size={14} /> EXPORT AUDIT</>
                    }
                </motion.button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 scrollbar-premium">
                <AnimatePresence initial={false}>
                    {messages.map((msg, idx) => (
                        <motion.div
                            key={idx}
                            initial={{ opacity: 0, y: 15 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                            className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
                        >
                            {/* Avatar */}
                            <div className={`w-9 h-9 rounded-[14px] flex items-center justify-center shrink-0 shadow-lg ${msg.role === 'user'
                                ? 'bg-slate-800 border border-white/5'
                                : msg.isError ? 'bg-red-500/20 border border-red-500/20' : 'bg-gradient-to-br from-emerald-400 to-teal-500 text-slate-950'
                                }`}>
                                {msg.role === 'user' ? <User size={16} className="text-slate-400" /> : <Bot size={18} className={msg.isError ? 'text-red-400' : 'text-slate-950'} />}
                            </div>

                            {/* Bubble */}
                            <div className={`max-w-[85%] ${msg.role === 'user' ? 'items-end' : 'items-start'} flex flex-col gap-2.5`}>
                                {msg.role === 'user' && (
                                    <span className="text-[9px] font-black text-slate-600 uppercase tracking-[0.2em] mr-1">Operator Prompt</span>
                                )}
                                {msg.role === 'bot' && (
                                    <span className="text-[9px] font-black text-emerald-500/60 uppercase tracking-[0.2em] ml-1">AI Response Intelligence</span>
                                )}
                                
                                {msg.content && (
                                    <div className={`px-5 py-4 rounded-3xl text-[13px] leading-relaxed font-medium ${msg.role === 'user'
                                        ? 'bg-emerald-500 text-slate-950 rounded-tr-sm shadow-[0_10px_30px_rgba(16,185,129,0.1)]'
                                        : msg.isError
                                            ? 'bg-red-500/10 text-red-400 border border-red-500/20 rounded-tl-sm'
                                            : 'bg-slate-900/40 text-slate-200 border border-white/5 rounded-tl-sm backdrop-blur-md'
                                        }`}>
                                        {msg.isML && (
                                            <div className="flex items-center gap-2 text-emerald-400 text-[10px] font-black uppercase tracking-[0.2em] mb-2 px-2 py-1 bg-emerald-500/10 rounded-lg inline-flex">
                                                <Brain size={12} /> Neural ML — {msg.mlType}
                                            </div>
                                        )}
                                        <span className="whitespace-pre-line block">{msg.content}</span>

                                        {/* Error suggestions */}
                                        {msg.isError && msg.suggestions?.length > 0 && (
                                            <div className="mt-4 space-y-2 border-t border-red-500/10 pt-3">
                                                {msg.suggestions.map((s, i) => (
                                                    <button key={i} onClick={() => handleSend(s)}
                                                        className="block text-[11px] font-bold text-red-400/80 hover:text-red-400 hover:underline text-left">
                                                        → {s}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {msg.role === 'bot' && !msg.isError && !msg.isDashboard && msg.reasoning && (
                                    <div className="flex items-center gap-2 px-1">
                                        <Sparkles size={10} className="text-emerald-500/40" />
                                        <span className="text-[10px] font-bold text-slate-500 italic uppercase tracking-wider">{msg.reasoning}</span>
                                    </div>
                                )}

                                {/* Chart */}
                                {msg.chart && msg.chart.chart_data?.length > 0 && (
                                    <div
                                        ref={el => { chartRefs.current[idx] = el; }}
                                        className="w-full glass-panel rounded-[2.5rem] border-white/5 shadow-2xl overflow-hidden mt-2"
                                    >
                                        <ChartDisplay
                                            fileId={currentFile.file_id}
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
                                        className="w-full space-y-4 mt-2"
                                    >
                                        {msg.insights?.length > 0 && <InsightsPanel insights={msg.insights} />}
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            {msg.dashboardCharts.map((c, i) => (
                                                <div key={i} className="glass-panel rounded-[2rem] border-white/5 shadow-xl overflow-hidden bg-slate-900/40">
                                                    {c.title && <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-6 pt-5 leading-none">{c.title}</p>}
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
                                    <div className="w-full bg-emerald-500/5 rounded-[2rem] border border-emerald-500/10 px-6 py-5 space-y-3 mt-1">
                                        <div className="flex items-center gap-2 text-[10px] font-black text-emerald-400 uppercase tracking-[0.2em] mb-1">
                                            <Lightbulb size={14} /> Intelligence Audit
                                        </div>
                                        {msg.insights.slice(0, 5).map((insight, i) => (
                                            <div key={i} className="flex gap-3 items-start">
                                                <div className="w-1 h-1 rounded-full bg-emerald-500/40 mt-1.5 shrink-0" />
                                                <p className="text-[12px] font-medium text-slate-300 leading-relaxed">{insight}</p>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Response time */}
                                {msg.responseTime && (
                                    <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest pl-1 mt-1 flex items-center gap-1.5">
                                        <TrendingUp size={10} /> Neural Latency: {msg.responseTime}s
                                    </span>
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
                        className="flex items-start gap-4"
                    >
                        <div className="w-9 h-9 rounded-[14px] bg-slate-900 border border-white/5 flex items-center justify-center">
                            <Bot size={18} className="text-emerald-500 animate-pulse" />
                        </div>
                        <div className="bg-slate-900/40 border border-white/5 backdrop-blur-md rounded-3xl rounded-tl-sm px-6 py-4 shadow-xl">
                            <div className="flex items-center gap-3 text-slate-400 text-[12px] font-bold uppercase tracking-widest">
                                <Loader2 size={16} className="animate-spin text-emerald-500" />
                                <span>Scanning Data Patterns...</span>
                                <Sparkles size={14} className="text-emerald-500/30 animate-pulse" />
                            </div>
                        </div>
                    </motion.div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Suggestions */}
            {!isLoading && suggestions.length > 0 && (
                <div className="px-6 pb-4 flex flex-wrap gap-2 relative z-10 bg-gradient-to-t from-[#020617] via-[#020617] to-transparent pt-6">
                    {isLoadingSuggestions ? (
                        <div className="flex gap-2">
                            {[1, 2, 3].map(i => (
                                <div key={i} className="h-9 w-32 animate-pulse bg-white/5 rounded-xl border border-white/5" />
                            ))}
                        </div>
                    ) : (
                        suggestions.map((s, i) => (
                            <motion.button
                                key={i}
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: i * 0.05 }}
                                whileHover={{ scale: 1.05, y: -2 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={() => handleSend(s)}
                                className="text-[10px] font-black uppercase tracking-widest bg-white/5 border border-white/5 text-slate-400 px-4 py-2.5 rounded-xl hover:border-emerald-500/40 hover:text-emerald-400 hover:bg-emerald-500/5 transition-all shadow-lg backdrop-blur-sm"
                            >
                                {s}
                            </motion.button>
                        ))
                    )}
                </div>
            )}

            {/* Input */}
            <div className="p-6 bg-slate-900/40 border-t border-white/5 shrink-0 relative z-10 backdrop-blur-xl">
                <form onSubmit={e => { e.preventDefault(); handleSend(); }} className="flex gap-3 max-w-5xl mx-auto">
                    <div className="relative flex-1 group">
                        <div className="absolute inset-0 bg-emerald-500/5 rounded-[2rem] blur-xl opacity-0 group-focus-within:opacity-100 transition-opacity" />
                        <input
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            placeholder="INITIALIZE NEURAL QUERY..."
                            disabled={isLoading}
                            className="w-full text-xs font-bold bg-slate-950 border border-white/5 rounded-[1.5rem] px-6 py-4.5 focus:outline-none focus:ring-1 focus:ring-emerald-500/30 focus:border-emerald-500/40 text-white placeholder-slate-600 tracking-widest transition-all disabled:opacity-50 relative z-10"
                        />
                    </div>
                    <motion.button
                        type="submit"
                        disabled={isLoading || !input.trim()}
                        whileHover={{ scale: 1.05, y: -2 }}
                        whileTap={{ scale: 0.95 }}
                        className="flex items-center justify-center w-14 h-14 rounded-[1.5rem] bg-emerald-500 text-slate-950 shadow-[0_10px_30px_rgba(16,185,129,0.2)] disabled:opacity-40 disabled:cursor-not-allowed transition-all shrink-0 relative z-10"
                    >
                        {isLoading ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
                    </motion.button>
                </form>
            </div>
        </div>
    );
};

export default Chat;
