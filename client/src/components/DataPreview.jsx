import React from 'react';
import { FileSpreadsheet } from 'lucide-react';
import { motion } from 'framer-motion';

const DataPreview = ({ currentFile, onContinue }) => {
    if (!currentFile) return null;

    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: { staggerChildren: 0.1 }
        }
    };

    const itemVariants = {
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0 }
    };

    return (
        <motion.div
            initial="hidden"
            animate="visible"
            variants={containerVariants}
            className="flex flex-col h-full bg-white dark:bg-zinc-900 rounded-2xl shadow-xl dark:shadow-2xl border border-zinc-200 dark:border-zinc-700 overflow-hidden transition-all duration-300"
        >
            {/* Header Stats */}
            <motion.div variants={itemVariants} className="p-6 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/50 grid grid-cols-1 md:grid-cols-4 gap-4">
                <StatCard label="Total Rows" value={currentFile.stats?.rows} delay={0} />
                <StatCard label="Total Columns" value={currentFile.stats?.columns} delay={0.1} />
                <StatCard label="Missing Values" value={currentFile.stats?.missing_count} color={currentFile.stats?.missing_count > 0 ? "text-orange-500" : "text-green-600"} delay={0.2} />
                <StatCard label="Quality Score" value={`${currentFile.score}/100`} color="text-indigo-600 dark:text-indigo-400" delay={0.3} />
            </motion.div>

            {/* Data Table */}
            <motion.div variants={itemVariants} className="flex-1 overflow-auto p-0 scrollbar-thin scrollbar-thumb-zinc-200 dark:scrollbar-thumb-zinc-700">
                {(!currentFile.preview || currentFile.preview.length === 0) ? (
                    <div className="flex flex-col items-center justify-center h-full py-16 text-zinc-400 dark:text-zinc-500">
                        <FileSpreadsheet size={40} className="mb-3 opacity-40" />
                        <p className="font-semibold text-sm">No preview available</p>
                        <p className="text-xs mt-1">Upload a new file or start a chat to see data here.</p>
                    </div>
                ) : (
                    <table className="w-full text-sm text-left text-zinc-500 dark:text-zinc-400">
                        <thead className="text-xs text-zinc-700 dark:text-zinc-300 uppercase bg-zinc-100 dark:bg-zinc-800 sticky top-0 shadow-sm z-10">
                            <tr>
                                {(currentFile.columns || []).map((col, idx) => (
                                    <th key={idx} className="px-6 py-3 border-b dark:border-zinc-600">{col}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {(currentFile.preview || []).map((row, rIdx) => (
                                <motion.tr
                                    key={rIdx}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: rIdx * 0.05 }}
                                    className="bg-white dark:bg-zinc-900 border-b dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                                >
                                    {(currentFile.columns || []).map((col, cIdx) => (
                                        <td key={cIdx} className="px-6 py-4 truncate max-w-xs block-inline">
                                            {row[col] !== null ? row[col] : <span className="text-zinc-300 dark:text-zinc-600 italic">null</span>}
                                        </td>
                                    ))}
                                </motion.tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </motion.div>

            {/* Footer Action */}
            <motion.div variants={itemVariants} className="p-4 border-t border-zinc-100 dark:border-zinc-800 flex justify-end bg-white dark:bg-zinc-900 z-10">
                <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={onContinue}
                    className="bg-gradient-to-r from-indigo-600 to-teal-600 hover:from-indigo-700 hover:to-teal-700 text-white px-8 py-2.5 rounded-xl font-bold shadow-lg shadow-indigo-500/25 transition-all"
                >
                    Continue to Chat
                </motion.button>
            </motion.div>
        </motion.div>
    );
};

const StatCard = ({ label, value, color = "text-zinc-900 dark:text-white", delay }) => (
    <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: delay + 0.2 }}
        whileHover={{ y: -5 }}
        className="bg-white dark:bg-zinc-900 p-4 rounded-xl border border-zinc-200 dark:border-zinc-700 shadow-sm hover:shadow-md transition-all duration-300"
    >
        <p className="text-xs text-zinc-500 dark:text-zinc-400 uppercase font-semibold mb-1">{label}</p>
        <p className={`text-2xl font-bold ${color}`}>{value}</p>
    </motion.div>
);

export default DataPreview;
