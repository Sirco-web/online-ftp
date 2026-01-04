import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api, formatBytes } from '../lib/api';
import { format } from 'date-fns';
import {
  Settings,
  Users,
  Activity,
  HardDrive,
  File,
  Folder,
  Plus,
  Trash2,
  Edit,
  Shield,
  AlertCircle,
  X,
  Save,
  ToggleLeft,
  ToggleRight,
  Database,
  Ban,
  UserCheck,
  Crown,
  Key,
  AlertTriangle,
} from 'lucide-react';

function UserModal({ user, onClose, onSave, isCurrentUserOwner }) {
  const { csrfToken } = useAuth();
  const [email, setEmail] = useState(user?.email || '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState(user?.role || 'user');
  const [storageQuota, setStorageQuota] = useState(user?.storage_quota ? (user.storage_quota === -1 ? -1 : user.storage_quota / (1024 * 1024 * 1024)) : 5);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (user) {
        await api.put(`/api/admin/users/${user.id}`, {
          email: email !== user.email ? email : undefined,
          password: password || undefined,
          role,
        }, csrfToken);
        
        // Update quota separately
        const quotaInBytes = Math.floor(storageQuota * 1024 * 1024 * 1024);
        await api.put(`/api/admin/users/${user.id}/quota`, {
          quota: quotaInBytes,
        }, csrfToken);
      } else {
        await api.post('/api/admin/users', {
          email,
          password,
          role,
        }, csrfToken);
      }
      onSave();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-900">
            {user ? 'Edit User' : 'Create User'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
            <AlertCircle className="w-4 h-4" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password {user && '(leave blank to keep current)'}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              required={!user}
              minLength={8}
              placeholder={user ? '••••••••' : 'At least 8 characters'}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Role
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              disabled={user?.isOwner}
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
              {user?.role === 'owner' && <option value="owner">Owner</option>}
            </select>
            {user?.isOwner && (
              <p className="text-xs text-amber-600 mt-1">The owner role cannot be changed here</p>
            )}
          </div>

          {user && role !== 'admin' && role !== 'owner' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Storage Quota (GB)
              </label>
              <input
                type="number"
                value={storageQuota}
                onChange={(e) => setStorageQuota(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                min="0"
                step="0.5"
              />
              {user.storage_used > 0 && (
                <p className="text-xs text-gray-500 mt-1">
                  Currently using {formatBytes(user.storage_used)}
                </p>
              )}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg disabled:opacity-50"
            >
              {loading ? 'Saving...' : user ? 'Save' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const { csrfToken, isOwner: currentUserIsOwner } = useAuth();
  const [activeTab, setActiveTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [activity, setActivity] = useState([]);
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [showOwnerConfirm, setShowOwnerConfirm] = useState(false);
  const [ownerConfirmCount, setOwnerConfirmCount] = useState(0);
  const [targetOwnerUser, setTargetOwnerUser] = useState(null);

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'users') {
        const data = await api.get('/api/admin/users');
        setUsers(data.users || []);
      } else if (activeTab === 'stats') {
        const data = await api.get('/api/admin/stats');
        setStats(data);
      } else if (activeTab === 'activity') {
        const data = await api.get('/api/admin/activity');
        setActivity(data.logs || []);
      } else if (activeTab === 'settings') {
        const data = await api.get('/api/admin/settings');
        setSettings(data.settings || {});
      }
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      await api.put('/api/admin/settings', { settings }, csrfToken);
    } catch (err) {
      console.error('Failed to save settings:', err);
      alert('Failed to save settings: ' + err.message);
    } finally {
      setSavingSettings(false);
    }
  };

  const toggleSetting = (key) => {
    setSettings(prev => ({
      ...prev,
      [key]: prev[key] === 'true' ? 'false' : 'true',
    }));
  };

  const handleDeleteUser = async (user) => {
    if (!confirm(`Delete user "${user.email}"? This will also delete all their files.`)) {
      return;
    }

    try {
      await api.delete(`/api/admin/users/${user.id}`, csrfToken);
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleChangeStatus = async (user, newStatus) => {
    const statusLabels = { active: 'activate', suspended: 'suspend', banned: 'ban' };
    if (!confirm(`Are you sure you want to ${statusLabels[newStatus]} user "${user.email}"?`)) {
      return;
    }

    try {
      await api.put(`/api/admin/users/${user.id}/status`, { status: newStatus }, csrfToken);
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleMakeOwner = (user) => {
    setTargetOwnerUser(user);
    setOwnerConfirmCount(0);
    setShowOwnerConfirm(true);
  };

  const handleOwnerConfirmClick = async () => {
    const newCount = ownerConfirmCount + 1;
    setOwnerConfirmCount(newCount);
    
    if (newCount >= 5) {
      try {
        await api.post(`/api/admin/users/${targetOwnerUser.id}/make-owner`, { confirmations: 5 }, csrfToken);
        alert(`Ownership has been transferred to ${targetOwnerUser.email}`);
        setShowOwnerConfirm(false);
        setTargetOwnerUser(null);
        setOwnerConfirmCount(0);
        loadData();
      } catch (err) {
        alert(err.message);
      }
    }
  };

  const handleEditUser = (user) => {
    setEditingUser(user);
    setShowUserModal(true);
  };

  const handleCreateUser = () => {
    setEditingUser(null);
    setShowUserModal(true);
  };

  const handleUserSaved = () => {
    setShowUserModal(false);
    setEditingUser(null);
    loadData();
  };

  const tabs = [
    { id: 'users', label: 'Users', icon: Users },
    { id: 'stats', label: 'Statistics', icon: HardDrive },
    { id: 'activity', label: 'Activity Log', icon: Activity },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <div className="flex-shrink-0 px-6 py-4 border-b border-gray-200 bg-white">
        <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
          <Settings className="w-6 h-6 text-gray-400" />
          Admin Panel
        </h1>
      </div>

      {/* Tabs */}
      <div className="flex-shrink-0 border-b border-gray-200 bg-white px-6">
        <div className="flex gap-4">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition
                  ${activeTab === tab.id
                    ? 'text-blue-600 border-blue-600'
                    : 'text-gray-500 border-transparent hover:text-gray-700'
                  }
                `}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="spinner w-8 h-8"></div>
          </div>
        ) : (
          <>
            {/* Users Tab */}
            {activeTab === 'users' && (
              <div>
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-medium text-gray-900">
                    {users.length} Users
                  </h2>
                  <button
                    onClick={handleCreateUser}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition"
                  >
                    <Plus className="w-4 h-4" />
                    Add User
                  </button>
                </div>

                <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                          Email
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                          Role
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                          Status
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                          Storage
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {users.map((user) => {
                        const quota = user.storage_quota || 5368709120;
                        const used = user.storage_used || 0;
                        const isUnlimited = quota === -1;
                        const percent = isUnlimited ? 0 : Math.min(100, (used / quota) * 100);
                        
                        return (
                        <tr key={user.id} className={`hover:bg-gray-50 ${user.status !== 'active' ? 'opacity-60' : ''}`}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                                user.isOwner ? 'bg-amber-100' : user.role === 'admin' ? 'bg-purple-100' : 'bg-blue-100'
                              }`}>
                                {user.isOwner ? (
                                  <Crown className="w-4 h-4 text-amber-600" />
                                ) : (
                                  <span className={`text-sm font-medium ${user.role === 'admin' ? 'text-purple-700' : 'text-blue-700'}`}>
                                    {user.email[0].toUpperCase()}
                                  </span>
                                )}
                              </div>
                              <div>
                                <span className="font-medium text-gray-900">
                                  {user.email}
                                </span>
                                {user.isOwner && (
                                  <p className="text-xs text-amber-600">System Owner</p>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`
                              inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium
                              ${user.role === 'owner' 
                                ? 'bg-amber-100 text-amber-700'
                                : user.role === 'admin' 
                                  ? 'bg-purple-100 text-purple-700' 
                                  : 'bg-gray-100 text-gray-700'
                              }
                            `}>
                              {user.role === 'owner' && <Crown className="w-3 h-3" />}
                              {user.role === 'admin' && <Shield className="w-3 h-3" />}
                              {user.role}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`
                              inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium
                              ${user.status === 'active' 
                                ? 'bg-green-100 text-green-700'
                                : user.status === 'suspended'
                                  ? 'bg-yellow-100 text-yellow-700' 
                                  : 'bg-red-100 text-red-700'
                              }
                            `}>
                              {user.status || 'active'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="w-32">
                              {isUnlimited ? (
                                <span className="text-xs text-green-600 font-medium">∞ Unlimited</span>
                              ) : (
                                <>
                                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                                    <span>{formatBytes(used)}</span>
                                    <span>{formatBytes(quota)}</span>
                                  </div>
                                  <div className="w-full bg-gray-200 rounded-full h-1.5">
                                    <div 
                                      className={`h-1.5 rounded-full ${percent >= 90 ? 'bg-red-500' : 'bg-blue-600'}`}
                                      style={{ width: `${percent}%` }}
                                    />
                                  </div>
                                </>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-1 flex-wrap">
                              <button
                                onClick={() => handleEditUser(user)}
                                className="p-2 hover:bg-gray-100 rounded-lg transition"
                                title="Edit"
                              >
                                <Edit className="w-4 h-4 text-gray-500" />
                              </button>
                              
                              {/* Status actions - not for owner */}
                              {!user.isOwner && (
                                <>
                                  {user.status === 'active' ? (
                                    <>
                                      <button
                                        onClick={() => handleChangeStatus(user, 'suspended')}
                                        className="p-2 hover:bg-yellow-100 rounded-lg transition"
                                        title="Suspend"
                                      >
                                        <AlertTriangle className="w-4 h-4 text-yellow-600" />
                                      </button>
                                      <button
                                        onClick={() => handleChangeStatus(user, 'banned')}
                                        className="p-2 hover:bg-red-100 rounded-lg transition"
                                        title="Ban"
                                      >
                                        <Ban className="w-4 h-4 text-red-500" />
                                      </button>
                                    </>
                                  ) : (
                                    <button
                                      onClick={() => handleChangeStatus(user, 'active')}
                                      className="p-2 hover:bg-green-100 rounded-lg transition"
                                      title="Activate"
                                    >
                                      <UserCheck className="w-4 h-4 text-green-600" />
                                    </button>
                                  )}
                                </>
                              )}
                              
                              {/* Make owner - only owner can do this */}
                              {currentUserIsOwner && !user.isOwner && user.role !== 'owner' && (
                                <button
                                  onClick={() => handleMakeOwner(user)}
                                  className="p-2 hover:bg-amber-100 rounded-lg transition"
                                  title="Make Owner"
                                >
                                  <Crown className="w-4 h-4 text-amber-600" />
                                </button>
                              )}
                              
                              {/* Delete - not for owner */}
                              {!user.isOwner && (
                                <button
                                  onClick={() => handleDeleteUser(user)}
                                  className="p-2 hover:bg-red-100 rounded-lg transition"
                                  title="Delete"
                                >
                                  <Trash2 className="w-4 h-4 text-red-500" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Stats Tab */}
            {activeTab === 'stats' && stats && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white rounded-lg border border-gray-200 p-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                      <Users className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-gray-900">{stats.users}</p>
                      <p className="text-sm text-gray-500">Total Users</p>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-lg border border-gray-200 p-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                      <File className="w-6 h-6 text-green-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-gray-900">{stats.files}</p>
                      <p className="text-sm text-gray-500">Total Files</p>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-lg border border-gray-200 p-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                      <Folder className="w-6 h-6 text-yellow-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-gray-900">{stats.folders}</p>
                      <p className="text-sm text-gray-500">Total Folders</p>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-lg border border-gray-200 p-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                      <HardDrive className="w-6 h-6 text-purple-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-gray-900">
                        {formatBytes(stats.totalStorageBytes)}
                      </p>
                      <p className="text-sm text-gray-500">Storage Used</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Activity Tab */}
            {activeTab === 'activity' && (
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                        User
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                        Action
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                        Item
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                        Time
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {activity.map((log) => (
                      <tr key={log.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {log.actor_email || 'System'}
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-1 bg-gray-100 rounded text-xs font-medium text-gray-700">
                            {log.action}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {log.item_name || log.item_id || '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {format(new Date(log.created_at), 'MMM d, yyyy HH:mm')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Settings Tab */}
            {activeTab === 'settings' && (
              <div className="space-y-6">
                <div className="bg-white rounded-lg border border-gray-200 p-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
                    <Shield className="w-5 h-5 text-gray-400" />
                    Access Control
                  </h3>
                  
                  <div className="space-y-4">
                    {/* Enable Signups */}
                    <div className="flex items-center justify-between py-3 border-b border-gray-100">
                      <div>
                        <p className="font-medium text-gray-900">Allow New Registrations</p>
                        <p className="text-sm text-gray-500">Allow new users to register accounts</p>
                      </div>
                      <button 
                        onClick={() => toggleSetting('signups_enabled')}
                        className="text-blue-600 hover:text-blue-700"
                      >
                        {settings.signups_enabled === 'true' || settings.signups_enabled === undefined ? (
                          <ToggleRight className="w-10 h-10" />
                        ) : (
                          <ToggleLeft className="w-10 h-10 text-gray-400" />
                        )}
                      </button>
                    </div>

                    {/* Enable Sign In */}
                    <div className="flex items-center justify-between py-3 border-b border-gray-100">
                      <div>
                        <p className="font-medium text-gray-900">Allow User Sign In</p>
                        <p className="text-sm text-gray-500">Allow non-admin users to sign in (admins can always sign in)</p>
                      </div>
                      <button 
                        onClick={() => toggleSetting('signin_enabled')}
                        className="text-blue-600 hover:text-blue-700"
                      >
                        {settings.signin_enabled === 'true' || settings.signin_enabled === undefined ? (
                          <ToggleRight className="w-10 h-10" />
                        ) : (
                          <ToggleLeft className="w-10 h-10 text-gray-400" />
                        )}
                      </button>
                    </div>

                    {/* Require Owner PIN */}
                    <div className="flex items-center justify-between py-3 border-b border-gray-100">
                      <div>
                        <p className="font-medium text-gray-900">Require Owner PIN for Registration</p>
                        <p className="text-sm text-gray-500">Users must enter the owner PIN to create an account</p>
                      </div>
                      <button 
                        onClick={() => toggleSetting('require_owner_pin')}
                        className="text-blue-600 hover:text-blue-700"
                      >
                        {settings.require_owner_pin === 'true' || settings.require_owner_pin === undefined ? (
                          <ToggleRight className="w-10 h-10" />
                        ) : (
                          <ToggleLeft className="w-10 h-10 text-gray-400" />
                        )}
                      </button>
                    </div>

                    {/* Maintenance Mode */}
                    <div className="flex items-center justify-between py-3">
                      <div>
                        <p className="font-medium text-gray-900">Maintenance Mode</p>
                        <p className="text-sm text-gray-500">Only admins can access the system when enabled</p>
                      </div>
                      <button 
                        onClick={() => toggleSetting('maintenance_mode')}
                        className="text-blue-600 hover:text-blue-700"
                      >
                        {settings.maintenance_mode === 'true' ? (
                          <ToggleRight className="w-10 h-10 text-orange-500" />
                        ) : (
                          <ToggleLeft className="w-10 h-10 text-gray-400" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-lg border border-gray-200 p-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
                    <Database className="w-5 h-5 text-gray-400" />
                    Storage Settings
                  </h3>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block font-medium text-gray-900 mb-1">
                        Default Storage Quota for New Users
                      </label>
                      <p className="text-sm text-gray-500 mb-2">
                        Storage limit in GB for newly created accounts
                      </p>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={Math.round((parseInt(settings.default_storage_quota) || 5368709120) / 1024 / 1024 / 1024 * 10) / 10}
                          onChange={(e) => {
                            const gbValue = parseFloat(e.target.value) || 5;
                            const bytesValue = Math.floor(gbValue * 1024 * 1024 * 1024);
                            setSettings(prev => ({ ...prev, default_storage_quota: String(bytesValue) }));
                          }}
                          className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          min="0.1"
                          step="0.5"
                        />
                        <span className="text-gray-500">GB</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Owner PIN - Only visible to owner */}
                {currentUserIsOwner && (
                  <div className="bg-white rounded-lg border border-amber-200 p-6">
                    <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
                      <Key className="w-5 h-5 text-amber-500" />
                      Owner Settings
                    </h3>
                    
                    <div className="space-y-4">
                      <div>
                        <label className="block font-medium text-gray-900 mb-1">
                          Owner PIN
                        </label>
                        <p className="text-sm text-gray-500 mb-2">
                          The PIN users need to enter when registering (4-8 digits)
                        </p>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={settings.owner_pin || ''}
                            onChange={(e) => {
                              const pin = e.target.value.replace(/\D/g, '').slice(0, 8);
                              setSettings(prev => ({ ...prev, owner_pin: pin }));
                            }}
                            className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-lg tracking-widest"
                            placeholder="2529"
                            maxLength={8}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex justify-end">
                  <button
                    onClick={handleSaveSettings}
                    disabled={savingSettings}
                    className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg disabled:opacity-50 transition"
                  >
                    <Save className="w-4 h-4" />
                    {savingSettings ? 'Saving...' : 'Save Settings'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {showUserModal && (
        <UserModal
          user={editingUser}
          onClose={() => {
            setShowUserModal(false);
            setEditingUser(null);
          }}
          onSave={handleUserSaved}
          isCurrentUserOwner={currentUserIsOwner}
        />
      )}

      {/* Owner Transfer Confirmation Modal */}
      {showOwnerConfirm && targetOwnerUser && (
        <div className="modal-backdrop" onClick={() => setShowOwnerConfirm(false)}>
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-center mb-4">
              <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center">
                <Crown className="w-8 h-8 text-amber-600" />
              </div>
            </div>
            
            <h2 className="text-xl font-semibold text-gray-900 text-center mb-2">
              Transfer Ownership
            </h2>
            
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <div className="flex items-center gap-2 text-red-700 font-medium mb-2">
                <AlertTriangle className="w-5 h-5" />
                <span>WARNING: This action gives FULL control</span>
              </div>
              <p className="text-sm text-red-600">
                You are about to make <strong>{targetOwnerUser.email}</strong> the owner. 
                This gives them complete control over the system, including the ability to:
              </p>
              <ul className="text-sm text-red-600 list-disc ml-5 mt-2">
                <li>Delete any user including admins</li>
                <li>Change the owner PIN</li>
                <li>Suspend or ban any user</li>
                <li>Access all files and settings</li>
              </ul>
            </div>
            
            <div className="text-center mb-4">
              <p className="text-gray-600 mb-2">
                Click continue <strong>{5 - ownerConfirmCount}</strong> more time{5 - ownerConfirmCount !== 1 ? 's' : ''} to confirm
              </p>
              <div className="flex justify-center gap-1">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className={`w-3 h-3 rounded-full ${
                      i <= ownerConfirmCount ? 'bg-amber-500' : 'bg-gray-300'
                    }`}
                  />
                ))}
              </div>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowOwnerConfirm(false);
                  setTargetOwnerUser(null);
                  setOwnerConfirmCount(0);
                }}
                className="flex-1 py-2 px-4 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleOwnerConfirmClick}
                className="flex-1 py-2 px-4 bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-lg transition"
              >
                Continue ({ownerConfirmCount + 1}/5)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
