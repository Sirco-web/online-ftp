import {
  X,
  Download,
  Share2,
  Trash2,
  FolderInput,
  Star,
  StarOff,
  Copy,
} from 'lucide-react';

export default function SelectionToolbar({
  selectedItems,
  onClearSelection,
  onDelete,
  onMove,
  onShare,
  onDownload,
  onStar,
  onCopy,
}) {
  const count = selectedItems.length;
  const hasFiles = selectedItems.some(item => item.type === 'file');
  const hasFolders = selectedItems.some(item => item.type === 'folder');
  const allStarred = selectedItems.every(item => item.starred === 1);

  if (count === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-40">
      <div className="flex items-center gap-2 px-4 py-3 bg-gray-900 text-white rounded-xl shadow-2xl">
        {/* Selection count */}
        <div className="flex items-center gap-2 pr-3 border-r border-gray-700">
          <button
            onClick={onClearSelection}
            className="p-1.5 hover:bg-gray-700 rounded-lg transition"
            title="Clear selection"
          >
            <X className="w-5 h-5" />
          </button>
          <span className="font-medium whitespace-nowrap">
            {count} selected
          </span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          {/* Download - only for files */}
          {hasFiles && (
            <button
              onClick={onDownload}
              className="flex items-center gap-2 px-3 py-2 hover:bg-gray-700 rounded-lg transition"
              title="Download selected files"
            >
              <Download className="w-5 h-5" />
              <span className="hidden sm:inline">Download</span>
            </button>
          )}

          {/* Share - only single item */}
          {count === 1 && (
            <button
              onClick={() => onShare(selectedItems[0])}
              className="flex items-center gap-2 px-3 py-2 hover:bg-gray-700 rounded-lg transition"
              title="Share"
            >
              <Share2 className="w-5 h-5" />
              <span className="hidden sm:inline">Share</span>
            </button>
          )}

          {/* Move */}
          <button
            onClick={onMove}
            className="flex items-center gap-2 px-3 py-2 hover:bg-gray-700 rounded-lg transition"
            title="Move to..."
          >
            <FolderInput className="w-5 h-5" />
            <span className="hidden sm:inline">Move</span>
          </button>

          {/* Copy */}
          <button
            onClick={onCopy}
            className="flex items-center gap-2 px-3 py-2 hover:bg-gray-700 rounded-lg transition"
            title="Make a copy"
          >
            <Copy className="w-5 h-5" />
            <span className="hidden sm:inline">Copy</span>
          </button>

          {/* Star/Unstar */}
          <button
            onClick={() => onStar(!allStarred)}
            className="flex items-center gap-2 px-3 py-2 hover:bg-gray-700 rounded-lg transition"
            title={allStarred ? "Remove from starred" : "Add to starred"}
          >
            {allStarred ? (
              <StarOff className="w-5 h-5" />
            ) : (
              <Star className="w-5 h-5" />
            )}
            <span className="hidden sm:inline">{allStarred ? 'Unstar' : 'Star'}</span>
          </button>

          {/* Delete */}
          <button
            onClick={onDelete}
            className="flex items-center gap-2 px-3 py-2 hover:bg-red-600 text-red-400 hover:text-white rounded-lg transition"
            title="Move to trash"
          >
            <Trash2 className="w-5 h-5" />
            <span className="hidden sm:inline">Delete</span>
          </button>
        </div>
      </div>
    </div>
  );
}
