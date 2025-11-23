/**
 * Documents Page
 * Upload and manage medical documents for knowledge base
 */

import { useState, useCallback } from 'react';
import { Button, Card, CardHeader, CardTitle, CardContent } from '@voiceassist/ui';
import { useAuth } from '../hooks/useAuth';

type UploadStatus = 'idle' | 'uploading' | 'success' | 'error';

interface UploadState {
  status: UploadStatus;
  progress: number;
  message?: string;
}

export function DocumentsPage() {
  const { apiClient } = useAuth();
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadState, setUploadState] = useState<UploadState>({
    status: 'idle',
    progress: 0,
  });
  const [category, setCategory] = useState('general');

  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      setSelectedFiles(Array.from(files));
      setUploadState({ status: 'idle', progress: 0 });
    }
  }, []);

  const handleRemoveFile = useCallback((index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleUpload = useCallback(async () => {
    if (selectedFiles.length === 0) return;

    setUploadState({ status: 'uploading', progress: 0 });

    try {
      // Upload files one by one
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];

        try {
          await apiClient.uploadDocument(file, category);

          // Update progress
          const progress = ((i + 1) / selectedFiles.length) * 100;
          setUploadState({ status: 'uploading', progress });
        } catch (err) {
          console.error(`Failed to upload ${file.name}:`, err);
          throw new Error(`Failed to upload ${file.name}`);
        }
      }

      // Success
      setUploadState({
        status: 'success',
        progress: 100,
        message: `Successfully uploaded ${selectedFiles.length} file(s)`,
      });
      setSelectedFiles([]);

      // Reset after 3 seconds
      setTimeout(() => {
        setUploadState({ status: 'idle', progress: 0 });
      }, 3000);
    } catch (err: any) {
      setUploadState({
        status: 'error',
        progress: 0,
        message: err.message || 'Upload failed',
      });
    }
  }, [selectedFiles, category, apiClient]);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const getFileIcon = (filename: string): JSX.Element => {
    const ext = filename.split('.').pop()?.toLowerCase();

    if (ext === 'pdf') {
      return (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-red-500">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
      );
    }

    if (['jpg', 'jpeg', 'png', 'gif'].includes(ext || '')) {
      return (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-blue-500">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
        </svg>
      );
    }

    return (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-neutral-500">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    );
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-neutral-900">Documents</h1>
        <p className="mt-2 text-neutral-600">
          Upload medical documents to enhance the AI's knowledge base
        </p>
      </div>

      {/* Upload Card */}
      <Card>
        <CardHeader>
          <CardTitle>Upload Documents</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* File Input */}
          <div>
            <label htmlFor="file-upload" className="block">
              <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-neutral-300 border-dashed rounded-md hover:border-primary-500 transition-colors cursor-pointer">
                <div className="space-y-1 text-center">
                  <svg
                    className="mx-auto h-12 w-12 text-neutral-400"
                    stroke="currentColor"
                    fill="none"
                    viewBox="0 0 48 48"
                    aria-hidden="true"
                  >
                    <path
                      d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <div className="flex text-sm text-neutral-600">
                    <span className="relative font-medium text-primary-600 hover:text-primary-500">
                      Choose files
                    </span>
                    <p className="pl-1">or drag and drop</p>
                  </div>
                  <p className="text-xs text-neutral-500">
                    PDF, DOCX, TXT, MD up to 10MB each
                  </p>
                </div>
              </div>
              <input
                id="file-upload"
                type="file"
                multiple
                accept=".pdf,.docx,.txt,.md,.doc"
                onChange={handleFileSelect}
                className="sr-only"
              />
            </label>
          </div>

          {/* Category Selection */}
          <div className="space-y-2">
            <label htmlFor="category" className="block text-sm font-medium text-neutral-700">
              Category
            </label>
            <select
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="general">General Medical</option>
              <option value="cardiology">Cardiology</option>
              <option value="neurology">Neurology</option>
              <option value="pediatrics">Pediatrics</option>
              <option value="surgery">Surgery</option>
              <option value="guidelines">Clinical Guidelines</option>
              <option value="research">Research Papers</option>
            </select>
          </div>

          {/* Selected Files List */}
          {selectedFiles.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-neutral-900">
                Selected Files ({selectedFiles.length})
              </h3>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {selectedFiles.map((file, index) => (
                  <div
                    key={`${file.name}-${index}`}
                    className="flex items-center space-x-3 p-3 bg-neutral-50 rounded-md border border-neutral-200"
                  >
                    {getFileIcon(file.name)}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-neutral-900 truncate">
                        {file.name}
                      </p>
                      <p className="text-xs text-neutral-500">
                        {formatFileSize(file.size)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveFile(index)}
                      className="text-neutral-400 hover:text-red-600 focus:outline-none"
                      aria-label={`Remove ${file.name}`}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
                        stroke="currentColor"
                        className="w-5 h-5"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Upload Progress */}
          {uploadState.status === 'uploading' && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-neutral-700">Uploading...</span>
                <span className="text-neutral-600">{Math.round(uploadState.progress)}%</span>
              </div>
              <div className="w-full bg-neutral-200 rounded-full h-2">
                <div
                  className="bg-primary-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${uploadState.progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Status Messages */}
          {uploadState.status === 'success' && uploadState.message && (
            <div className="p-3 bg-green-50 rounded-md border border-green-200 flex items-center space-x-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="w-5 h-5 text-green-600"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-green-800">{uploadState.message}</p>
            </div>
          )}

          {uploadState.status === 'error' && uploadState.message && (
            <div className="p-3 bg-red-50 rounded-md border border-red-200 flex items-center space-x-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="w-5 h-5 text-red-600"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              <p className="text-sm text-red-800">{uploadState.message}</p>
            </div>
          )}

          {/* Upload Button */}
          <div className="flex justify-end">
            <Button
              onClick={handleUpload}
              disabled={selectedFiles.length === 0 || uploadState.status === 'uploading'}
              size="lg"
            >
              {uploadState.status === 'uploading' ? 'Uploading...' : 'Upload Documents'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card>
        <CardHeader>
          <CardTitle>Supported File Types</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-neutral-600">
            <li className="flex items-start space-x-2">
              <svg className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span><strong>PDF:</strong> Medical textbooks, research papers, clinical guidelines</span>
            </li>
            <li className="flex items-start space-x-2">
              <svg className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span><strong>DOCX/DOC:</strong> Clinical notes, patient summaries</span>
            </li>
            <li className="flex items-start space-x-2">
              <svg className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span><strong>TXT/MD:</strong> Plain text medical information</span>
            </li>
          </ul>
          <p className="mt-4 text-xs text-neutral-500">
            Files are securely processed and added to your personal knowledge base. Maximum file size: 10MB.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
