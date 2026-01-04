import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import Uppy from '@uppy/core';
import Tus from '@uppy/tus';
import { Upload, X, Check, AlertCircle, FolderUp } from 'lucide-react';

export default function UploadButton({ folderId, onUploadComplete }) {
  const { csrfToken } = useAuth();
  const uppyRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showProgress, setShowProgress] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null); // 'success' | 'error' | null
  const [fileCount, setFileCount] = useState({ total: 0, completed: 0, failed: 0 });
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);
  const csrfTokenRef = useRef(csrfToken);
  const onUploadCompleteRef = useRef(onUploadComplete);

  // Keep refs updated
  useEffect(() => {
    csrfTokenRef.current = csrfToken;
  }, [csrfToken]);

  useEffect(() => {
    onUploadCompleteRef.current = onUploadComplete;
  }, [onUploadComplete]);

  useEffect(() => {
    // Only create Uppy instance once
    if (uppyRef.current) return;

    console.log('Creating Uppy instance');

    const uppyInstance = new Uppy({
      autoProceed: true,
      restrictions: {
        maxFileSize: 1024 * 1024 * 1024, // 1GB per file
      },
      debug: true, // Enable debug logging
    })
    .use(Tus, {
      endpoint: '/files/',
      chunkSize: 5 * 1024 * 1024, // 5MB chunks
      retryDelays: [0, 1000, 3000, 5000],
      withCredentials: true,
      limit: 1, // Upload one file at a time to prevent race conditions
      removeFingerprintOnSuccess: true, // Clear stored upload info on success
      storeFingerprintForResuming: false, // Don't try to resume uploads
      headers: () => ({
        'X-CSRF-Token': csrfTokenRef.current || '',
      }),
    });

    uppyInstance.on('file-added', (file) => {
      console.log('File added to Uppy:', file.name);
    });

    uppyInstance.on('upload', () => {
      console.log('Upload starting');
      setUploading(true);
      setShowProgress(true);
      setProgress(0);
      setUploadStatus(null);
      const files = uppyInstance.getFiles();
      setFileCount({ total: files.length, completed: 0, failed: 0 });
    });

    uppyInstance.on('progress', (progress) => {
      setProgress(progress);
    });

    uppyInstance.on('upload-success', () => {
      setFileCount(prev => ({ ...prev, completed: prev.completed + 1 }));
    });

    uppyInstance.on('upload-error', (file, error) => {
      console.error('Upload error for file:', file?.name, error);
      setFileCount(prev => ({ ...prev, failed: prev.failed + 1 }));
    });

    uppyInstance.on('complete', (result) => {
      setUploading(false);
      
      if (result.failed.length > 0) {
        setUploadStatus('error');
        console.error('Failed uploads:', result.failed);
      } else {
        setUploadStatus('success');
        onUploadCompleteRef.current?.();
      }

      // Clear all files from Uppy to prevent duplicates on next upload
      const filesToRemove = uppyInstance.getFiles();
      filesToRemove.forEach(file => uppyInstance.removeFile(file.id));

      // Hide progress after a delay
      setTimeout(() => {
        setShowProgress(false);
        setUploadStatus(null);
        setFileCount({ total: 0, completed: 0, failed: 0 });
      }, 3000);
    });

    uppyInstance.on('error', (error) => {
      console.error('Uppy error:', error);
      setUploading(false);
      setUploadStatus('error');
    });

    uppyRef.current = uppyInstance;

    return () => {
      uppyInstance.close();
      uppyRef.current = null;
    };
  }, []); // Empty dependency array - create only once

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || []);
    const uppy = uppyRef.current;
    
    if (!uppy) {
      console.error('Uppy not initialized');
      return;
    }
    
    console.log('Adding files:', files.length);
    
    files.forEach((file) => {
      // Get relative path for folder uploads
      const relativePath = file.webkitRelativePath || file.name;
      
      try {
        uppy.addFile({
          name: file.name,
          type: file.type || 'application/octet-stream',
          data: file,
          meta: {
            filename: file.name,
            filetype: file.type || 'application/octet-stream',
            folderId: folderId || '',
            relativePath: relativePath,
          },
        });
      } catch (err) {
        console.error('Error adding file:', file.name, err);
      }
    });

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    if (folderInputRef.current) {
      folderInputRef.current.value = '';
    }
  };

  return (
    <div className="relative flex items-center gap-2">
      {/* File upload input - accepts all file types */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileSelect}
        className="hidden"
        id="file-upload"
      />
      
      {/* Folder upload input */}
      <input
        ref={folderInputRef}
        type="file"
        webkitdirectory=""
        directory=""
        multiple
        onChange={handleFileSelect}
        className="hidden"
        id="folder-upload"
      />
      
      {/* Upload files button */}
      <label
        htmlFor="file-upload"
        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg cursor-pointer transition"
      >
        <Upload className="w-5 h-5" />
        <span className="hidden sm:inline">Upload Files</span>
      </label>

      {/* Upload folder button */}
      <label
        htmlFor="folder-upload"
        className="flex items-center gap-2 px-4 py-2 border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium rounded-lg cursor-pointer transition"
      >
        <FolderUp className="w-5 h-5" />
        <span className="hidden sm:inline">Upload Folder</span>
      </label>

      {/* Upload progress overlay */}
      {showProgress && (
        <div className="fixed bottom-4 right-4 bg-white rounded-lg shadow-lg border border-gray-200 p-4 min-w-[320px] z-50">
          <div className="flex items-center justify-between mb-2">
            <div>
              <span className="font-medium text-gray-900">
                {uploading ? 'Uploading...' : uploadStatus === 'success' ? 'Upload complete' : 'Upload finished with errors'}
              </span>
              {fileCount.total > 1 && (
                <p className="text-sm text-gray-500">
                  {fileCount.completed + fileCount.failed} of {fileCount.total} files
                  {fileCount.failed > 0 && (
                    <span className="text-red-500"> ({fileCount.failed} failed)</span>
                  )}
                </p>
              )}
            </div>
            <button
              onClick={() => setShowProgress(false)}
              className="p-1 hover:bg-gray-100 rounded"
            >
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </div>
          
          <div className="relative h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`absolute left-0 top-0 h-full transition-all duration-300 ${
                uploadStatus === 'error' ? 'bg-red-500' : 'bg-blue-600'
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
          
          <div className="flex items-center justify-between mt-2">
            <span className="text-sm text-gray-500">{Math.round(progress)}%</span>
            {uploadStatus === 'success' && (
              <div className="flex items-center gap-1 text-green-600">
                <Check className="w-5 h-5" />
                <span className="text-sm">Done</span>
              </div>
            )}
            {uploadStatus === 'error' && (
              <div className="flex items-center gap-1 text-red-500">
                <AlertCircle className="w-5 h-5" />
                <span className="text-sm">Some files failed</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
