import React, { useRef, useState, useCallback } from 'react';
import { LoadingState } from '../types';

interface UploadAreaProps {
  onFileSelect: (file: File) => void;
  loadingState: LoadingState;
}

const UploadArea: React.FC<UploadAreaProps> = ({ onFileSelect, loadingState }) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (loadingState === LoadingState.ANALYZING || loadingState === LoadingState.UPLOADING) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (validateFile(file)) {
        onFileSelect(file);
      } else {
        alert("Please upload a PDF file.");
      }
    }
  }, [loadingState, onFileSelect]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      if (validateFile(file)) {
        onFileSelect(file);
      } else {
        alert("Please upload a PDF file.");
      }
    }
  }, [onFileSelect]);

  const validateFile = (file: File) => {
    return file.type === 'application/pdf';
  };

  const isBusy = loadingState === LoadingState.ANALYZING || loadingState === LoadingState.UPLOADING;

  return (
    <div
      className={`
        relative overflow-hidden rounded-2xl border-2 border-dashed transition-all duration-300 ease-in-out
        ${isDragging 
          ? 'border-primary-500 bg-primary-50 scale-[1.02]' 
          : 'border-slate-300 hover:border-primary-400 hover:bg-slate-50'
        }
        ${isBusy ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        h-64 flex flex-col items-center justify-center p-8 text-center
      `}
      onDragOver={isBusy ? undefined : handleDragOver}
      onDragLeave={isBusy ? undefined : handleDragLeave}
      onDrop={isBusy ? undefined : handleDrop}
      onClick={() => !isBusy && fileInputRef.current?.click()}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileInput}
        accept=".pdf"
        className="hidden"
        disabled={isBusy}
      />
      
      {loadingState === LoadingState.ANALYZING ? (
        <div className="flex flex-col items-center animate-pulse">
          <div className="w-16 h-16 mb-4 rounded-full border-4 border-primary-200 border-t-primary-600 animate-spin"></div>
          <p className="text-lg font-medium text-slate-700">Reading Paper...</p>
          <p className="text-sm text-slate-500 mt-2">This may take up to a minute for large files.</p>
        </div>
      ) : (
        <>
          <div className={`p-4 rounded-full bg-slate-100 mb-4 ${isDragging ? 'bg-primary-200' : ''}`}>
             <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-slate-600">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-slate-800 mb-2">
            {isDragging ? 'Drop paper here' : 'Drop your research paper here'}
          </h3>
          <p className="text-slate-500 max-w-sm">
            Support for PDF files. We'll extract citations, methods, and results into your template.
          </p>
          <button 
            className="mt-6 px-6 py-2 bg-white border border-slate-300 text-slate-700 font-medium rounded-lg shadow-sm hover:bg-slate-50 transition-colors pointer-events-none"
          >
            Or browse files
          </button>
        </>
      )}
    </div>
  );
};

export default UploadArea;
