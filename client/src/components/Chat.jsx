import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { Send, Bot, User, Sparkles, Download } from 'lucide-react';
import ChartDisplay from './ChartDisplay';
import { motion, AnimatePresence } from 'framer-motion';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

const Chat = ({ currentFile }) => {
    const [messages, setMessages] = useState([
        { role: 'system', content: `Hello! I've analyzed **${currentFile?.filename}**. Ask me anything about your data!` }
    ]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(scrollToBottom, [messages]);

    const handleExportPDF = async () => {
        const doc = new jsPDF();
        let yOffset = 20;

        doc.setFontSize(20);
        doc.text(`Analysis Report: ${currentFile.filename}`, 20, yOffset);
        yOffset += 15;

        doc.setFontSize(12);
        doc.text(`Generated on: ${new Date().toLocaleString()}`, 20, yOffset);
        yOffset += 20;

        for (const msg of messages) {
            if (msg.role === 'system' && !msg.isError) {
                // Add Text
                const textLines = doc.splitTextToSize(`${msg.role === 'user' ? 'User' : 'System'}: ${msg.content}`, 170);

                if (yOffset + (textLines.length * 7) > 280) {
                    doc.addPage();
                    yOffset = 20;
                }

                doc.text(textLines, 20, yOffset);
                yOffset += (textLines.length * 7) + 5;

                // Add Insights
                if (msg.insights && msg.insights.length > 0) {
                    msg.insights.forEach(insight => {
                        const insightLines = doc.splitTextToSize(`• ${insight}`, 160);
                        if (yOffset + (insightLines.length * 7) > 280) {
                            doc.addPage();
                            yOffset = 20;
                        }
                        doc.text(insightLines, 25, yOffset);
                        yOffset += (insightLines.length * 7) + 2;
                    });
                    yOffset += 5;
                }

                // Add Chart Snapshot (Placeholder logic - requires careful DOM selection)
                // Real implementation would find chart in DOM. For simplicity, we skip strictly grabbing chart images from chat history in this version 
                // unless we implement refs for every message.
                // A better approach for version 1 is to just print the textual summary.
                // However, we can improve this later.
            }
        }

        doc.save(`${currentFile.filename}_report.pdf`);
    };

    const handleSend = async (e) => {
        e.preventDefault();
        if (!input.trim()) return;

        const userMsg = { role: 'user', content: input };
        setMessages(prev => [...prev, userMsg]);
        setInput("");
        setLoading(true);

        try {
            const res = await axios.post('http://localhost:8000/query', {
                prompt: userMsg.content,
                file_id: currentFile.file_id
            });

            if (res.data.error) {
                const errorMsg = {
                    role: 'system',
                    content: res.data.message,
                    suggestions: res.data.suggestions,
                    isError: true
                };
                setMessages(prev => [...prev, errorMsg]);
            } else {
                const botMsg = {
                    role: 'system',
                    content: res.data.summary,
                    insights: res.data.insights || [],
                    chart: res.data.chart_data?.length > 0 ? res.data : null,
                    customColor: res.data.custom_color
                };
                setMessages(prev => [...prev, botMsg]);
            }
        } catch (err) {
            console.error("Query Error:", err);
            const detail = err.response?.data?.detail || err.message || "Unknown error";
            setMessages(prev => [...prev, {
                role: 'system',
                content: `Error: ${detail}. Please try uploading the dataset again or check your server connection.`,
                isError: true
            }]);
        } finally {
            setLoading(false);
        }
    };

    const handleSuggestionClick = (suggestion) => {
        setInput(suggestion);
    };

    return (
        <div className="flex flex-col h-full bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden transition-colors">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-white dark:bg-gray-800 sticky top-0 z-10">
                <div className="flex items-center gap-2">
                    <Sparkles className="text-primary" size={20} />
                    <h2 className="font-bold text-gray-800 dark:text-white">{currentFile.filename}</h2>
                </div>
                <button
                    onClick={handleExportPDF}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg transition-colors border border-gray-200 dark:border-gray-600"
                >
                    <Download size={16} />
                    Export Report
                </button>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50 dark:bg-gray-900/50">
                {messages.map((msg, idx) => (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        key={idx}
                        className={`flex items-start gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                    >
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${msg.role === 'user' ? 'bg-primary text-white' : msg.isError ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' : 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'}`}>
                            {msg.role === 'user' ? <User size={16} /> : <Sparkles size={16} />}
                        </div>

                        <div className={`max-w-[80%] rounded-2xl p-4 shadow-sm ${msg.role === 'user' ? 'bg-primary text-white rounded-tr-none' : 'bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-tl-none'}`}>
                            {/* Ensure text is readable in both modes. For user: white. For system: gray-800 (light) / gray-100 (dark) */}
                            <p className={`whitespace-pre-wrap ${msg.role === 'system' ? 'text-gray-800 dark:text-gray-100' : 'text-white'}`}>{msg.content}</p>

                            {msg.suggestions && (
                                <div className="mt-3 flex flex-wrap gap-2">
                                    <p className="w-full text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Did you mean:</p>
                                    {msg.suggestions.map((s, i) => (
                                        <button
                                            key={i}
                                            onClick={() => handleSuggestionClick(s)}
                                            className="text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 px-3 py-1 rounded-full hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
                                        >
                                            {s}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {msg.chart && (
                                <ChartDisplay
                                    chartType={msg.chart.intent.chart_type}
                                    data={msg.chart.chart_data}
                                    xKey={msg.chart.intent.x_column}
                                    yKey={msg.chart.intent.y_column}
                                    insights={msg.insights}
                                    reasoning={msg.chart.intent.reasoning}
                                    customColor={msg.customColor}
                                />
                            )}
                        </div>
                    </motion.div>
                ))}
                {loading && (
                    <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-600 dark:text-green-400">
                            <Bot size={16} />
                        </div>
                        <div className="bg-white dark:bg-gray-800 px-4 py-3 rounded-2xl rounded-tl-none border border-gray-100 dark:border-gray-700">
                            <div className="flex gap-1">
                                <span className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce"></span>
                                <span className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce delay-100"></span>
                                <span className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce delay-200"></span>
                            </div>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 bg-white dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700 relative z-20">
                <form onSubmit={handleSend} className="relative flex items-center">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Ask about your data (e.g., 'Show trend of profit over time')..."
                        className="w-full pl-5 pr-14 py-4 bg-gray-50 dark:bg-gray-900 border-none rounded-xl focus:ring-2 focus:ring-primary/20 focus:bg-white dark:focus:bg-gray-800 outline-none transition-all placeholder:text-gray-400 dark:placeholder:text-gray-500 text-gray-800 dark:text-white"
                    />
                    <button
                        type="submit"
                        disabled={!input.trim() || loading}
                        className="absolute right-2 p-2 bg-primary text-white rounded-lg disabled:opacity-50 hover:bg-blue-600 transition-colors"
                    >
                        <Send size={20} />
                    </button>
                </form>
            </div>
        </div>
    );
};

export default Chat;
