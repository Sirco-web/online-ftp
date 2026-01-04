import { useEffect } from 'react';
import {
  FolderOpen,
  Download,
  Share2,
  Info,
  Edit3,
  Star,
  StarOff,
  Trash2,
} from 'lucide-react';

export default function ContextMenu({ x, y, item, onAction, onClose }) {
  useEffect(() => {
    const handleClick = () => onClose();
    const handleScroll = () => onClose();
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('click', handleClick);
    document.addEventListener('scroll', handleScroll, true);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('click', handleClick);
      document.removeEventListener('scroll', handleScroll, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Adjust position to stay within viewport
  const menuWidth = 200;
  const menuHeight = 300;
  const adjustedX = x + menuWidth > window.innerWidth ? x - menuWidth : x;
  const adjustedY = y + menuHeight > window.innerHeight ? y - menuHeight : y;

  const menuItems = [
    { action: 'open', icon: FolderOpen, label: item.type === 'folder' ? 'Open' : 'Preview' },
    ...(item.type === 'file' ? [{ action: 'download', icon: Download, label: 'Download' }] : []),
    { divider: true },
    { action: 'share', icon: Share2, label: 'Share' },
    { action: 'details', icon: Info, label: 'Details' },
    { divider: true },
    { action: 'rename', icon: Edit3, label: 'Rename' },
    { 
      action: 'star', 
      icon: item.starred ? StarOff : Star, 
      label: item.starred ? 'Remove from starred' : 'Add to starred' 
    },
    { divider: true },
    { action: 'trash', icon: Trash2, label: 'Move to trash', danger: true },
  ];

  return (
    <div
      className="fixed bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50 min-w-[180px]"
      style={{ left: adjustedX, top: adjustedY }}
      onClick={(e) => e.stopPropagation()}
    >
      {menuItems.map((menuItem, index) => {
        if (menuItem.divider) {
          return <div key={index} className="my-1 border-t border-gray-200" />;
        }

        const Icon = menuItem.icon;

        return (
          <button
            key={menuItem.action}
            onClick={() => onAction(menuItem.action)}
            className={`
              w-full flex items-center gap-3 px-4 py-2 text-left text-sm transition
              ${menuItem.danger 
                ? 'text-red-600 hover:bg-red-50' 
                : 'text-gray-700 hover:bg-gray-100'
              }
            `}
          >
            <Icon className="w-4 h-4" />
            <span>{menuItem.label}</span>
          </button>
        );
      })}
    </div>
  );
}
