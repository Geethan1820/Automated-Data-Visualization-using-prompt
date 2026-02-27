import React, { useState } from 'react';
import axios from 'axios';
import Sidebar from './components/Sidebar';
import Upload from './components/Upload';
import DataPreview from './components/DataPreview';
import Chat from './components/Chat';
import Dashboard from './components/Dashboard';
import AuthForm from './components/AuthForm';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';

function AppContent() {
  const { user } = useAuth();
  const [currentFile, setCurrentFile] = useState(null);
  const [view, setView] = useState('upload'); // upload | preview | chat | dashboard

  const handleUploadSuccess = (data) => {
    setCurrentFile({
      file_id: data.file_id,
      filename: data.filename,
      columns: data.columns,
      score: data.score,
      stats: data.stats,
      quality_report: data.quality_report,
      column_details: data.column_details,
      preview: data.preview,
    });
    setView('preview');
  };

  const handleNewChat = () => {
    setCurrentFile(null);
    setView('upload');
  };

  const handleLoadSession = async (session) => {
    // Restore a previous session from sidebar history
    try {
      // Restore context on server
      await axios.post('http://localhost:8000/restore-context', { file_id: session.id });
    } catch (e) {
      console.warn('Context restore failed:', e.message);
    }

    setCurrentFile({
      file_id: session.id,
      filename: session.filename,
      columns: [],
      score: session.quality_score,
      stats: { rows: session.rows, columns: session.columns },
      quality_report: {},
    });
    setView('chat');
  };

  const handleDeleteSession = (deletedFileId) => {
    // If the deleted session was the active one, reset to upload screen
    if (currentFile?.file_id === deletedFileId) {
      setCurrentFile(null);
      setView('upload');
    }
  };

  // Show auth if not logged in  
  if (!user) {
    return <AuthForm />;
  }

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-950 overflow-hidden">
      <Sidebar
        setView={setView}
        currentFile={currentFile}
        onNewChat={handleNewChat}
        onLoadSession={handleLoadSession}
        onDeleteSession={handleDeleteSession}
        view={view}
      />

      <main className="flex-1 overflow-hidden flex flex-col min-w-0">
        <AnimatePresence mode="wait">
          <motion.div
            key={view + (currentFile?.file_id || '')}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex-1 overflow-hidden flex flex-col"
          >
            {view === 'upload' && (
              <div className="flex-1 flex items-center justify-center p-8">
                <Upload onUploadSuccess={handleUploadSuccess} />
              </div>
            )}
            {view === 'preview' && currentFile && (
              <div className="flex-1 overflow-auto p-6">
                <DataPreview
                  currentFile={currentFile}
                  onContinue={() => setView('chat')}
                />
              </div>
            )}
            {view === 'chat' && currentFile && (
              <Chat currentFile={currentFile} />
            )}
            {view === 'dashboard' && currentFile && (
              <div className="flex-1 overflow-auto p-4">
                <Dashboard currentFile={currentFile} />
              </div>
            )}
            {view === 'dashboard' && !currentFile && (
              <div className="flex-1 flex items-center justify-center text-gray-400">
                <div className="text-center space-y-2">
                  <p className="text-4xl">📊</p>
                  <p className="font-semibold text-gray-600 dark:text-gray-300">No dataset loaded</p>
                  <button onClick={() => setView('upload')} className="text-sm text-blue-500 hover:underline">
                    Upload a CSV/Excel file to get started
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
