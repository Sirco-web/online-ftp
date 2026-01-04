import { useState, useEffect } from 'react';
import { 
  X, 
  Download, 
  ChevronLeft, 
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Maximize2,
  FileText,
  File,
  ExternalLink,
  Share2,
  Trash2,
} from 'lucide-react';

// File type categories
const FILE_CATEGORIES = {
  image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp'],
  pdf: ['application/pdf'],
  video: ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'],
  audio: ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/mp4'],
  text: ['text/plain', 'text/html', 'text/css', 'text/javascript', 'application/json', 'text/markdown', 'text/csv', 'text/xml', 'application/xml'],
  office: [
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.oasis.opendocument.text',
    'application/vnd.oasis.opendocument.spreadsheet',
    'application/vnd.oasis.opendocument.presentation',
  ],
};

function getFileCategory(mimeType) {
  for (const [category, types] of Object.entries(FILE_CATEGORIES)) {
    if (types.includes(mimeType)) return category;
  }
  return 'unknown';
}

function getOfficeViewerUrl(fileUrl, fileName) {
  // Use Microsoft Office Online viewer for Office documents
  const encodedUrl = encodeURIComponent(window.location.origin + fileUrl);
  return `https://view.officeapps.live.com/op/embed.aspx?src=${encodedUrl}`;
}

function getGoogleDocsViewerUrl(fileUrl) {
  // Use Google Docs Viewer as fallback
  const encodedUrl = encodeURIComponent(window.location.origin + fileUrl);
  return `https://docs.google.com/viewer?url=${encodedUrl}&embedded=true`;
}

