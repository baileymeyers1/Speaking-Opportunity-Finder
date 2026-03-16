import { useState, useEffect } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { apiClient } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { OpportunityCard } from '../components/OpportunityCard';
import type { SavedOpportunity, SavedCategory } from '../types';

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Loader2, Bookmark, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

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
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const getCategoryCount = (cat: SavedCategory | 'all') => {
    if (cat === 'all') return savedItems.length;
    return savedItems.filter((item) => item.category === cat).length;
  };

  const getEmptyMessage = (cat: SavedCategory | 'all') => {
    switch (cat) {
      case 'interested':
        return 'No opportunities marked as interested yet.';
      case 'applied':
        return 'No applications tracked yet.';
      case 'accepted':
        return 'No accepted opportunities yet -- keep applying!';
      case 'rejected':
        return 'No rejected opportunities.';
      default:
        return 'No saved opportunities yet.';
    }
  };

  const renderGrid = (items: SavedOpportunity[]) => (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <div key={item.id} className="relative group">
          {item.opportunity && (
            <OpportunityCard opportunity={item.opportunity} showSave={false} />
          )}
          <div className="absolute top-2 right-2 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <Select
              value={item.category}
              onValueChange={(value) =>
                handleUpdateCategory(item.id, value as SavedCategory)
              }
            >
              <SelectTrigger className="h-7 w-[110px] text-xs bg-background/95 backdrop-blur-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="interested">Interested</SelectItem>
                <SelectItem value="applied">Applied</SelectItem>
                <SelectItem value="accepted">Accepted</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="destructive"
              size="sm"
              className="h-7 px-2"
              onClick={() => handleRemove(item.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );

  const renderEmpty = (cat: SavedCategory | 'all') => (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="rounded-full bg-muted p-4 mb-4">
        <Bookmark className="h-8 w-8 text-muted-foreground" />
      </div>
      <p className="text-lg font-medium text-foreground mb-1">
        {getEmptyMessage(cat)}
      </p>
      <p className="text-sm text-muted-foreground mb-4">
        Browse opportunities and save the ones that interest you.
      </p>
      <Button variant="outline" asChild>
        <Link to="/">Browse opportunities</Link>
      </Button>
    </div>
  );

  const renderSkeletons = () => (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="rounded-lg border bg-card p-6 space-y-3">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Saved Opportunities
        </h1>
        <p className="text-muted-foreground mt-1">
          Track and manage your speaking opportunity pipeline
        </p>
      </div>

      <Tabs
        value={activeCategory}
        onValueChange={(value) =>
          setActiveCategory(value as SavedCategory | 'all')
        }
      >
        <TabsList className="w-full justify-start overflow-x-auto">
          {categories.map((cat) => (
            <TabsTrigger
              key={cat.value}
              value={cat.value}
              className="gap-1.5"
            >
              {cat.label}
              {!isLoading && (
                <Badge
                  variant="secondary"
                  className={cn(
                    'h-5 min-w-[20px] px-1.5 text-[10px]',
                    activeCategory === cat.value &&
                      'bg-primary/10 text-primary'
                  )}
                >
                  {getCategoryCount(cat.value)}
                </Badge>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        {categories.map((cat) => (
          <TabsContent key={cat.value} value={cat.value}>
            {isLoading
              ? renderSkeletons()
              : savedItems.length === 0
                ? renderEmpty(cat.value)
                : renderGrid(savedItems)}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

export default SavedOpportunities;
