import { useState, useEffect } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { apiClient } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { OpportunityCard } from '../components/OpportunityCard';
import type { SavedOpportunity, SavedCategory } from '../types';

const categories: { value: SavedCategory | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'interested', label: 'Interested' },
  { value: 'applied', label: 'Applied' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'rejected', label: 'Rejected' },
];

export function SavedOpportunities() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [savedItems, setSavedItems] = useState<SavedOpportunity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<SavedCategory | 'all'>(
    'all'
  );

  useEffect(() => {
    const fetchSaved = async () => {
      if (!isAuthenticated) return;

      setIsLoading(true);
      try {
        const params =
          activeCategory !== 'all' ? `?category=${activeCategory}` : '';
        const response =
          await apiClient.get<SavedOpportunity[]>(`/saved${params}`);

        if (response.data) {
          setSavedItems(response.data);
        }
      } catch (error) {
        console.error('Failed to fetch saved opportunities:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSaved();
  }, [isAuthenticated, activeCategory]);

  const handleRemove = async (id: string) => {
    try {
      await apiClient.delete(`/saved/${id}`);
      setSavedItems((items) => items.filter((item) => item.id !== id));
    } catch (error) {
      console.error('Failed to remove:', error);
    }
  };

  const handleUpdateCategory = async (id: string, category: SavedCategory) => {
    try {
      await apiClient.patch(`/saved/${id}`, { category });
      setSavedItems((items) =>
        items.map((item) => (item.id === id ? { ...item, category } : item))
      );
    } catch (error) {
      console.error('Failed to update:', error);
    }
  };

  if (authLoading) {
    return <div className="text-center py-12">Loading...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        Saved Opportunities
      </h1>

      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {categories.map((cat) => (
          <button
            key={cat.value}
            onClick={() => setActiveCategory(cat.value)}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap ${
              activeCategory === cat.value
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white rounded-lg shadow p-6 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-4"></div>
              <div className="h-3 bg-gray-200 rounded w-1/2 mb-4"></div>
              <div className="h-3 bg-gray-200 rounded w-full"></div>
            </div>
          ))}
        </div>
      ) : savedItems.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 text-lg">No saved opportunities</p>
          <Link to="/" className="text-blue-600 hover:underline mt-2 inline-block">
            Browse opportunities
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {savedItems.map((item) => (
            <div key={item.id} className="relative">
              {item.opportunity && (
                <OpportunityCard opportunity={item.opportunity} />
              )}
              <div className="absolute top-2 right-2 flex gap-1">
                <select
                  value={item.category}
                  onChange={(e) =>
                    handleUpdateCategory(item.id, e.target.value as SavedCategory)
                  }
                  className="text-xs px-2 py-1 rounded border bg-white"
                >
                  <option value="interested">Interested</option>
                  <option value="applied">Applied</option>
                  <option value="accepted">Accepted</option>
                  <option value="rejected">Rejected</option>
                </select>
                <button
                  onClick={() => handleRemove(item.id)}
                  className="text-xs px-2 py-1 rounded bg-red-100 text-red-600 hover:bg-red-200"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
