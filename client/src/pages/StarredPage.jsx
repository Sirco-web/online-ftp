import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import FileList from '../components/FileList';
import { Star } from 'lucide-react';

export default function StarredPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadStarredItems();
  }, []);

  const loadStarredItems = async () => {
    try {
      setLoading(true);
      const data = await api.get('/api/items/starred');
      setItems(data.items || []);
    } catch (err) {
      console.error('Failed to load starred items:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleItemClick = (item) => {
    if (item.type === 'folder') {
      navigate(`/drive/${item.id}`);
    }
  };

  const handleItemDoubleClick = (item) => {
    if (item.type === 'folder') {
      navigate(`/drive/${item.id}`);
    } else {
      window.open(`/api/files/${item.id}/download`, '_blank');
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <div className="flex-shrink-0 px-6 py-4 border-b border-gray-200 bg-white">
        <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
          <Star className="w-6 h-6 text-yellow-500" />
          Starred
        </h1>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="spinner w-8 h-8"></div>
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-yellow-50 rounded-full mb-4">
              <Star className="w-8 h-8 text-yellow-500" />
            </div>
            <h3 className="text-lg font-medium text-gray-900">No starred items</h3>
            <p className="text-gray-500 mt-1">
              Star files and folders for quick access
            </p>
          </div>
        ) : (
          <FileList
            items={items}
            viewMode="list"
            onItemClick={handleItemClick}
            onItemDoubleClick={handleItemDoubleClick}
            onContextMenu={() => {}}
            onSelect={() => {}}
          />
        )}
      </div>
    </div>
  );
}
