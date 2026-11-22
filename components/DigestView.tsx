import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface DigestViewProps {
  markdown: string;
  filename?: string;
  modelUsed?: string;
  fallbackFrom?: string;
  isLoading?: boolean;
  onReset: () => void;
}

const toMarkdownFilename = (filename?: string): string => {
  if (!filename) return 'digest.md';
  const trimmed = filename.trim();
  if (!trimmed) return 'digest.md';
  return trimmed.toLowerCase().endsWith('.pdf')
    ? `${trimmed.slice(0, -4)}.md`
    : trimmed.toLowerCase().endsWith('.md')
      ? trimmed
      : `${trimmed}.md`;
};

const DigestView: React.FC<DigestViewProps> = ({
  markdown,
  filename,
  modelUsed,
  fallbackFrom,
  isLoading = false,
  onReset,
}) => {
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<'preview' | 'raw'>('preview');
  const [progress, setProgress] = useState(0);

  // Simulated progress bar logic
  useEffect(() => {
    if (isLoading) {
      setProgress(0);
      const interval = setInterval(() => {
        setProgress((old) => {
          if (old >= 90) return old;
          const remaining = 90 - old;
          const step = Math.max(0.5, remaining / 10);
          return old + step;
        });
      }, 500);
      return () => clearInterval(interval);
    } else {
      setProgress(100);
    }
  }, [isLoading]);

  // Reset copied badge after 2 seconds
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const handleCopy = async () => {
    if (isLoading) return;

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(markdown);
        setCopied(true);
      } else {
        throw new Error('Clipboard API unavailable');
      }
    } catch {
      try {
        const textArea = document.createElement('textarea');
        textArea.value = markdown;
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        textArea.style.top = '0';
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
        console.error('Failed to copy text:', fallbackErr);
        alert('Failed to copy to clipboard. Please switch to Raw Source and copy manually.');
      }
    }
  };

  const handleDownload = () => {
    if (isLoading) return;
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = toMarkdownFilename(filename);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden flex flex-col h-full max-h-[85vh]">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-slate-100 bg-slate-50/50">
        <div className="flex items-center flex-wrap gap-3">
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

          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="hidden sm:inline-block">
              {isLoading ? 'Analyzing paper...' : 'Markdown generated for Obsidian'}
            </span>
            {!isLoading && modelUsed && (
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full font-medium ${
                  fallbackFrom
                    ? 'bg-amber-100 text-amber-800 border border-amber-200'
                    : 'bg-primary-50 text-primary-700 border border-primary-200'
                }`}
                title={
                  fallbackFrom
                    ? `Automatic fallback from ${fallbackFrom} to ${modelUsed}`
                    : `Generated with ${modelUsed}`
                }
              >
                {fallbackFrom ? `${modelUsed} (fallback)` : modelUsed}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={handleDownload}
            disabled={isLoading}
            className={`flex items-center px-4 py-2 text-sm font-medium rounded-lg transition-all bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 hover:border-slate-400 ${
              isLoading ? 'opacity-50 cursor-not-allowed' : ''
            }`}
            title={`Download as ${toMarkdownFilename(filename)}`}
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
            className={`p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors ${
              isLoading ? 'opacity-50 cursor-not-allowed' : ''
            }`}
            title="Analyze another paper"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Fallback Notice Banner */}
      {!isLoading && fallbackFrom && modelUsed && (
        <div className="px-6 py-2.5 bg-amber-50 border-b border-amber-200 text-xs text-amber-800 flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>
            Primary model <strong>{fallbackFrom}</strong> was unavailable; automatically fell back to{' '}
            <strong>{modelUsed}</strong>.
          </span>
        </div>
      )}

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
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
          </article>
        ) : (
          <textarea
            className="w-full h-full min-h-[60vh] font-mono text-sm text-slate-700 resize-none outline-none"
            value={markdown}
            readOnly
          />
        )}
      </div>
    </div>
  );
};

export default DigestView;
