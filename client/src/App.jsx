
import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import Upload from './components/Upload';
import Chat from './components/Chat';
import DataPreview from './components/DataPreview';
import { ThemeProvider } from './context/ThemeContext';

function App() {
  const [currentFile, setCurrentFile] = useState(null);
  const [view, setView] = useState("upload"); // upload | preview | dashboard
  const [history, setHistory] = useState([
    { title: "Sample Analysis" }
  ]);

  const handleNewChat = () => {
    setCurrentFile(null);
    setView("upload");
  };

  const handleUploadSuccess = (data) => {
    setCurrentFile(data);
    setView("preview"); // Switch to preview first
    setHistory(prev => [{ title: `Analysis of ${data.filename}` }, ...prev]);
  };

  return (
    <ThemeProvider>
      <div className="flex h-screen bg-gray-50 dark:bg-gray-900 dark:text-gray-100 transition-colors duration-200">
        <Sidebar
          setView={setView}
          currentFile={currentFile}
          onNewChat={handleNewChat}
          history={history}
          view={view}
        />

        <main className="flex-1 p-6 overflow-hidden flex flex-col">
          {view === "upload" && (
            <Upload onUploadSuccess={handleUploadSuccess} />
          )}

          {view === "preview" && currentFile && (
            <DataPreview
              currentFile={currentFile}
              onContinue={() => setView("dashboard")}
            />
          )}

          {view === "dashboard" && currentFile && (
            <Chat currentFile={currentFile} />
          )}
        </main>
      </div>
    </ThemeProvider>
  );
}

export default App;
