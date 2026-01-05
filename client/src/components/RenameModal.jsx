import { useState, useEffect, useRef } from 'react';
import { X, Edit3 } from 'lucide-react';

export default function RenameModal({ item, onClose, onRename, isOverlay = false }) {
  const [name, setName] = useState(item?.name || '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    // Focus and select the filename (without extension for files)
    if (inputRef.current) {
      inputRef.current.focus();
      
      if (item?.type === 'file' && item.name.includes('.')) {
        const lastDot = item.name.lastIndexOf('.');
        inputRef.current.setSelectionRange(0, lastDot);
      } else {
        inputRef.current.select();
      }
    }
  }, [item]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const trimmedName = name.trim();
    
    if (!trimmedName) {
      setError('Name cannot be empty');
      return;
    }

    if (trimmedName === item.name) {
      onClose();
      return;
    }

    // Basic validation
    if (trimmedName.includes('/') || trimmedName.includes('\\')) {
      setError('Name cannot contain / or \\');
      return;
    }

    setLoading(true);

    try {
      await onRename(item, trimmedName);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to rename');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div className={isOverlay ? "modal-backdrop-high" : "modal-backdrop"} onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Edit3 className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">
              Rename {item?.type === 'folder' ? 'Folder' : 'File'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-4">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          <div className="mb-4">
            <label htmlFor="rename-input" className="block text-sm font-medium text-gray-700 mb-1">
              New name
            </label>
            <input
              ref={inputRef}
              id="rename-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder={`Enter ${item?.type === 'folder' ? 'folder' : 'file'} name`}
              disabled={loading}
            />
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 text-gray-700 bg-gray-100 hover:bg-gray-200 font-medium rounded-lg transition"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2.5 text-white bg-blue-600 hover:bg-blue-700 font-medium rounded-lg transition disabled:opacity-50"
              disabled={loading || !name.trim() || name.trim() === item?.name}
            >
              {loading ? 'Renaming...' : 'Rename'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
