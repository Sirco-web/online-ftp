import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import {
  X,
  Copy,
  Link,
  User,
  Mail,
  Lock,
  Calendar,
  Trash2,
  Check,
  AlertCircle,
} from 'lucide-react';

export default function ShareModal({ item, onClose }) {
  const { csrfToken } = useAuth();
  const [shares, setShares] = useState([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [permission, setPermission] = useState('view');
  const [linkShare, setLinkShare] = useState(null);
  const [linkPassword, setLinkPassword] = useState('');
  const [linkExpiry, setLinkExpiry] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadShares();
  }, [item.id]);

  const loadShares = async () => {
    try {
      setLoading(true);
      const data = await api.get(`/api/share/${item.type}/${item.id}`);
      setShares(data.shares || []);
      
      // Find existing link share
      const existingLink = data.shares?.find(s => s.share_type === 'link');
      setLinkShare(existingLink || null);
    } catch (err) {
      console.error('Failed to load shares:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleShareWithUser = async (e) => {
    e.preventDefault();
    setError('');

    if (!email.trim()) {
      setError('Email is required');
      return;
    }

    try {
      await api.post('/api/share/user', {
        itemType: item.type,
        itemId: item.id,
        email: email.trim(),
        permission,
      }, csrfToken);
      
      setEmail('');
      loadShares();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCreateLink = async () => {
    try {
      const data = await api.post('/api/share/link/create', {
        itemType: item.type,
        itemId: item.id,
        permission: 'view',
        password: linkPassword || undefined,
        expiresAt: linkExpiry || undefined,
      }, csrfToken);
      
      setLinkShare({
        ...data,
        link: data.link,
      });
      loadShares();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRevokeLink = async () => {
    if (!linkShare) return;
    
    if (!confirm('Revoke this link? Anyone with this link will no longer have access.')) {
      return;
    }

    try {
      await api.post('/api/share/link/revoke', {
        token: linkShare.link_token || linkShare.token,
      }, csrfToken);
      
      setLinkShare(null);
      loadShares();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRemoveUser = async (shareId) => {
    try {
      await api.delete(`/api/share/user/${shareId}`, csrfToken);
      loadShares();
    } catch (err) {
      setError(err.message);
    }
  };

  const copyLink = () => {
    if (linkShare?.link) {
      navigator.clipboard.writeText(linkShare.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const userShares = shares.filter(s => s.share_type === 'user');

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            Share "{item.name}"
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Share with users */}
          <div>
            <h3 className="text-sm font-medium text-gray-900 mb-3 flex items-center gap-2">
              <User className="w-4 h-4" />
              Share with people
            </h3>
            
            <form onSubmit={handleShareWithUser} className="flex gap-2 mb-4">
              <div className="flex-1 relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter email address"
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                />
              </div>
              <select
                value={permission}
                onChange={(e) => setPermission(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              >
                <option value="view">Viewer</option>
                <option value="edit">Editor</option>
              </select>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition"
              >
                Share
              </button>
            </form>

            {/* Shared users list */}
            {userShares.length > 0 && (
              <div className="space-y-2">
                {userShares.map((share) => (
                  <div
                    key={share.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                        <span className="text-sm font-medium text-blue-700">
                          {share.target_email?.[0]?.toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {share.target_email}
                        </p>
                        <p className="text-xs text-gray-500 capitalize">
                          {share.permission}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemoveUser(share.id)}
                      className="p-1 hover:bg-gray-200 rounded transition"
                      title="Remove access"
                    >
                      <Trash2 className="w-4 h-4 text-gray-400" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Link sharing */}
          <div>
            <h3 className="text-sm font-medium text-gray-900 mb-3 flex items-center gap-2">
              <Link className="w-4 h-4" />
              Share with link
            </h3>

            {linkShare ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={linkShare.link}
                    readOnly
                    className="flex-1 px-3 py-2 bg-gray-100 border border-gray-200 rounded-lg text-sm"
                  />
                  <button
                    onClick={copyLink}
                    className="p-2 hover:bg-gray-100 rounded-lg transition"
                    title="Copy link"
                  >
                    {copied ? (
                      <Check className="w-5 h-5 text-green-500" />
                    ) : (
                      <Copy className="w-5 h-5 text-gray-500" />
                    )}
                  </button>
                </div>
                
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">
                    Anyone with this link can {linkShare.permission || 'view'}
                  </span>
                  <button
                    onClick={handleRevokeLink}
                    className="text-red-600 hover:text-red-700"
                  >
                    Revoke link
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="flex-1 relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="password"
                      value={linkPassword}
                      onChange={(e) => setLinkPassword(e.target.value)}
                      placeholder="Password (optional)"
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex-1 relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="datetime-local"
                      value={linkExpiry}
                      onChange={(e) => setLinkExpiry(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <button
                  onClick={handleCreateLink}
                  className="w-full px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition"
                >
                  Create shareable link
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
