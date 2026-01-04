import { formatBytes, getFileIcon } from '../lib/api';
import { format } from 'date-fns';
import {
  Folder,
  File,
  Image,
  Video,
  Music,
  FileText,
  FileSpreadsheet,
  Presentation,
  Archive,
  Code,
  Star,
  MoreVertical,
} from 'lucide-react';

const iconMap = {
  folder: Folder,
  file: File,
  image: Image,
  video: Video,
  audio: Music,
  pdf: FileText,
  doc: FileText,
  sheet: FileSpreadsheet,
  slides: Presentation,
  archive: Archive,
  code: Code,
};

function FileIcon({ type, mime, className = "w-5 h-5" }) {
  const iconType = getFileIcon(mime, type);
  const Icon = iconMap[iconType] || File;
  
  const colorClass = type === 'folder' 
    ? 'text-blue-500' 
    : iconType === 'image' 
      ? 'text-purple-500'
      : iconType === 'video'
        ? 'text-pink-500'
        : iconType === 'audio'
          ? 'text-green-500'
          : 'text-gray-400';
  
  return <Icon className={`${className} ${colorClass}`} />;
}

function ListItem({ item, selected, onClick, onDoubleClick, onContextMenu }) {
  return (
    <div
      className={`
        flex items-center gap-4 px-4 py-3 cursor-pointer border-b border-gray-100
        ${selected ? 'bg-blue-50' : 'hover:bg-gray-50'}
      `}
      onClick={() => onClick(item)}
      onDoubleClick={() => onDoubleClick(item)}
      onContextMenu={(e) => onContextMenu(e, item)}
    >
      <FileIcon type={item.type} mime={item.mime} className="w-6 h-6 flex-shrink-0" />
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900 truncate">{item.name}</span>
          {item.starred === 1 && (
            <Star className="w-4 h-4 text-yellow-500 fill-yellow-500 flex-shrink-0" />
          )}
        </div>
      </div>
      
      <div className="hidden sm:block w-24 text-sm text-gray-500">
        {item.type === 'file' ? formatBytes(item.size) : '--'}
      </div>
      
      <div className="hidden md:block w-40 text-sm text-gray-500">
        {format(new Date(item.updated_at || item.created_at), 'MMM d, yyyy')}
      </div>
      
      <button
        onClick={(e) => {
          e.stopPropagation();
          onContextMenu(e, item);
        }}
        className="p-1 hover:bg-gray-200 rounded opacity-0 group-hover:opacity-100 transition"
      >
        <MoreVertical className="w-5 h-5 text-gray-400" />
      </button>
    </div>
  );
}

function GridItem({ item, selected, onClick, onDoubleClick, onContextMenu }) {
  return (
    <div
      className={`
        group relative flex flex-col items-center p-4 rounded-xl cursor-pointer
        ${selected ? 'bg-blue-100 ring-2 ring-blue-500' : 'hover:bg-gray-100'}
      `}
      onClick={() => onClick(item)}
      onDoubleClick={() => onDoubleClick(item)}
      onContextMenu={(e) => onContextMenu(e, item)}
    >
      <div className="relative w-16 h-16 flex items-center justify-center mb-3">
        <FileIcon type={item.type} mime={item.mime} className="w-12 h-12" />
        {item.starred === 1 && (
          <Star className="absolute -top-1 -right-1 w-4 h-4 text-yellow-500 fill-yellow-500" />
        )}
      </div>
      
      <p className="text-sm font-medium text-gray-900 text-center truncate w-full">
        {item.name}
      </p>
      
      <p className="text-xs text-gray-500 mt-1">
        {item.type === 'file' ? formatBytes(item.size) : 'Folder'}
      </p>
      
      <button
        onClick={(e) => {
          e.stopPropagation();
          onContextMenu(e, item);
        }}
        className="absolute top-2 right-2 p-1 hover:bg-gray-200 rounded opacity-0 group-hover:opacity-100 transition"
      >
        <MoreVertical className="w-4 h-4 text-gray-400" />
      </button>
    </div>
  );
}

export default function FileList({
  items,
  viewMode,
  selectedItem,
  onItemClick,
  onItemDoubleClick,
  onContextMenu,
  onSelect,
}) {
  if (viewMode === 'grid') {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {items.map((item) => (
          <GridItem
            key={`${item.type}-${item.id}`}
            item={item}
            selected={selectedItem?.id === item.id}
            onClick={onSelect}
            onDoubleClick={onItemDoubleClick}
            onContextMenu={onContextMenu}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-4 px-4 py-2 bg-gray-50 border-b border-gray-200 text-sm font-medium text-gray-500">
        <div className="w-6"></div>
        <div className="flex-1">Name</div>
        <div className="hidden sm:block w-24">Size</div>
        <div className="hidden md:block w-40">Modified</div>
        <div className="w-8"></div>
      </div>
      
      {/* Items */}
      <div className="divide-y divide-gray-100">
        {items.map((item) => (
          <ListItem
            key={`${item.type}-${item.id}`}
            item={item}
            selected={selectedItem?.id === item.id}
            onClick={onSelect}
            onDoubleClick={onItemDoubleClick}
            onContextMenu={onContextMenu}
          />
        ))}
      </div>
    </div>
  );
}
