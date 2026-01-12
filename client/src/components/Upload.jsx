import React, { useState } from 'react';
import axios from 'axios';
import { Upload as UploadIcon, FileText, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';

const Upload = ({ onUploadSuccess }) => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleFileChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        setLoading(true);
        setError(null);

        try {
            const res = await axios.post('http://localhost:8000/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            onUploadSuccess(res.data);
        } catch (err) {
            setError("Failed to upload file. Please try again.");
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col items-center justify-center h-full relative overflow-hidden">
            {/* Background Elements */}
            <div className="absolute top-0 left-0 w-64 h-64 bg-blue-400/20 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
            <div className="absolute bottom-0 right-0 w-96 h-96 bg-purple-400/20 rounded-full blur-3xl translate-x-1/3 translate-y-1/3 pointer-events-none" />

            <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.5, type: "spring" }}
                className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl p-10 rounded-3xl shadow-2xl border border-white/20 dark:border-gray-700 text-center max-w-md w-full relative z-10"
            >
                <motion.div
                    whileHover={{ scale: 1.1, rotate: 5 }}
                    className="bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900/30 dark:to-purple-900/30 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6 text-primary shadow-inner"
                >
                    <UploadIcon size={40} className="drop-shadow-sm" />
                </motion.div>

                <h2 className="text-3xl font-bold mb-3 text-gray-800 dark:text-white tracking-tight">Upload Dataset</h2>
                <p className="text-gray-500 dark:text-gray-400 mb-8 leading-relaxed">
                    Unlock insights from your data.<br />Supported formats: <span className="font-semibold text-gray-700 dark:text-gray-300">CSV, Excel</span>
                </p>

                <label className="block w-full cursor-pointer group">
                    <input type="file" className="hidden" onChange={handleFileChange} accept=".csv, .xlsx, .xls" />
                    <motion.div
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white font-bold py-4 rounded-xl shadow-lg shadow-blue-500/30 hover:shadow-blue-600/40 transition-all flex items-center justify-center gap-3"
                    >
                        {loading ? <Loader2 className="animate-spin" /> : <FileText size={20} />}
                        {loading ? "Processing..." : "Select File"}
                    </motion.div>
                </label>

                {error && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="text-red-500 mt-4 text-sm bg-red-50 dark:bg-red-900/20 py-2 px-4 rounded-lg border border-red-100 dark:border-red-900/30"
                    >
                        {error}
                    </motion.div>
                )}
            </motion.div>
        </div>
    );
};

export default Upload;