export default function FilePreviewModal({ file, files = [], onClose, onNavigate, onShare, onDelete }) {
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [textContent, setTextContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [useGoogleViewer, setUseGoogleViewer] = useState(false);

  const currentIndex = files.findIndex(f => f.id === file.id);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < files.length - 1;
  
  const category = getFileCategory(file.mime_type || file.mime);
  const previewUrl = `/api/files/${file.id}/preview`;
  const downloadUrl = `/api/files/${file.id}/download`;

  useEffect(() => {
    setLoading(true);
    setError(null);
    setZoom(100);
    setRotation(0);
    setTextContent('');
    setUseGoogleViewer(false);

    // Load text content for text files
    if (category === 'text') {
      fetch(previewUrl, { credentials: 'include' })
        .then(res => {
          if (!res.ok) throw new Error('Failed to load file');
          return res.text();
        })
        .then(text => {
          setTextContent(text);
          setLoading(false);
        })
        .catch(err => {
          setError(err.message);
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, [file.id, category, previewUrl]);

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'ArrowLeft' && hasPrev) onNavigate(files[currentIndex - 1]);
    if (e.key === 'ArrowRight' && hasNext) onNavigate(files[currentIndex + 1]);
  };

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, files]);

  const handleZoomIn = () => setZoom(z => Math.min(z + 25, 200));
  const handleZoomOut = () => setZoom(z => Math.max(z - 25, 25));
  const handleRotate = () => setRotation(r => (r + 90) % 360);
  const handleReset = () => { setZoom(100); setRotation(0); };

  const renderPreview = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="spinner w-12 h-12"></div>
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-white">
          <File className="w-16 h-16 mb-4 opacity-50" />
          <p className="text-lg mb-2">Unable to preview this file</p>
          <p className="text-sm opacity-70 mb-4">{error}</p>
          <a
            href={downloadUrl}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            Download instead
          </a>
        </div>
      );
    }

    switch (category) {
      case 'image':
        return (
          <div className="flex items-center justify-center h-full overflow-auto p-4">
            <img
              src={previewUrl}
              alt={file.name}
              className="max-w-full max-h-full object-contain transition-transform duration-200"
              style={{
                transform: `scale(${zoom / 100}) rotate(${rotation}deg)`,
              }}
              onError={() => setError('Failed to load image')}
            />
          </div>
        );

      case 'pdf':
        return (
          <iframe
            src={previewUrl}
            className="w-full h-full"
            title={file.name}
            onError={() => setError('Failed to load PDF')}
          />
        );

      case 'video':
        return (
          <div className="flex items-center justify-center h-full p-4">
            <video
              src={previewUrl}
              controls
              autoPlay
              className="max-w-full max-h-full"
              onError={() => setError('Failed to load video')}
            >
              Your browser does not support video playback.
            </video>
          </div>
        );

      case 'audio':
        return (
          <div className="flex flex-col items-center justify-center h-full p-4">
            <div className="w-64 h-64 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center mb-8 shadow-lg">
              <FileText className="w-24 h-24 text-white" />
            </div>
            <audio
              src={previewUrl}
              controls
              autoPlay
              className="w-full max-w-md"
              onError={() => setError('Failed to load audio')}
            >
              Your browser does not support audio playback.
            </audio>
          </div>
        );

      case 'text':
        return (
          <div className="h-full overflow-auto p-4">
            <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-auto text-sm font-mono whitespace-pre-wrap">
              {textContent}
            </pre>
          </div>
        );

      case 'office':
        // Try Microsoft Office Online viewer first, fallback to Google Docs
        const viewerUrl = useGoogleViewer 
          ? getGoogleDocsViewerUrl(previewUrl)
          : getOfficeViewerUrl(previewUrl, file.name);
        
        return (
          <div className="h-full flex flex-col">
            <div className="bg-gray-800 px-4 py-2 flex items-center justify-between">
              <span className="text-white text-sm">
                {useGoogleViewer ? 'Google Docs Viewer' : 'Microsoft Office Viewer'}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setUseGoogleViewer(!useGoogleViewer)}
                  className="text-xs text-blue-400 hover:text-blue-300"
                >
                  Switch to {useGoogleViewer ? 'Microsoft' : 'Google'} Viewer
                </button>
                <a
                  href={downloadUrl}
                  className="text-xs text-gray-400 hover:text-white flex items-center gap-1"
                >
                  <Download className="w-3 h-3" />
                  Download
                </a>
              </div>
            </div>
            <iframe
              src={viewerUrl}
              className="flex-1 w-full bg-white"
              title={file.name}
              sandbox="allow-scripts allow-same-origin allow-popups"
            />
          </div>
        );

      default:
        return (
          <div className="flex flex-col items-center justify-center h-full text-white">
            <File className="w-24 h-24 mb-4 opacity-50" />
            <p className="text-xl mb-2">{file.name}</p>
            <p className="text-sm opacity-70 mb-6">
              {file.mime_type || file.mime || 'Unknown file type'}
            </p>
            <a
              href={downloadUrl}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg flex items-center gap-2 text-lg"
            >
              <Download className="w-5 h-5" />
              Download File
            </a>
          </div>
        );
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/90 flex flex-col"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/50">
        <div className="flex items-center gap-4">
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition"
          >
            <X className="w-6 h-6 text-white" />
          </button>
          <div>
            <h2 className="text-white font-medium truncate max-w-md">{file.name}</h2>
            <p className="text-gray-400 text-sm">
              {file.mime_type || file.mime}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Zoom controls for images */}
          {category === 'image' && (
            <>
              <button
                onClick={handleZoomOut}
                className="p-2 hover:bg-white/10 rounded-lg transition"
                title="Zoom out"
              >
                <ZoomOut className="w-5 h-5 text-white" />
              </button>
              <span className="text-white text-sm w-12 text-center">{zoom}%</span>
              <button
                onClick={handleZoomIn}
                className="p-2 hover:bg-white/10 rounded-lg transition"
                title="Zoom in"
              >
                <ZoomIn className="w-5 h-5 text-white" />
              </button>
              <button
                onClick={handleRotate}
                className="p-2 hover:bg-white/10 rounded-lg transition"
                title="Rotate"
              >
                <RotateCw className="w-5 h-5 text-white" />
              </button>
              <button
                onClick={handleReset}
                className="p-2 hover:bg-white/10 rounded-lg transition"
                title="Reset"
              >
                <Maximize2 className="w-5 h-5 text-white" />
              </button>
              <div className="w-px h-6 bg-white/20 mx-2" />
            </>
          )}

          {/* Open in new tab */}
          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 hover:bg-white/10 rounded-lg transition"
            title="Open in new tab"
          >
            <ExternalLink className="w-5 h-5 text-white" />
          </a>

          {/* Share */}
          {onShare && (
            <button
              onClick={() => onShare(file)}
              className="p-2 hover:bg-white/10 rounded-lg transition"
              title="Share"
            >
              <Share2 className="w-5 h-5 text-white" />
            </button>
          )}

          {/* Download */}
          <a
            href={downloadUrl}
            className="p-2 hover:bg-white/10 rounded-lg transition"
            title="Download"
          >
            <Download className="w-5 h-5 text-white" />
          </a>

          {/* Delete */}
          {onDelete && (
            <button
              onClick={() => onDelete(file)}
              className="p-2 hover:bg-white/10 rounded-lg transition"
              title="Move to trash"
            >
              <Trash2 className="w-5 h-5 text-white" />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 relative overflow-hidden">
        {renderPreview()}

        {/* Navigation arrows */}
        {files.length > 1 && (
          <>
            {hasPrev && (
              <button
                onClick={() => onNavigate(files[currentIndex - 1])}
                className="absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-black/50 hover:bg-black/70 rounded-full transition"
              >
                <ChevronLeft className="w-8 h-8 text-white" />
              </button>
            )}
            {hasNext && (
              <button
                onClick={() => onNavigate(files[currentIndex + 1])}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-black/50 hover:bg-black/70 rounded-full transition"
              >
                <ChevronRight className="w-8 h-8 text-white" />
              </button>
            )}
          </>
        )}
      </div>

      {/* Footer with file count */}
      {files.length > 1 && (
        <div className="flex items-center justify-center py-3 bg-black/50">
          <span className="text-white text-sm">
            {currentIndex + 1} of {files.length}
          </span>
        </div>
      )}
    </div>
  );
}
