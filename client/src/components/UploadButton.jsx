import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api, formatBytes } from '../lib/api';
import Uppy from '@uppy/core';
import Tus from '@uppy/tus';
import { Upload, X, Check, AlertCircle, FolderUp, HardDrive } from 'lucide-react';

export default function UploadButton({ folderId, onUploadComplete }) {
  const { csrfToken, storageQuota, storageUsed, refreshUser, hasUnlimitedStorage } = useAuth();
  const uppyRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showProgress, setShowProgress] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null); // 'success' | 'error' | null
  const [fileCount, setFileCount] = useState({ total: 0, completed: 0, failed: 0 });
  const [showQuotaError, setShowQuotaError] = useState(false);
  const [quotaErrorDetails, setQuotaErrorDetails] = useState(null);
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
      
      // Refresh user storage info
      refreshUser?.();

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

  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files || []);
    const uppy = uppyRef.current;
    
    if (!uppy) {
      console.error('Uppy not initialized');
      return;
    }
    
    // Check storage quota before uploading (skip for unlimited storage)
    if (!hasUnlimitedStorage) {
      const totalUploadSize = files.reduce((sum, file) => sum + file.size, 0);
      const availableSpace = storageQuota - storageUsed;
      
      if (totalUploadSize > availableSpace) {
        setQuotaErrorDetails({
          uploadSize: totalUploadSize,
          available: availableSpace,
          used: storageUsed,
          quota: storageQuota,
        });
        setShowQuotaError(true);
        
        // Reset inputs
        if (fileInputRef.current) fileInputRef.current.value = '';
        if (folderInputRef.current) folderInputRef.current.value = '';
        return;
      }
    }
    
    console.log('Adding files:', files.length);
    
    // Check if this is a folder upload (has webkitRelativePath)
    const isFolderUpload = files.length > 0 && files[0].webkitRelativePath && files[0].webkitRelativePath.includes('/');
    
    if (isFolderUpload) {
      // Create folder structure first
      const folderCache = {}; // path -> folderId mapping
      
      // Get the root folder name from the first file's relative path
      const rootFolderName = files[0].webkitRelativePath.split('/')[0];
      
      // Create the root folder
      try {
        const rootResult = await api.post('/api/folders', {
          name: rootFolderName,
          parentId: folderId || null,
        }, csrfTokenRef.current);
        folderCache[rootFolderName] = rootResult.folder.id;
        console.log(`Created root folder: ${rootFolderName} with id ${rootResult.folder.id}`);
      } catch (err) {
        console.error('Error creating root folder:', err);
        // Folder might already exist, try to find it
      }
      
      // Create all subfolders
      const folderPaths = new Set();
      files.forEach(file => {
        const parts = file.webkitRelativePath.split('/');
        // Build all intermediate folder paths
        for (let i = 1; i < parts.length; i++) {
          const folderPath = parts.slice(0, i).join('/');
          folderPaths.add(folderPath);
        }
      });
      
      // Sort folder paths by depth to create parent folders first
      const sortedPaths = Array.from(folderPaths).sort((a, b) => 
        a.split('/').length - b.split('/').length
      );
      
      for (const folderPath of sortedPaths) {
        if (folderCache[folderPath]) continue;
        
        const parts = folderPath.split('/');
        const folderName = parts[parts.length - 1];
        const parentPath = parts.slice(0, -1).join('/');
        
        let parentId = null;
        if (parentPath) {
          parentId = folderCache[parentPath];
        } else {
          parentId = folderId || null;
        }
        
        try {
          const result = await api.post('/api/folders', {
            name: folderName,
            parentId: parentId,
          }, csrfTokenRef.current);
          folderCache[folderPath] = result.folder.id;
          console.log(`Created folder: ${folderPath} with id ${result.folder.id}`);
        } catch (err) {
          console.error('Error creating folder:', folderPath, err);
        }
      }
      
      // Now add files with their correct folder IDs
      files.forEach((file) => {
        const relativePath = file.webkitRelativePath;
        const parts = relativePath.split('/');
        const folderPath = parts.slice(0, -1).join('/');
        const targetFolderId = folderCache[folderPath] || folderId || '';
        
        try {
          uppy.addFile({
            name: file.name,
            type: file.type || 'application/octet-stream',
            data: file,
            meta: {
              filename: file.name,
              filetype: file.type || 'application/octet-stream',
              folderId: targetFolderId,
              relativePath: relativePath,
            },
          });
        } catch (err) {
          console.error('Error adding file:', file.name, err);
        }
      });
    } else {
      // Regular file upload
      files.forEach((file) => {
        try {
          uppy.addFile({
            name: file.name,
            type: file.type || 'application/octet-stream',
            data: file,
            meta: {
              filename: file.name,
              filetype: file.type || 'application/octet-stream',
              folderId: folderId || '',
              relativePath: file.name,
            },
          });
        } catch (err) {
          console.error('Error adding file:', file.name, err);
        }
      });
    }

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

      {/* Storage Quota Error Modal */}
      {showQuotaError && quotaErrorDetails && (
        <div className="modal-backdrop" onClick={() => setShowQuotaError(false)}>
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-center mb-4">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
                <HardDrive className="w-8 h-8 text-red-600" />
              </div>
            </div>
            
            <h2 className="text-xl font-semibold text-gray-900 text-center mb-2">
              Storage Limit Exceeded
            </h2>
            
            <p className="text-gray-600 text-center mb-4">
              You don't have enough storage space to upload these files.
            </p>
            
            <div className="bg-gray-50 rounded-lg p-4 mb-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Upload size:</span>
                <span className="font-medium text-gray-900">{formatBytes(quotaErrorDetails.uploadSize)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Available space:</span>
                <span className="font-medium text-gray-900">{formatBytes(quotaErrorDetails.available)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Storage used:</span>
                <span className="font-medium text-gray-900">
                  {formatBytes(quotaErrorDetails.used)} of {formatBytes(quotaErrorDetails.quota)}
                </span>
              </div>
            </div>
            
            <div className="w-full bg-gray-200 rounded-full h-3 mb-4">
              <div 
                className="h-3 rounded-full bg-red-500"
                style={{ width: `${Math.min(100, (quotaErrorDetails.used / quotaErrorDetails.quota) * 100)}%` }}
              />
            </div>
            
            <p className="text-sm text-gray-500 text-center mb-4">
              Delete some files or empty your trash to free up space.
            </p>
            
            <button
              onClick={() => setShowQuotaError(false)}
              className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
