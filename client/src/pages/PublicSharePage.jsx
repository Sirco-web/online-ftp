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
      setShareInfo(data.share);
      setItems(data.items || (data.file ? [data.file] : []));
      setBreadcrumbs(data.breadcrumbs || []);
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
    if (item.type === 'folder') {
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

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
              {shareInfo?.itemType === 'folder' ? (
                <Folder className="w-5 h-5 text-white" />
              ) : (
                <File className="w-5 h-5 text-white" />
              )}
            </div>
            <div>
              <h1 className="font-semibold text-gray-900">{shareInfo?.name}</h1>
              <p className="text-sm text-gray-500">
                Shared by {shareInfo?.ownerEmail}
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
                {shareInfo?.name}
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
                  const Icon = item.type === 'folder' ? Folder : getFileIcon(item.mime_type);
                  
                  return (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <button
                          onClick={() => item.type === 'folder' ? handleNavigate(item) : handleDownload(item)}
                          className="flex items-center gap-3 text-left hover:text-blue-600 transition"
                        >
                          <Icon className={`w-5 h-5 ${
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
