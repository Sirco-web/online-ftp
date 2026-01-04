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
import MoveModal from '../components/MoveModal';
import ContextMenu from '../components/ContextMenu';
import FilePreviewModal from '../components/FilePreviewModal';
import SelectionToolbar from '../components/SelectionToolbar';
import { 
  FolderPlus, 
  Upload, 
  LayoutGrid, 
  List, 
  RefreshCw,
  CheckSquare,
  Download,
  ChevronDown,
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
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedItems, setSelectedItems] = useState([]);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);

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
    setSelectedItems([]); // Clear selection on refresh
  };

  // Multi-select handlers
  const handleToggleSelect = (item) => {
    setSelectedItems(prev => {
      const exists = prev.some(i => i.id === item.id && i.type === item.type);
      if (exists) {
        return prev.filter(i => !(i.id === item.id && i.type === item.type));
      }
      return [...prev, item];
    });
  };

  const handleRangeSelect = (item) => {
    if (!selectedItem) return;
    
    const startIdx = items.findIndex(i => i.id === selectedItem.id && i.type === selectedItem.type);
    const endIdx = items.findIndex(i => i.id === item.id && i.type === item.type);
    
    if (startIdx === -1 || endIdx === -1) return;
    
    const start = Math.min(startIdx, endIdx);
    const end = Math.max(startIdx, endIdx);
    const rangeItems = items.slice(start, end + 1);
    
    setSelectedItems(prev => {
      const newItems = [...prev];
      rangeItems.forEach(rangeItem => {
        if (!newItems.some(i => i.id === rangeItem.id && i.type === rangeItem.type)) {
          newItems.push(rangeItem);
        }
      });
      return newItems;
    });
  };

  const handleClearSelection = () => {
    setSelectedItems([]);
    setIsSelectMode(false);
  };

  const handleToggleSelectMode = () => {
    if (isSelectMode) {
      setSelectedItems([]);
      setIsSelectMode(false);
    } else {
      setIsSelectMode(true);
    }
  };

  const handleSelectAll = () => {
    if (selectedItems.length === items.length) {
      setSelectedItems([]);
    } else {
      setSelectedItems([...items]);
    }
  };

  // Download all files in current folder
  const handleDownloadFolder = () => {
    const files = items.filter(item => item.type === 'file');
    files.forEach((file, index) => {
      // Stagger downloads to prevent browser blocking
      setTimeout(() => {
        window.open(`/api/files/${file.id}/download`, '_blank');
      }, index * 300);
    });
    setShowDownloadMenu(false);
  };

  const handleDownloadFolderAsZip = async () => {
    try {
      // Download folder as ZIP
      const zipUrl = folderId 
        ? `/api/folders/${folderId}/download-zip`
        : `/api/folders/root/download-zip`;
      window.open(zipUrl, '_blank');
    } catch (err) {
      alert('Failed to download folder as ZIP');
    }
    setShowDownloadMenu(false);
  };

  // Bulk action handlers
  const handleBulkDelete = async () => {
    if (selectedItems.length === 0) return;
    
    const count = selectedItems.length;
    if (!confirm(`Move ${count} item${count > 1 ? 's' : ''} to trash?`)) return;
    
    try {
      for (const item of selectedItems) {
        const endpoint = item.type === 'file' 
          ? `/api/files/${item.id}`
          : `/api/folders/${item.id}`;
        await api.delete(endpoint, csrfToken);
      }
      setSelectedItems([]);
      handleRefresh();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleBulkMove = () => {
    if (selectedItems.length === 0) return;
    setShowMoveModal(true);
  };

  const handleBulkShare = (item) => {
    setSelectedItem(item);
    setShowShareModal(true);
  };

  const handleBulkDownload = () => {
    // Download each selected file
    const files = selectedItems.filter(item => item.type === 'file');
    files.forEach(file => {
      window.open(`/api/files/${file.id}/download`, '_blank');
    });
  };

  const handleBulkStar = async (starred) => {
    try {
      for (const item of selectedItems) {
        await api.post('/api/items/star', {
          itemId: item.id,
          itemType: item.type,
          starred,
        }, csrfToken);
      }
      handleRefresh();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleBulkCopy = async () => {
    try {
      for (const item of selectedItems) {
        await api.post('/api/items/copy', {
          itemId: item.id,
          itemType: item.type,
        }, csrfToken);
      }
      setSelectedItems([]);
      handleRefresh();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleMoveComplete = () => {
    setSelectedItems([]);
    setShowMoveModal(false);
    handleRefresh();
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
            {/* Select Mode Toggle */}
            <button
              onClick={handleToggleSelectMode}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg transition ${
                isSelectMode 
                  ? 'bg-blue-100 text-blue-700' 
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
              title={isSelectMode ? "Exit select mode" : "Select files"}
            >
              <CheckSquare className="w-5 h-5" />
              <span className="hidden sm:inline">{isSelectMode ? 'Cancel' : 'Select'}</span>
            </button>

            {/* Select All when in select mode */}
            {isSelectMode && items.length > 0 && (
              <button
                onClick={handleSelectAll}
                className="px-3 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition text-sm"
              >
                {selectedItems.length === items.length ? 'Deselect All' : 'Select All'}
              </button>
            )}

            {/* Download Folder Button */}
            {items.filter(i => i.type === 'file').length > 0 && (
              <div className="relative">
                <div className="flex items-center">
                  <button
                    onClick={handleDownloadFolder}
                    className="flex items-center gap-2 px-3 py-2 text-gray-700 hover:bg-gray-100 rounded-l-lg transition border-r border-gray-200"
                    title="Download all files in folder"
                  >
                    <Download className="w-5 h-5" />
                    <span className="hidden sm:inline">Download</span>
                  </button>
                  <button
                    onClick={() => setShowDownloadMenu(!showDownloadMenu)}
                    className="px-2 py-2 text-gray-700 hover:bg-gray-100 rounded-r-lg transition"
                    title="Download options"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                </div>
                
                {showDownloadMenu && (
                  <>
                    <div 
                      className="fixed inset-0 z-10" 
                      onClick={() => setShowDownloadMenu(false)}
                    />
                    <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
                      <button
                        onClick={handleDownloadFolder}
                        className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                      >
                        <Download className="w-4 h-4" />
                        Download files
                      </button>
                      <button
                        onClick={handleDownloadFolderAsZip}
                        className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                      >
                        <Download className="w-4 h-4" />
                        Download as ZIP
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

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
            selectedItems={selectedItems}
            isSelectMode={isSelectMode}
            onItemClick={handleItemClick}
            onItemDoubleClick={handleItemDoubleClick}
            onContextMenu={handleContextMenu}
            onSelect={setSelectedItem}
            onToggleSelect={handleToggleSelect}
            onRangeSelect={handleRangeSelect}
          />
        )}
      </div>

      {/* Selection Toolbar */}
      <SelectionToolbar
        selectedItems={selectedItems}
        onClearSelection={handleClearSelection}
        onDelete={handleBulkDelete}
        onMove={handleBulkMove}
        onShare={handleBulkShare}
        onDownload={handleBulkDownload}
        onStar={handleBulkStar}
        onCopy={handleBulkCopy}
      />

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

      {showMoveModal && selectedItems.length > 0 && (
        <MoveModal
          items={selectedItems}
          currentFolderId={folderId || null}
          onClose={() => setShowMoveModal(false)}
          onMove={handleMoveComplete}
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
          onShare={(file) => {
            setSelectedItem(file);
            setShowShareModal(true);
          }}
          onDelete={async (file) => {
            if (confirm(`Move "${file.name}" to trash?`)) {
              try {
                await api.delete(`/api/files/${file.id}`, csrfToken);
                setShowPreviewModal(false);
                handleRefresh();
              } catch (err) {
                alert(err.message);
              }
            }
          }}
        />
      )}
    </div>
  );
}
