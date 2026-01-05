import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import {
  File,
  Folder,
  Download,
  Lock,
  FileText,
  Image,
  Film,
  Music,
  Archive,
  AlertCircle,
  ChevronRight,
  Home,
  ZoomIn,
  ZoomOut,
  RotateCw,
} from 'lucide-react';

const FILE_ICONS = {
  'application/pdf': FileText,
  'text/plain': FileText,
  'image': Image,
  'video': Film,
  'audio': Music,
  'application/zip': Archive,
  'application/x-rar': Archive,
};

const FILE_CATEGORIES = {
  image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp'],
  pdf: ['application/pdf'],
  video: ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'],
  audio: ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/mp4'],
  text: ['text/plain', 'text/html', 'text/css', 'text/javascript', 'application/json', 'text/markdown', 'text/csv', 'text/xml', 'application/xml'],
};

function getFileCategory(mimeType) {
  if (!mimeType) return 'unknown';
  for (const [category, types] of Object.entries(FILE_CATEGORIES)) {
    if (types.includes(mimeType)) return category;
  }
  return 'unknown';
}

function getFileIcon(mimeType) {
  if (!mimeType) return File;
  
  for (const [key, Icon] of Object.entries(FILE_ICONS)) {
    if (mimeType.startsWith(key)) return Icon;
  }
  
  return File;
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export default function PublicSharePage() {
  const { token } = useParams();
  const [searchParams] = useSearchParams();
  const pathParam = searchParams.get('path') || '';
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [needsPassword, setNeedsPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [shareInfo, setShareInfo] = useState(null);
  const [items, setItems] = useState([]);
  const [breadcrumbs, setBreadcrumbs] = useState([]);
  
  // File preview state
  const [textContent, setTextContent] = useState('');
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);
  
  useEffect(() => {
    loadShare();
  }, [token, pathParam]);

  const loadShare = async (pwd) => {
    setLoading(true);
    setError('');
    
    try {
      const url = new URL(`/api/public/${token}`, window.location.origin);
      if (pathParam) url.searchParams.set('path', pathParam);
      if (pwd) url.searchParams.set('password', pwd);
      
      const res = await fetch(url);
      const data = await res.json();
      
      if (!res.ok) {
        if (res.status === 401 && data.requiresPassword) {
          setNeedsPassword(true);
          if (pwd) setPasswordError('Incorrect password');
        } else {
          setError(data.error || 'Failed to load share');
        }
        return;
      }
      
      setNeedsPassword(false);
      setShareInfo(data);
      setItems(data.items || []);
      setBreadcrumbs(data.breadcrumbs || []);
      
      // Load text content for text files
      if (data.itemType === 'file') {
        const category = getFileCategory(data.mime);
        if (category === 'text') {
          try {
            const previewUrl = new URL(`/api/public/${token}/preview`, window.location.origin);
            if (pwd) previewUrl.searchParams.set('password', pwd);
            const textRes = await fetch(previewUrl);
            if (textRes.ok) {
              const text = await textRes.text();
              setTextContent(text);
            }
          } catch (err) {
            console.error('Failed to load text content:', err);
          }
        }
      }
    } catch (err) {
      setError('Failed to load share');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSubmit = (e) => {
    e.preventDefault();
    setPasswordError('');
    loadShare(password);
  };

  const handleDownload = async (item) => {
    const url = new URL(`/api/public/${token}/download`, window.location.origin);
    if (item?.type === 'folder') {
      url.searchParams.set('path', pathParam ? `${pathParam}/${item.name}` : item.name);
    } else if (pathParam) {
      url.searchParams.set('path', pathParam);
    }
    if (password) url.searchParams.set('password', password);
    
    window.location.href = url.toString();
  };

  const handleNavigate = (item) => {
    if (item.type !== 'folder') return;
    
    const newPath = pathParam ? `${pathParam}/${item.name}` : item.name;
    const url = new URL(window.location.href);
    url.searchParams.set('path', newPath);
    window.location.href = url.toString();
  };

  const handleBreadcrumbClick = (index) => {
    if (index === -1) {
      const url = new URL(window.location.href);
      url.searchParams.delete('path');
      window.location.href = url.toString();
      return;
    }
    
    const newPath = breadcrumbs.slice(0, index + 1).join('/');
    const url = new URL(window.location.href);
    url.searchParams.set('path', newPath);
    window.location.href = url.toString();
  };

  const handleZoomIn = () => setZoom(z => Math.min(z + 25, 200));
  const handleZoomOut = () => setZoom(z => Math.max(z - 25, 25));
  const handleRotate = () => setRotation(r => (r + 90) % 360);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="spinner w-8 h-8"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Share Not Found</h1>
          <p className="text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  if (needsPassword) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock className="w-8 h-8 text-blue-500" />
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2 text-center">
            Password Protected
          </h1>
          <p className="text-gray-500 text-center mb-6">
            This shared content is protected. Enter the password to access it.
          </p>
          
          {passwordError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {passwordError}
            </div>
          )}
          
          <form onSubmit={handlePasswordSubmit}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 mb-4"
              autoFocus
            />
            <button
              type="submit"
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition"
            >
              Access Share
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Render file preview page
  if (shareInfo?.itemType === 'file') {
    const category = getFileCategory(shareInfo.mime);
    const previewUrl = `/api/public/${token}/preview${password ? `?password=${encodeURIComponent(password)}` : ''}`;
    const Icon = getFileIcon(shareInfo.mime);
    
    const renderPreview = () => {
      switch (category) {
        case 'image':
          return (
            <div className="flex items-center justify-center h-full overflow-auto p-4 bg-gray-900">
              <img
                src={previewUrl}
                alt={shareInfo.itemName}
                className="max-w-full max-h-full object-contain transition-transform duration-200"
                style={{
                  transform: `scale(${zoom / 100}) rotate(${rotation}deg)`,
                }}
              />
            </div>
          );

        case 'pdf':
          return (
            <iframe
              src={previewUrl}
              className="w-full h-full"
              title={shareInfo.itemName}
            />
          );

        case 'video':
          return (
            <div className="flex items-center justify-center h-full p-4 bg-gray-900">
              <video
                src={previewUrl}
                controls
                autoPlay
                className="max-w-full max-h-full"
              >
                Your browser does not support video playback.
              </video>
            </div>
          );

        case 'audio':
          return (
            <div className="flex flex-col items-center justify-center h-full p-4 bg-gray-900">
              <div className="w-48 h-48 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center mb-8 shadow-lg">
                <Music className="w-20 h-20 text-white" />
              </div>
              <p className="text-white text-lg font-medium mb-4">{shareInfo.itemName}</p>
              <audio
                src={previewUrl}
                controls
                autoPlay
                className="w-full max-w-md"
              >
                Your browser does not support audio playback.
              </audio>
            </div>
          );

        case 'text':
          return (
            <div className="h-full overflow-auto p-4 bg-gray-50">
              <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-auto text-sm font-mono whitespace-pre-wrap min-h-full">
                {textContent || 'Loading...'}
              </pre>
            </div>
          );

        default:
          return (
            <div className="flex flex-col items-center justify-center h-full bg-gray-50">
              <Icon className="w-24 h-24 text-gray-400 mb-4" />
              <p className="text-gray-700 text-lg mb-2">{shareInfo.itemName}</p>
              <p className="text-gray-500 text-sm mb-6">{formatBytes(shareInfo.size)}</p>
              <button
                onClick={() => handleDownload()}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg flex items-center gap-2 transition"
              >
                <Download className="w-5 h-5" />
                Download
              </button>
            </div>
          );
      }
    };

    return (
      <div className="min-h-screen bg-gray-100 flex flex-col">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                <Icon className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="font-semibold text-gray-900">{shareInfo.itemName}</h1>
                <p className="text-sm text-gray-500">
                  {formatBytes(shareInfo.size)} • Shared file
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {/* Zoom controls for images */}
              {category === 'image' && (
                <>
                  <button
                    onClick={handleZoomOut}
                    className="p-2 hover:bg-gray-100 rounded-lg transition"
                    title="Zoom out"
                  >
                    <ZoomOut className="w-5 h-5 text-gray-600" />
                  </button>
                  <span className="text-sm text-gray-600 min-w-[3rem] text-center">{zoom}%</span>
                  <button
                    onClick={handleZoomIn}
                    className="p-2 hover:bg-gray-100 rounded-lg transition"
                    title="Zoom in"
                  >
                    <ZoomIn className="w-5 h-5 text-gray-600" />
                  </button>
                  <button
                    onClick={handleRotate}
                    className="p-2 hover:bg-gray-100 rounded-lg transition"
                    title="Rotate"
                  >
                    <RotateCw className="w-5 h-5 text-gray-600" />
                  </button>
                  <div className="w-px h-6 bg-gray-200 mx-2" />
                </>
              )}
              
              <button
                onClick={() => handleDownload()}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition"
              >
                <Download className="w-4 h-4" />
                Download
              </button>
            </div>
          </div>
        </header>

        {/* Preview Area */}
        <main className="flex-1 overflow-hidden">
          {renderPreview()}
        </main>
      </div>
    );
  }

  // Render folder view
  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
              <Folder className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-semibold text-gray-900">{shareInfo?.itemName}</h1>
              <p className="text-sm text-gray-500">
                Shared folder
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Breadcrumbs */}
      {breadcrumbs.length > 0 && (
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-5xl mx-auto px-4 py-2">
            <div className="flex items-center gap-1 text-sm">
              <button
                onClick={() => handleBreadcrumbClick(-1)}
                className="flex items-center gap-1 text-blue-600 hover:text-blue-700"
              >
                <Home className="w-4 h-4" />
                {shareInfo?.itemName}
              </button>
              {breadcrumbs.map((crumb, index) => (
                <span key={index} className="flex items-center gap-1">
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                  <button
                    onClick={() => handleBreadcrumbClick(index)}
                    className={index === breadcrumbs.length - 1
                      ? 'text-gray-900 font-medium'
                      : 'text-blue-600 hover:text-blue-700'
                    }
                  >
                    {crumb}
                  </button>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {items.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <Folder className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>This folder is empty</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                    Size
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                    Modified
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((item) => {
                  const ItemIcon = item.type === 'folder' ? Folder : getFileIcon(item.mime_type);
                  
                  return (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <button
                          onClick={() => item.type === 'folder' ? handleNavigate(item) : handleDownload(item)}
                          className="flex items-center gap-3 text-left hover:text-blue-600 transition"
                        >
                          <ItemIcon className={`w-5 h-5 ${
                            item.type === 'folder' ? 'text-blue-500' : 'text-gray-400'
                          }`} />
                          <span className="font-medium text-gray-900">{item.name}</span>
                        </button>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {item.type === 'folder' ? '-' : formatBytes(item.size || 0)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {item.updated_at
                          ? format(new Date(item.updated_at), 'MMM d, yyyy')
                          : '-'
                        }
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end">
                          {item.type !== 'folder' && (
                            <button
                              onClick={() => handleDownload(item)}
                              className="p-2 hover:bg-gray-100 rounded-lg transition"
                              title="Download"
                            >
                              <Download className="w-4 h-4 text-gray-500" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
