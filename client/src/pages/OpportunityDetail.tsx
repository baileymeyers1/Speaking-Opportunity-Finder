import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { apiClient } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import type { Opportunity, SavedOpportunity, SavedCategory } from '../types';
import { getLiveResultById, removeLiveResult } from '../utils/liveResultsCache';

export function OpportunityDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savedCategory, setSavedCategory] = useState<SavedCategory | null>(
    null
  );
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const fetchOpportunity = async () => {
      if (!id) return;

      setIsLoading(true);
      try {
        if (id.startsWith('live-')) {
          const cached = getLiveResultById(id);
          if (cached) {
            setOpportunity(cached);
            return;
          }
        }

        const response = await apiClient.get<Opportunity>(`/opportunities/${id}`);
        if (response.data) setOpportunity(response.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        setIsLoading(false);
      }
    };

    fetchOpportunity();
  }, [id]);

  const handleSave = async (category: SavedCategory) => {
    if (!id || !isAuthenticated || !opportunity) return;

    setIsSaving(true);
    try {
      let opportunityId = id;
      let target = opportunity;

      if (opportunity.isLiveResult) {
        const saved = await apiClient.post<Opportunity>('/opportunities/save-live', {
          title: opportunity.title,
          organization: opportunity.organization,
          description: opportunity.description,
          location: opportunity.location,
          isRemote: opportunity.isRemote,
          cfpDeadline: opportunity.cfpDeadline,
          format: opportunity.format,
          industries: opportunity.industries,
          applyUrl: opportunity.applyUrl,
          liveSearchUrl: opportunity.liveSearchUrl,
        });

        if (saved.data) {
          target = { ...saved.data, isLiveResult: false };
          setOpportunity(target);
          opportunityId = saved.data.id;
          removeLiveResult(id);
        }
      }

      await apiClient.post<SavedOpportunity>('/saved', {
        opportunityId,
        category,
      });

      setSavedCategory(category);

      if (target.id !== id) {
        navigate(`/opportunities/${target.id}`, { replace: true });
      }
    } catch (err) {
      console.error('Failed to save:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return null;
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  if (isLoading) {
    return (
      <div className="animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-1/2 mb-4"></div>
        <div className="h-4 bg-gray-200 rounded w-1/4 mb-8"></div>
        <div className="h-4 bg-gray-200 rounded w-full mb-2"></div>
        <div className="h-4 bg-gray-200 rounded w-full mb-2"></div>
        <div className="h-4 bg-gray-200 rounded w-3/4"></div>
      </div>
    );
  }

  if (error || !opportunity) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500 text-lg">{error || 'Opportunity not found'}</p>
        <Link to="/" className="text-blue-600 hover:underline mt-4 inline-block">
          Back to home
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <Link to="/" className="text-blue-600 hover:underline mb-4 inline-block">
        &larr; Back to opportunities
      </Link>

      <div className="bg-white rounded-lg shadow p-8">
        <div className="flex justify-between items-start mb-4">
          <h1 className="text-2xl font-bold text-gray-900">
            {opportunity.title}
          </h1>
          <div className="flex items-center gap-2">
            {opportunity.isLiveResult && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                Live
              </span>
            )}
            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800 capitalize">
              {opportunity.format}
            </span>
          </div>
        </div>

        <p className="text-lg text-gray-600 mb-6">{opportunity.organization}</p>

        <div className="flex flex-wrap gap-2 mb-6">
          {opportunity.isRemote && (
            <span className="inline-flex items-center px-3 py-1 rounded text-sm font-medium bg-green-100 text-green-800">
              Remote
            </span>
          )}
          {opportunity.location && (
            <span className="inline-flex items-center px-3 py-1 rounded text-sm font-medium bg-gray-100 text-gray-800">
              {opportunity.location}
            </span>
          )}
          {opportunity.compensationType ? (
            <span className="inline-flex items-center px-3 py-1 rounded text-sm font-medium bg-yellow-100 text-yellow-800 capitalize">
              {opportunity.compensationType}
            </span>
          ) : (
            <span className="inline-flex items-center px-3 py-1 rounded text-sm font-medium bg-gray-50 text-gray-600 border border-gray-200">
              Compensation not listed
            </span>
          )}
        </div>

        {opportunity.description && (
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-2">Description</h2>
            <p className="text-gray-700 whitespace-pre-wrap">
              {opportunity.description}
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <h3 className="text-sm font-medium text-gray-500">Event Date</h3>
            <p className="text-gray-900">
              {opportunity.eventDate ? formatDate(opportunity.eventDate) : 'Not listed'}
            </p>
          </div>
          <div>
            <h3 className="text-sm font-medium text-gray-500">
              CFP Deadline
            </h3>
            <p className="text-gray-900">
              {opportunity.cfpDeadline ? formatDate(opportunity.cfpDeadline) : 'Not listed'}
            </p>
          </div>
          {opportunity.compensationDetails && (
            <div className="col-span-2">
              <h3 className="text-sm font-medium text-gray-500">
                Compensation Details
              </h3>
              <p className="text-gray-900">{opportunity.compensationDetails}</p>
            </div>
          )}
        </div>

        <div className="mb-6">
          <h3 className="text-sm font-medium text-gray-500 mb-2">
            Industries
          </h3>
          <div className="flex flex-wrap gap-2">
            {opportunity.industries.length > 0 ? (
              opportunity.industries.map((industry) => (
                <span
                  key={industry}
                  className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-purple-100 text-purple-800"
                >
                  {industry}
                </span>
              ))
            ) : (
              <span className="text-sm text-gray-500">Not listed</span>
            )}
          </div>
        </div>

        <div className="flex gap-4 pt-6 border-t">
          <a
            href={opportunity.applyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 bg-blue-600 text-white text-center py-3 px-4 rounded-md font-medium hover:bg-blue-700"
          >
            Apply Now
          </a>

          {isAuthenticated && (
            <div className="relative">
              <select
                value={savedCategory || ''}
                onChange={(e) =>
                  handleSave(e.target.value as SavedCategory)
                }
                disabled={isSaving}
                className="block w-40 py-3 px-4 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Save to...</option>
                <option value="interested">Interested</option>
                <option value="applied">Applied</option>
                <option value="accepted">Accepted</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
          )}
        </div>

        <p className="text-sm text-gray-500 mt-4">
          Source: {opportunity.source}
          {opportunity.sourceUrl && (
            <>
              {' '}
              (
              <a
                href={opportunity.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                view
              </a>
              )
            </>
          )}
        </p>
      </div>
    </div>
  );
}
