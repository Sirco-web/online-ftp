import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api, formatBytes } from '../lib/api';
import { format } from 'date-fns';
import {
  X,
  File,
  Folder,
  Download,
  Share2,
  Star,
  StarOff,
  Trash2,
  History,
  Activity,
  User,
  Calendar,
  HardDrive,
  RotateCcw,
} from 'lucide-react';

export default function DetailsDrawer({ item, onClose, onAction, onRefresh }) {
  const { csrfToken } = useAuth();
  const [activeTab, setActiveTab] = useState('details');
  const [versions, setVersions] = useState([]);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (item.type === 'file' && activeTab === 'versions') {
      loadVersions();
    }
    if (activeTab === 'activity') {
      loadActivity();
    }
  }, [item.id, activeTab]);

  const loadVersions = async () => {
    try {
      setLoading(true);
      const data = await api.get(`/api/files/${item.id}/versions`);
      setVersions(data.versions || []);
    } catch (err) {
      console.error('Failed to load versions:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadActivity = async () => {
    try {
      setLoading(true);
      const data = await api.get(`/api/items/${item.type}/${item.id}`);
      // Activity would come from the activity log in a full implementation
      setActivity([]);
    } catch (err) {
      console.error('Failed to load activity:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRestoreVersion = async (versionId) => {
    if (!confirm('Restore this version? A new version will be created from this one.')) {
      return;
    }

    try {
      await api.post(`/api/files/${item.id}/versions/${versionId}/restore`, {}, csrfToken);
      alert('Version restored successfully');
      onRefresh?.();
      loadVersions();
    } catch (err) {
      alert(err.message);
    }
  };

  const tabs = [
    { id: 'details', label: 'Details', icon: File },
    ...(item.type === 'file' ? [{ id: 'versions', label: 'Versions', icon: History }] : []),
    { id: 'activity', label: 'Activity', icon: Activity },
  ];

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-white shadow-xl border-l border-gray-200 z-40 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div className="flex items-center gap-3 min-w-0">
          {item.type === 'folder' ? (
            <Folder className="w-6 h-6 text-blue-500 flex-shrink-0" />
          ) : (
            <File className="w-6 h-6 text-gray-400 flex-shrink-0" />
          )}
          <h2 className="font-semibold text-gray-900 truncate">{item.name}</h2>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-gray-100 rounded-lg transition"
        >
          <X className="w-5 h-5 text-gray-400" />
        </button>
      </div>

      {/* Quick actions */}
      <div className="flex items-center gap-2 p-4 border-b border-gray-200">
        {item.type === 'file' && (
          <button
            onClick={() => window.open(`/api/files/${item.id}/download`, '_blank')}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
          >
            <Download className="w-4 h-4" />
            <span>Download</span>
          </button>
        )}
        <button
          onClick={() => onAction('share')}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 border border-gray-300 hover:bg-gray-50 rounded-lg transition"
        >
          <Share2 className="w-4 h-4" />
          <span>Share</span>
        </button>
        <button
          onClick={() => onAction('star')}
          className="p-2 border border-gray-300 hover:bg-gray-50 rounded-lg transition"
          title={item.starred ? 'Remove from starred' : 'Add to starred'}
        >
          {item.starred ? (
            <Star className="w-5 h-5 text-yellow-500 fill-yellow-500" />
          ) : (
            <StarOff className="w-5 h-5 text-gray-400" />
          )}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition
                ${activeTab === tab.id
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
                }
              `}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'details' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Properties
              </h3>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <User className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500">Owner</p>
                    <p className="text-sm text-gray-900">{item.owner_email || 'You'}</p>
                  </div>
                </div>
                
                {item.type === 'file' && (
                  <div className="flex items-center gap-3">
                    <HardDrive className="w-5 h-5 text-gray-400" />
                    <div>
                      <p className="text-xs text-gray-500">Size</p>
                      <p className="text-sm text-gray-900">{formatBytes(item.size)}</p>
                    </div>
                  </div>
                )}
                
                <div className="flex items-center gap-3">
                  <Calendar className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500">Modified</p>
                    <p className="text-sm text-gray-900">
                      {format(new Date(item.updated_at || item.created_at), 'PPpp')}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <Calendar className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500">Created</p>
                    <p className="text-sm text-gray-900">
                      {format(new Date(item.created_at), 'PPpp')}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {item.type === 'file' && item.mime && (
              <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                  File Type
                </h3>
                <p className="text-sm text-gray-900">{item.mime}</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'versions' && (
          <div>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="spinner w-6 h-6"></div>
              </div>
            ) : versions.length === 0 ? (
              <p className="text-center text-gray-500 py-8">No version history</p>
            ) : (
              <div className="space-y-3">
                {versions.map((version, index) => (
                  <div
                    key={version.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {index === 0 ? 'Current version' : `Version ${versions.length - index}`}
                      </p>
                      <p className="text-xs text-gray-500">
                        {format(new Date(version.created_at), 'PPpp')}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatBytes(version.size)} • {version.created_by_email || 'Unknown'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => window.open(`/api/files/${item.id}/versions/${version.id}/download`, '_blank')}
                        className="p-2 hover:bg-gray-200 rounded transition"
                        title="Download this version"
                      >
                        <Download className="w-4 h-4 text-gray-500" />
                      </button>
                      {index !== 0 && (
                        <button
                          onClick={() => handleRestoreVersion(version.id)}
                          className="p-2 hover:bg-gray-200 rounded transition"
                          title="Restore this version"
                        >
                          <RotateCcw className="w-4 h-4 text-gray-500" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'activity' && (
          <div>
            <p className="text-center text-gray-500 py-8">Activity log coming soon</p>
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="p-4 border-t border-gray-200">
        <button
          onClick={() => onAction('trash')}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition"
        >
          <Trash2 className="w-4 h-4" />
          <span>Move to trash</span>
        </button>
      </div>
    </div>
  );
}
