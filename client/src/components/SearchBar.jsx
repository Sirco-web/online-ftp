import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { Search, X, Folder, File, Loader } from 'lucide-react';

export default function SearchBar() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const navigate = useNavigate();

  const handleSearch = async (value) => {
    setQuery(value);
    
    if (value.length < 2) {
      setResults([]);
      setShowResults(false);
      return;
    }

    setLoading(true);
    setShowResults(true);

    try {
      const data = await api.get(`/api/items/search?q=${encodeURIComponent(value)}`);
      setResults(data.items || []);
    } catch (err) {
      console.error('Search error:', err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleResultClick = (item) => {
    setShowResults(false);
    setQuery('');
    
    if (item.type === 'folder') {
      navigate(`/drive/${item.id}`);
    } else {
      // Navigate to parent folder if exists
      if (item.folder_id) {
        navigate(`/drive/${item.folder_id}`);
      } else {
        navigate('/drive');
      }
    }
  };

  const handleClear = () => {
    setQuery('');
    setResults([]);
    setShowResults(false);
  };

  return (
    <div className="relative flex-1 max-w-2xl">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          onFocus={() => query.length >= 2 && setShowResults(true)}
          placeholder="Search files and folders..."
          className="w-full pl-10 pr-10 py-2.5 bg-gray-100 border-0 rounded-lg focus:bg-white focus:ring-2 focus:ring-blue-500 transition"
        />
        {query && (
          <button
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-200 rounded"
          >
            <X className="w-4 h-4 text-gray-400" />
          </button>
        )}
      </div>

      {showResults && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowResults(false)}
          />
          <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-lg shadow-lg border border-gray-200 max-h-96 overflow-y-auto z-50">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader className="w-6 h-6 text-blue-600 animate-spin" />
              </div>
            ) : results.length === 0 ? (
              <div className="py-8 text-center text-gray-500">
                No results found for "{query}"
              </div>
            ) : (
              <ul className="py-2">
                {results.map((item) => (
                  <li key={`${item.type}-${item.id}`}>
                    <button
                      onClick={() => handleResultClick(item)}
                      className="w-full flex items-center gap-3 px-4 py-2 hover:bg-gray-50 text-left"
                    >
                      {item.type === 'folder' ? (
                        <Folder className="w-5 h-5 text-blue-500" />
                      ) : (
                        <File className="w-5 h-5 text-gray-400" />
                      )}
                      <span className="flex-1 truncate">{item.name}</span>
                      <span className="text-xs text-gray-400">{item.type}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
