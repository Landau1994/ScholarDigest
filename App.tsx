import React, { useState, useEffect } from 'react';
import UploadArea from './components/UploadArea';
import DigestView from './components/DigestView';
import { generateDigest } from './services/geminiService';
import { AVAILABLE_MODELS, DEFAULT_MODEL } from './shared/models';
import { LoadingState, Template, Language, TaskHistoryItem } from './types';

const App: React.FC = () => {
  const [loadingState, setLoadingState] = useState<LoadingState>(LoadingState.IDLE);
  const [digest, setDigest] = useState<string | null>(null);
  const [currentFilename, setCurrentFilename] = useState<string | undefined>(undefined);
  const [currentModelUsed, setCurrentModelUsed] = useState<string | undefined>(undefined);
  const [currentFallbackFrom, setCurrentFallbackFrom] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<Language>('en');
  const [selectedModel, setSelectedModel] = useState<string>(DEFAULT_MODEL);
  const [history, setHistory] = useState<TaskHistoryItem[]>([]);

  // Template Management State
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('general_article');
  const [templateContent, setTemplateContent] = useState<string>('');
  const [isTemplateExpanded, setIsTemplateExpanded] = useState(false);

  // New template creation state
  const [newTemplateName, setNewTemplateName] = useState('');
  const [isNamingTemplate, setIsNamingTemplate] = useState(false);

  // Auto-dismiss status toast
  useEffect(() => {
    if (!statusMessage) return;
    const timer = setTimeout(() => setStatusMessage(null), 3000);
    return () => clearTimeout(timer);
  }, [statusMessage]);

  // Load history from local API
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await fetch('/api/history');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            setHistory(data);
          }
        }
      } catch (e) {
        console.error('Failed to fetch history', e);
      }
    };
    fetchHistory();
  }, []);

  // Load templates from server on mount
  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const res = await fetch('/api/templates');
        if (!res.ok) throw new Error('Failed to load templates');
        const serverTemplates: Template[] = await res.json();

        if (serverTemplates.length > 0) {
          setTemplates(serverTemplates);
          const currentExists =
            serverTemplates.find((t) => t.id === selectedTemplateId) ||
            serverTemplates.find((t) => t.id === 'general_article');
          if (currentExists) {
            setSelectedTemplateId(currentExists.id);
            setTemplateContent(currentExists.content);
          } else {
            setSelectedTemplateId(serverTemplates[0].id);
            setTemplateContent(serverTemplates[0].content);
          }
        }
      } catch (e) {
        console.error('Failed to load templates from server', e);
        const saved = localStorage.getItem('custom_templates');
        if (saved) {
          try {
            const parsed: Template[] = JSON.parse(saved);
            setTemplates(parsed);
            if (parsed.length > 0) {
              setSelectedTemplateId(parsed[0].id);
              setTemplateContent(parsed[0].content);
            }
          } catch {
            // ignore corrupted local storage
          }
        }
      }
    };

    fetchTemplates();
  }, []);

  const handleFileSelect = async (file: File) => {
    setLoadingState(LoadingState.ANALYZING);
    setError(null);
    setDigest(null);
    setCurrentFilename(file.name);
    setCurrentModelUsed(undefined);
    setCurrentFallbackFrom(undefined);

    try {
      const result = await generateDigest(file, templateContent, selectedLanguage, selectedModel);
      setDigest(result.markdown);
      setCurrentModelUsed(result.modelUsed);
      setCurrentFallbackFrom(result.fallbackFrom);
      setLoadingState(LoadingState.SUCCESS);

      // Save to history
      const newItem: TaskHistoryItem = {
        id: Date.now().toString(),
        timestamp: Date.now(),
        filename: file.name,
        markdown: result.markdown,
        modelUsed: result.modelUsed,
        templateId: selectedTemplateId,
      };

      try {
        const res = await fetch('/api/history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newItem),
        });
        if (res.ok) {
          const updatedHistory = await res.json();
          setHistory(updatedHistory);
        }
      } catch (e) {
        console.error('Failed to save history', e);
        setHistory((prevHistory) => [newItem, ...prevHistory].slice(0, 20));
      }
    } catch (err: unknown) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'An unexpected error occurred while analyzing the paper.';
      setError(message);
      setLoadingState(LoadingState.ERROR);
    }
  };

  const handleReset = () => {
    setDigest(null);
    setCurrentFilename(undefined);
    setCurrentModelUsed(undefined);
    setCurrentFallbackFrom(undefined);
    setLoadingState(LoadingState.IDLE);
    setError(null);
  };

  const handleTemplateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setSelectedTemplateId(id);
    const tmpl = templates.find((t) => t.id === id);
    if (tmpl) {
      setTemplateContent(tmpl.content);
    }
  };

  const handleSaveChanges = async () => {
    const currentTemplate = templates.find((t) => t.id === selectedTemplateId);
    if (!currentTemplate || currentTemplate.isDefault) return;

    setError(null);
    try {
      const res = await fetch('/api/save-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: currentTemplate.id,
          name: currentTemplate.name,
          content: templateContent,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.error || 'Failed to save template changes.');
      }

      setTemplates((prev) =>
        prev.map((t) => (t.id === selectedTemplateId ? { ...t, content: templateContent } : t))
      );
      setStatusMessage(`Saved changes to "${currentTemplate.name}".`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save changes.';
      console.error('Failed to save template changes:', err);
      setError(message);
    }
  };

  const handleSaveAsNew = async () => {
    const trimmedName = newTemplateName.trim();
    if (!trimmedName) return;

    setError(null);
    try {
      const res = await fetch('/api/save-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmedName,
          content: templateContent,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.error || 'Failed to create template.');
      }

      const savedTemplate: Template = payload.template || {
        id: payload.id || trimmedName.toLowerCase().replace(/\s+/g, '-'),
        name: trimmedName,
        content: templateContent,
        isDefault: false,
      };

      setTemplates((prev) => {
        const exists = prev.some((t) => t.id === savedTemplate.id);
        return exists
          ? prev.map((t) => (t.id === savedTemplate.id ? savedTemplate : t))
          : [...prev, savedTemplate];
      });
      setSelectedTemplateId(savedTemplate.id);
      setIsNamingTemplate(false);
      setNewTemplateName('');
      setStatusMessage(`Saved template "${savedTemplate.name}".`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save template to disk.';
      console.error('Failed to save template to disk:', err);
      setError(message);
    }
  };

  const handleDeleteTemplate = async () => {
    const current = templates.find((t) => t.id === selectedTemplateId);
    if (!current || current.isDefault) return;

    if (!window.confirm(`Delete template "${current.name}" permanently from disk?`)) {
      return;
    }

    setError(null);
    try {
      const res = await fetch(`/api/templates/${encodeURIComponent(current.id)}`, {
        method: 'DELETE',
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.error || 'Failed to delete template.');
      }

      const updatedTemplates = templates.filter((t) => t.id !== selectedTemplateId);
      setTemplates(updatedTemplates);

      const fallback = updatedTemplates.find((t) => t.id === 'general_article') || updatedTemplates[0];
      if (fallback) {
        setSelectedTemplateId(fallback.id);
        setTemplateContent(fallback.content);
      } else {
        setSelectedTemplateId('');
        setTemplateContent('');
      }

      setStatusMessage(`Deleted template "${current.name}".`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to delete template.';
      console.error('Failed to delete template:', err);
      setError(message);
    }
  };

  const handleDeleteHistoryItem = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/history/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        const updatedHistory = await res.json();
        setHistory(updatedHistory);
      } else {
        setHistory((prev) => prev.filter((item) => item.id !== id));
      }
    } catch (err) {
      console.error('Failed to delete history item:', err);
    }
  };

  const currentTemplate = templates.find((t) => t.id === selectedTemplateId);

  return (
    <div className="min-h-screen bg-[#f3f4f6] text-slate-900 font-sans selection:bg-primary-100 selection:text-primary-900">
      {/* Navbar */}
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <div className="flex-shrink-0 flex items-center gap-2">
                <div className="w-8 h-8 bg-gradient-to-br from-primary-500 to-indigo-600 rounded-lg flex items-center justify-center text-white font-bold shadow-sm">
                  S
                </div>
                <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-600">
                  ScholarDigest
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* Model Selector */}
              <div className="relative">
                <select
                  aria-label="Select Gemini Model"
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  disabled={loadingState === LoadingState.ANALYZING}
                  className="appearance-none bg-slate-100 border border-slate-200 text-slate-700 py-1.5 pl-3 pr-8 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
                >
                  {AVAILABLE_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none">
                  <svg className="w-3 h-3 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                  </svg>
                </div>
              </div>

              {/* Language Selector */}
              <div className="relative">
                <select
                  aria-label="Select Output Language"
                  value={selectedLanguage}
                  onChange={(e) => setSelectedLanguage(e.target.value as Language)}
                  disabled={loadingState === LoadingState.ANALYZING}
                  className="appearance-none bg-slate-100 border border-slate-200 text-slate-700 py-1.5 pl-3 pr-8 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
                >
                  <option value="en">🇺🇸 English</option>
                  <option value="cn">🇨🇳 中文</option>
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none">
                  <svg className="w-3 h-3 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                  </svg>
                </div>
              </div>

              <a
                href="https://github.com/Landau1994/ScholarDigest"
                target="_blank"
                rel="noreferrer"
                className="text-slate-400 hover:text-slate-600 transition-colors"
                title="View on GitHub"
              >
                <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fillRule="evenodd"
                    d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                    clipRule="evenodd"
                  />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Hero Section (only when idle) */}
        {!digest && loadingState !== LoadingState.ANALYZING && (
          <div className="text-center mb-8">
            <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-900 tracking-tight mb-4">
              Turn Papers into <span className="text-primary-600">Knowledge</span>
            </h1>
            <p className="max-w-2xl mx-auto text-lg text-slate-600 mb-8">
              Upload any research PDF. Our AI extracts key methods, results, and citations directly into your custom
              Obsidian-ready template.
            </p>
          </div>
        )}

        <div className="max-w-4xl mx-auto">
          {statusMessage && (
            <div
              className="mb-6 bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-lg flex items-center justify-between"
              role="status"
            >
              <span>{statusMessage}</span>
              <button
                type="button"
                onClick={() => setStatusMessage(null)}
                className="text-emerald-500 hover:text-emerald-700"
              >
                <span className="sr-only">Dismiss</span>✕
              </button>
            </div>
          )}

          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg relative" role="alert">
              <strong className="font-bold">Error: </strong>
              <span className="block sm:inline pr-8">{error}</span>
              <button className="absolute top-0 bottom-0 right-0 px-4 py-3" onClick={() => setError(null)}>
                <span className="sr-only">Dismiss</span>
                <svg className="fill-current h-6 w-6 text-red-500" role="button" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                  <title>Close</title>
                  <path d="M14.348 14.849a1.2 1.2 0 0 1-1.697 0L10 11.819l-2.651 3.029a1.2 1.2 0 1 1-1.697-1.697l2.758-3.15-2.759-3.152a1.2 1.2 0 1 1 1.697-1.697L10 8.183l2.651-3.031a1.2 1.2 0 1 1 1.697 1.697l-2.758 3.152 2.758 3.15a1.2 1.2 0 0 1 0 1.698z" />
                </svg>
              </button>
            </div>
          )}

          {/* Template Customization Section */}
          {!digest && loadingState !== LoadingState.ANALYZING && (
            <div className="mb-8">
              <div className="flex justify-center mb-4">
                <button
                  onClick={() => setIsTemplateExpanded(!isTemplateExpanded)}
                  className="flex items-center gap-2 text-sm font-medium text-slate-600 bg-white border border-slate-300 rounded-full px-4 py-2 hover:bg-slate-50 hover:text-primary-600 transition-colors shadow-sm"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className={`h-4 w-4 transition-transform ${isTemplateExpanded ? 'rotate-180' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                  {isTemplateExpanded ? 'Hide Template' : `Using: ${currentTemplate?.name || 'Default'}`}
                </button>
              </div>

              {isTemplateExpanded && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  {/* Template Controls Toolbar */}
                  <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div className="w-full sm:w-auto flex flex-col gap-1">
                      <label htmlFor="template-select" className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        Select Template
                      </label>
                      <div className="relative">
                        <select
                          id="template-select"
                          value={selectedTemplateId}
                          onChange={handleTemplateChange}
                          className="w-full sm:w-64 pl-3 pr-10 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none appearance-none bg-white"
                        >
                          {templates.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name} {t.isDefault ? '(Default)' : ''}
                            </option>
                          ))}
                        </select>
                        <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none">
                          <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                          </svg>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                      {isNamingTemplate ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={newTemplateName}
                            onChange={(e) => setNewTemplateName(e.target.value)}
                            placeholder="Template Name..."
                            className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none w-40"
                            autoFocus
                            onKeyDown={(e) => e.key === 'Enter' && handleSaveAsNew()}
                          />
                          <button
                            onClick={handleSaveAsNew}
                            disabled={!newTemplateName.trim()}
                            className="px-3 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => {
                              setIsNamingTemplate(false);
                              setNewTemplateName('');
                            }}
                            className="px-3 py-2 text-sm text-slate-600 hover:text-slate-800"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <>
                          {currentTemplate && !currentTemplate.isDefault && (
                            <button
                              onClick={handleSaveChanges}
                              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-primary-700 bg-primary-50 border border-primary-200 rounded-lg hover:bg-primary-100 transition-colors"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                              </svg>
                              Save Changes
                            </button>
                          )}

                          <button
                            onClick={() => setIsNamingTemplate(true)}
                            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
                            </svg>
                            Save as New
                          </button>

                          {currentTemplate && !currentTemplate.isDefault && (
                            <button
                              onClick={handleDeleteTemplate}
                              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-red-600 bg-white border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                              Delete
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  <textarea
                    id="template-editor"
                    value={templateContent}
                    onChange={(e) => setTemplateContent(e.target.value)}
                    className="w-full h-80 p-6 font-mono text-sm bg-white focus:outline-none resize-y"
                    placeholder="Enter your markdown template here..."
                    spellCheck={false}
                  />

                  <div className="bg-slate-50 px-6 py-3 border-t border-slate-200">
                    <p className="text-xs text-slate-500">
                      <strong>Tip:</strong> Use standard Markdown. The AI will follow this structure to generate the
                      digest. Use <code>{'<% tp.file.title %>'}</code> for the paper title placeholder.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {!digest && loadingState !== LoadingState.ANALYZING && (
            <UploadArea onFileSelect={handleFileSelect} loadingState={loadingState} />
          )}

          {!digest && loadingState !== LoadingState.ANALYZING && history.length > 0 && (
            <div className="mt-8">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">
                  Recent Digests ({history.length})
                </h3>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {history.map((item) => (
                  <div
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setDigest(item.markdown);
                      setCurrentFilename(item.filename);
                      setCurrentModelUsed(item.modelUsed);
                      setCurrentFallbackFrom(undefined);
                      setLoadingState(LoadingState.SUCCESS);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setDigest(item.markdown);
                        setCurrentFilename(item.filename);
                        setCurrentModelUsed(item.modelUsed);
                        setCurrentFallbackFrom(undefined);
                        setLoadingState(LoadingState.SUCCESS);
                      }
                    }}
                    className="relative flex flex-col items-start p-4 bg-white border border-slate-200 rounded-xl hover:border-primary-300 hover:shadow-md transition-all text-left group cursor-pointer"
                  >
                    <button
                      type="button"
                      onClick={(e) => handleDeleteHistoryItem(e, item.id)}
                      className="absolute top-2.5 right-2.5 p-1 text-slate-300 hover:text-red-500 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Remove from history"
                      aria-label={`Remove ${item.filename} from history`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                    <div
                      className="font-medium text-slate-800 group-hover:text-primary-700 line-clamp-1 w-full pr-6"
                      title={item.filename}
                    >
                      {item.filename}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-400 mt-1.5">
                      <span>
                        {new Date(item.timestamp).toLocaleDateString()}{' '}
                        {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {item.modelUsed && (
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 text-[10px] font-medium">
                          {item.modelUsed}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(digest || loadingState === LoadingState.ANALYZING) && (
            <div>
              <DigestView
                markdown={digest || ''}
                filename={currentFilename}
                modelUsed={currentModelUsed}
                fallbackFrom={currentFallbackFrom}
                isLoading={loadingState === LoadingState.ANALYZING}
                onReset={handleReset}
              />
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      {!digest && loadingState !== LoadingState.ANALYZING && (
        <footer className="mt-12 text-center text-slate-400 text-sm pb-8">
          <p>Powered by Google Gemini ({selectedModel})</p>
        </footer>
      )}
    </div>
  );
};

export default App;
