import { Link } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';

export default function Breadcrumbs({ items = [] }) {
  return (
    <nav className="flex items-center gap-1 text-sm">
      <Link
        to="/drive"
        className="flex items-center gap-1 px-2 py-1 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition"
      >
        <Home className="w-4 h-4" />
        <span>My Drive</span>
      </Link>
      
      {items.map((item, index) => (
        <div key={item.id} className="flex items-center gap-1">
          <ChevronRight className="w-4 h-4 text-gray-400" />
          {index === items.length - 1 ? (
            <span className="px-2 py-1 text-gray-900 font-medium">
              {item.name}
            </span>
          ) : (
            <Link
              to={`/drive/${item.id}`}
              className="px-2 py-1 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition"
            >
              {item.name}
            </Link>
          )}
        </div>
      ))}
    </nav>
  );
}
