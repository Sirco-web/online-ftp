import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import {
  X,
  Folder,
  ChevronRight,
  ChevronDown,
  Home,
  ArrowLeft,
  Loader2,
} from 'lucide-react';

function FolderTree({ 
  folder, 
  level = 0, 
  selectedId, 
  onSelect, 
  expandedIds, 
  onToggle,
  excludeIds = [],
}) {
  const isExpanded = expandedIds.includes(folder.id);
  const isSelected = selectedId === folder.id;
  const isExcluded = excludeIds.includes(folder.id);

  if (isExcluded) return null;

  return (
    <div>
      <div
        className={`
          flex items-center gap-2 px-3 py-2 cursor-pointer rounded-lg transition
          ${isSelected ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100'}
          ${isExcluded ? 'opacity-50 cursor-not-allowed' : ''}
        `}
        style={{ paddingLeft: `${12 + level * 16}px` }}
        onClick={() => !isExcluded && onSelect(folder)}
      >
        {folder.children && folder.children.length > 0 ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggle(folder.id);
            }}
            className="p-0.5 hover:bg-gray-200 rounded"
          >
            {isExpanded ? (
              <ChevronDown className="w-4 h-4 text-gray-500" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-500" />
            )}
          </button>
        ) : (
          <span className="w-5" />
        )}
        <Folder className="w-5 h-5 text-blue-500 flex-shrink-0" />
        <span className="truncate">{folder.name}</span>
      </div>

      {isExpanded && folder.children && folder.children.length > 0 && (
        <div>
          {folder.children.map(child => (
            <FolderTree
              key={child.id}
              folder={child}
              level={level + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              expandedIds={expandedIds}
              onToggle={onToggle}
              excludeIds={excludeIds}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function MoveModal({ items, currentFolderId, onClose, onMove, isOverlay = false }) {
  const { csrfToken } = useAuth();
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState('');
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [expandedIds, setExpandedIds] = useState([]);

  // Build list of folder IDs to exclude (can't move folder into itself or descendants)
  const excludeIds = items
    .filter(item => item.type === 'folder')
    .map(item => item.id);

  useEffect(() => {
    loadFolders();
  }, []);

  const loadFolders = async () => {
    try {
      setLoading(true);
      const data = await api.get('/api/folders/tree');
      setFolders(data.folders || []);
    } catch (err) {
      setError('Failed to load folders');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = (folderId) => {
    setExpandedIds(prev => 
      prev.includes(folderId) 
        ? prev.filter(id => id !== folderId)
        : [...prev, folderId]
    );
  };

  const handleMove = async () => {
    if (moving) return;
    
    // selectedFolder null means root
    const targetFolderId = selectedFolder?.id || null;
    
    // Don't move if already in this folder
    if (targetFolderId === currentFolderId) {
      setError('Items are already in this folder');
      return;
    }
    
    try {
      setMoving(true);
      setError('');
      
      // Move each item
      for (const item of items) {
        await api.post('/api/items/move', {
          itemId: item.id,
          itemType: item.type,
          targetFolderId,
        }, csrfToken);
      }
      
      onMove();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to move items');
    } finally {
      setMoving(false);
    }
  };

  const itemNames = items.length === 1 
    ? `"${items[0].name}"`
    : `${items.length} items`;

  return (
    <div className={isOverlay ? "modal-backdrop-high" : "modal-backdrop"} onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            Move {itemNames}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
            </div>
          ) : (
            <div className="space-y-1">
              {/* Root folder option */}
              <div
                className={`
                  flex items-center gap-2 px-3 py-2 cursor-pointer rounded-lg transition
                  ${selectedFolder === null ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100'}
                `}
                onClick={() => setSelectedFolder(null)}
              >
                <Home className="w-5 h-5 text-gray-500" />
                <span className="font-medium">My Drive</span>
              </div>

              {/* Folder tree */}
              {folders.map(folder => (
                <FolderTree
                  key={folder.id}
                  folder={folder}
                  selectedId={selectedFolder?.id}
                  onSelect={setSelectedFolder}
                  expandedIds={expandedIds}
                  onToggle={handleToggle}
                  excludeIds={excludeIds}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 font-medium rounded-lg transition"
          >
            Cancel
          </button>
          <button
            onClick={handleMove}
            disabled={moving}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg transition flex items-center gap-2"
          >
            {moving && <Loader2 className="w-4 h-4 animate-spin" />}
            Move here
          </button>
        </div>
      </div>
    </div>
  );
}
