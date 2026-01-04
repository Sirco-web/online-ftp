import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import FileList from '../components/FileList';
import Breadcrumbs from '../components/Breadcrumbs';
import UploadButton from '../components/UploadButton';
import NewFolderModal from '../components/NewFolderModal';
import DetailsDrawer from '../components/DetailsDrawer';
import ShareModal from '../components/ShareModal';
import ContextMenu from '../components/ContextMenu';
import FilePreviewModal from '../components/FilePreviewModal';
import { 
  FolderPlus, 
  Upload, 
  LayoutGrid, 
  List, 
  RefreshCw 
} from 'lucide-react';

export default function DrivePage() {
  const { folderId } = useParams();
  const navigate = useNavigate();
  const { csrfToken } = useAuth();
  
  const [items, setItems] = useState([]);
  const [breadcrumbs, setBreadcrumbs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState('list');
  const [selectedItem, setSelectedItem] = useState(null);
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [showDetailsDrawer, setShowDetailsDrawer] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadItems = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const params = new URLSearchParams();
      if (folderId) {
        params.set('parentId', folderId);
      }
      
      const data = await api.get(`/api/items?${params.toString()}`);
      setItems(data.items || []);
      setBreadcrumbs(data.breadcrumbs || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [folderId]);

  useEffect(() => {
    loadItems();
  }, [loadItems, refreshKey]);

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1);
  };

  const handleItemClick = (item) => {
    if (item.type === 'folder') {
      navigate(`/drive/${item.id}`);
    } else {
      setSelectedItem(item);
      setShowDetailsDrawer(true);
    }
  };

  const handleItemDoubleClick = (item) => {
    if (item.type === 'folder') {
      navigate(`/drive/${item.id}`);
    } else {
      // Open file preview
      setSelectedItem(item);
      setShowPreviewModal(true);
    }
  };

  const handleContextMenu = (e, item) => {
    e.preventDefault();
    setSelectedItem(item);
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      item,
    });
  };

  const handleCloseContextMenu = () => {
    setContextMenu(null);
  };

  const handleAction = async (action) => {
    if (!selectedItem) return;
    
    try {
      switch (action) {
        case 'open':
        case 'preview':
          if (selectedItem.type === 'folder') {
            navigate(`/drive/${selectedItem.id}`);
          } else {
            setShowPreviewModal(true);
          }
          break;
        case 'download':
          window.open(`/api/files/${selectedItem.id}/download`, '_blank');
          break;
        case 'share':
          setShowShareModal(true);
          break;
        case 'details':
          setShowDetailsDrawer(true);
          break;
        case 'rename':
          const newName = prompt('Enter new name:', selectedItem.name);
          if (newName && newName !== selectedItem.name) {
            await api.post('/api/items/rename', {
              itemId: selectedItem.id,
              itemType: selectedItem.type,
              newName,
            }, csrfToken);
            handleRefresh();
          }
          break;
        case 'star':
          await api.post('/api/items/star', {
            itemId: selectedItem.id,
            itemType: selectedItem.type,
            starred: !selectedItem.starred,
          }, csrfToken);
          handleRefresh();
          break;
        case 'trash':
          if (confirm(`Move "${selectedItem.name}" to trash?`)) {
            const endpoint = selectedItem.type === 'file' 
              ? `/api/files/${selectedItem.id}`
              : `/api/folders/${selectedItem.id}`;
            await api.delete(endpoint, csrfToken);
            handleRefresh();
          }
          break;
      }
    } catch (err) {
      alert(err.message);
    }
    
    handleCloseContextMenu();
  };

  const handleCreateFolder = async (name) => {
    try {
      await api.post('/api/folders', {
        name,
        parentId: folderId || null,
      }, csrfToken);
      setShowNewFolderModal(false);
      handleRefresh();
    } catch (err) {
      throw err;
    }
  };

  const handleUploadComplete = () => {
    handleRefresh();
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-gray-200 bg-white">
        <div className="flex items-center justify-between">
          <Breadcrumbs items={breadcrumbs} />
          
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              className="p-2 hover:bg-gray-100 rounded-lg transition"
              title="Refresh"
            >
              <RefreshCw className={`w-5 h-5 text-gray-600 ${loading ? 'animate-spin' : ''}`} />
            </button>
            
            <div className="flex items-center bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded ${viewMode === 'list' ? 'bg-white shadow' : ''}`}
                title="List view"
              >
                <List className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded ${viewMode === 'grid' ? 'bg-white shadow' : ''}`}
                title="Grid view"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>
            
            <button
              onClick={() => setShowNewFolderModal(true)}
              className="flex items-center gap-2 px-3 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition"
            >
              <FolderPlus className="w-5 h-5" />
              <span className="hidden sm:inline">New folder</span>
            </button>
            
            <UploadButton 
              folderId={folderId} 
              onUploadComplete={handleUploadComplete}
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {error ? (
          <div className="text-center py-12">
            <p className="text-red-600">{error}</p>
            <button
              onClick={handleRefresh}
              className="mt-4 px-4 py-2 text-blue-600 hover:bg-blue-50 rounded-lg"
            >
              Try again
            </button>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="spinner w-8 h-8"></div>
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
              <Upload className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900">No files yet</h3>
            <p className="text-gray-500 mt-1">Upload files or create a folder to get started</p>
          </div>
        ) : (
          <FileList
            items={items}
            viewMode={viewMode}
            selectedItem={selectedItem}
            onItemClick={handleItemClick}
            onItemDoubleClick={handleItemDoubleClick}
            onContextMenu={handleContextMenu}
            onSelect={setSelectedItem}
          />
        )}
      </div>

      {/* Modals */}
      {showNewFolderModal && (
        <NewFolderModal
          onClose={() => setShowNewFolderModal(false)}
          onCreate={handleCreateFolder}
        />
      )}

      {showDetailsDrawer && selectedItem && (
        <DetailsDrawer
          item={selectedItem}
          onClose={() => setShowDetailsDrawer(false)}
          onAction={handleAction}
          onRefresh={handleRefresh}
        />
      )}

      {showShareModal && selectedItem && (
        <ShareModal
          item={selectedItem}
          onClose={() => setShowShareModal(false)}
        />
      )}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          item={contextMenu.item}
          onAction={handleAction}
          onClose={handleCloseContextMenu}
        />
      )}

      {showPreviewModal && selectedItem && (
        <FilePreviewModal
          file={selectedItem}
          files={items.filter(i => i.type === 'file')}
          onClose={() => setShowPreviewModal(false)}
          onNavigate={(file) => setSelectedItem(file)}
        />
      )}
    </div>
  );
}
