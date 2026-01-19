import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface DigestViewProps {
  markdown: string;
  isLoading?: boolean;
  onReset: () => void;
}

const DigestView: React.FC<DigestViewProps> = ({ markdown, isLoading = false, onReset }) => {
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<'preview' | 'raw'>('preview');
  const [progress, setProgress] = useState(0);

  // Simulated progress bar logic
  React.useEffect(() => {
    if (isLoading) {
      setProgress(0);
      const interval = setInterval(() => {
        setProgress(old => {
          if (old >= 90) return old; // Stall at 90%
          // Logarithmic-ish slowdown: faster at start, slower at end
          const remaining = 90 - old;
          const step = Math.max(0.5, remaining / 10); 
          return old + step;
        });
      }, 500); // Update every 500ms
      return () => clearInterval(interval);
    } else {
      setProgress(100);
    }
  }, [isLoading]);

  const handleCopy = async () => {
    if (isLoading) return;
    
    try {
      // Primary method: Clipboard API
      if (navigator.clipboard && navigator.clipboard.writeText) {
         await navigator.clipboard.writeText(markdown);
         setCopied(true);
      } else {
         throw new Error('Clipboard API unavailable');
      }
    } catch (err) {
      // Fallback method: textarea hack
      try {
        const textArea = document.createElement("textarea");
        textArea.value = markdown;
        
        // Ensure it's not visible but part of the DOM
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        textArea.style.top = "0";
        document.body.appendChild(textArea);
        
        textArea.focus();
        textArea.select();
        
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        
        if (successful) {
           setCopied(true);
        } else {
           throw new Error('Fallback copy failed');
        }
      } catch (fallbackErr) {
        console.error('Failed to copy text: ', fallbackErr);
        alert("Failed to copy to clipboard. Please select the text and copy manually.");
      }
    }
    
    if (copied) {
       setTimeout(() => setCopied(false), 2000);
    }
  };

  // Effect to reset 'copied' state after delay (moved out of function for cleaner state logic)
  React.useEffect(() => {
     if (copied) {
        const timer = setTimeout(() => setCopied(false), 2000);
        return () => clearTimeout(timer);
     }
  }, [copied]);

  const handleDownload = () => {
    if (isLoading) return;
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'digest.md';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden flex flex-col h-full max-h-[85vh]">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
        <div className="flex items-center space-x-4">
          <div className="flex bg-slate-200 p-1 rounded-lg">
            <button
              onClick={() => setViewMode('preview')}
              disabled={isLoading}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                viewMode === 'preview' 
                  ? 'bg-white text-slate-900 shadow-sm' 
                  : 'text-slate-500 hover:text-slate-700'
              } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              Preview
            </button>
            <button
              onClick={() => setViewMode('raw')}
              disabled={isLoading}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                viewMode === 'raw' 
                  ? 'bg-white text-slate-900 shadow-sm' 
                  : 'text-slate-500 hover:text-slate-700'
              } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              Raw Source
            </button>
          </div>
          <span className="text-xs text-slate-400 hidden sm:inline-block">
            {isLoading ? 'Analyzing paper...' : 'Markdown generated for Obsidian'}
          </span>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={handleDownload}
            disabled={isLoading}
            className={`flex items-center px-4 py-2 text-sm font-medium rounded-lg transition-all bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 hover:border-slate-400 ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
            title="Download as Markdown"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download
          </button>

          <button
            onClick={handleCopy}
            disabled={isLoading}
            className={`flex items-center px-4 py-2 text-sm font-medium rounded-lg transition-all ${
              copied 
                ? 'bg-green-100 text-green-700 border border-green-200' 
                : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 hover:border-slate-400'
            } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {copied ? (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Copied
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                </svg>
                Copy Markdown
              </>
            )}
          </button>
          
          <button
            onClick={onReset}
            disabled={isLoading}
            className={`p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
            title="Analyze another paper"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto bg-white p-8 prose-custom relative">
        {isLoading ? (
          <div className="animate-pulse space-y-6 max-w-3xl">
            <div className="h-10 bg-slate-200 rounded w-3/4"></div>
            
            <div className="space-y-3 pt-4">
               <div className="h-4 bg-slate-200 rounded w-1/4"></div>
               <div className="h-24 bg-slate-100 rounded-lg border border-slate-200"></div>
            </div>

             <div className="space-y-3 pt-4">
               <div className="h-6 bg-slate-200 rounded w-1/3"></div>
               <div className="space-y-2">
                 <div className="h-4 bg-slate-200 rounded w-full"></div>
                 <div className="h-4 bg-slate-200 rounded w-5/6"></div>
                 <div className="h-4 bg-slate-200 rounded w-4/6"></div>
               </div>
            </div>

            <div className="space-y-3 pt-4">
               <div className="h-6 bg-slate-200 rounded w-1/4"></div>
               <div className="grid grid-cols-2 gap-4">
                 <div className="h-20 bg-slate-100 rounded"></div>
                 <div className="h-20 bg-slate-100 rounded"></div>
               </div>
            </div>
            
            <div className="absolute inset-0 flex items-center justify-center bg-white/50 backdrop-blur-[1px]">
               <div className="flex flex-col items-center p-6 bg-white rounded-xl shadow-lg border border-slate-100 w-64">
                  <div className="w-10 h-10 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin mb-3"></div>
                  <p className="text-slate-800 font-medium">Analyzing Research Paper...</p>
                  <p className="text-slate-500 text-sm mt-1 mb-3">Extracting methods and results</p>
                  
                  {/* Progress Bar */}
                  <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                    <div 
                      className="bg-primary-600 h-2.5 rounded-full transition-all duration-500 ease-out" 
                      style={{ width: `${progress}%` }}
                    ></div>
                  </div>
                  <p className="text-xs text-slate-400 mt-2">{Math.round(progress)}%</p>
               </div>
            </div>
          </div>
        ) : viewMode === 'preview' ? (
          <article className="prose prose-slate max-w-none prose-headings:font-serif prose-headings:text-slate-800 prose-p:text-slate-600 prose-a:text-primary-600 hover:prose-a:text-primary-700 prose-blockquote:border-l-primary-500 prose-blockquote:bg-slate-50 prose-blockquote:py-1 prose-blockquote:px-4 prose-th:bg-slate-100 prose-th:p-3 prose-td:p-3">
             <ReactMarkdown remarkPlugins={[remarkGfm]}>
               {markdown}
             </ReactMarkdown>
          </article>
        ) : (
          <textarea
            className="w-full h-full font-mono text-sm text-slate-700 resize-none outline-none"
            value={markdown}
            readOnly
          />
        )}
      </div>
    </div>
  );
};

export default DigestView;