import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api, formatBytes } from '../lib/api';
import { format } from 'date-fns';
import { 
  Trash2, 
  RotateCcw, 
  Trash, 
  File, 
  Folder,
  AlertTriangle,
} from 'lucide-react';

export default function TrashPage() {
  const { csrfToken } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedItems, setSelectedItems] = useState([]);

  useEffect(() => {
    loadTrashItems();
  }, []);

  const loadTrashItems = async () => {
    try {
      setLoading(true);
      const data = await api.get('/api/trash');
      setItems(data.items || []);
    } catch (err) {
      console.error('Failed to load trash:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (item) => {
    try {
      await api.post(`/api/trash/${item.type}/${item.id}/restore`, {}, csrfToken);
      loadTrashItems();
    } catch (err) {
      alert(err.message);
    }
  };

  const handlePermanentDelete = async (item) => {
    if (!confirm(`Permanently delete "${item.name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      await api.delete(`/api/trash/${item.type}/${item.id}/purge`, csrfToken);
      loadTrashItems();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleEmptyTrash = async () => {
    if (!confirm('Permanently delete all items in trash? This action cannot be undone.')) {
      return;
    }

    try {
      await api.delete('/api/trash/empty', csrfToken);
      loadTrashItems();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <div className="flex-shrink-0 px-6 py-4 border-b border-gray-200 bg-white">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <Trash2 className="w-6 h-6 text-gray-400" />
            Trash
          </h1>
          
          {items.length > 0 && (
            <button
              onClick={handleEmptyTrash}
              className="flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition"
            >
              <Trash className="w-5 h-5" />
              Empty trash
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="spinner w-8 h-8"></div>
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
              <Trash2 className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900">Trash is empty</h3>
            <p className="text-gray-500 mt-1">
              Items you delete will appear here
            </p>
          </div>
        ) : (
          <>
            <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center gap-2 text-yellow-800 text-sm">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              <span>Items in trash are deleted after 30 days</span>
            </div>
            
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="divide-y divide-gray-100">
                {items.map((item) => (
                  <div
                    key={`${item.type}-${item.id}`}
                    className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50"
                  >
                    {item.type === 'folder' ? (
                      <Folder className="w-6 h-6 text-blue-500 flex-shrink-0" />
                    ) : (
                      <File className="w-6 h-6 text-gray-400 flex-shrink-0" />
                    )}
                    
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">{item.name}</p>
                      <p className="text-xs text-gray-500">
                        Deleted {format(new Date(item.trashed_at), 'MMM d, yyyy')}
                        {item.type === 'file' && ` • ${formatBytes(item.size)}`}
                      </p>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleRestore(item)}
                        className="p-2 hover:bg-gray-200 rounded-lg transition"
                        title="Restore"
                      >
                        <RotateCcw className="w-5 h-5 text-gray-500" />
                      </button>
                      <button
                        onClick={() => handlePermanentDelete(item)}
                        className="p-2 hover:bg-red-100 rounded-lg transition"
                        title="Delete permanently"
                      >
                        <Trash className="w-5 h-5 text-red-500" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
