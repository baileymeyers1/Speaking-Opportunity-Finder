import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Opportunity } from '../types';
import { useAuth } from '../hooks/useAuth';
import { apiClient } from '../api/client';
import { removeLiveResult } from '../utils/liveResultsCache';

interface OpportunityCardProps {
  opportunity: Opportunity;
  showSave?: boolean;
}

export function OpportunityCard({ opportunity, showSave = true }: OpportunityCardProps) {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [current, setCurrent] = useState(opportunity);
  const [isSaving, setIsSaving] = useState(false);
  const [savedCategory, setSavedCategory] = useState<string>('');

  useEffect(() => {
    setCurrent(opportunity);
  }, [opportunity]);

  const formatDate = (dateString: string | null) => {
    if (!dateString) return null;
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getDeadlineInfo = (dateString: string | null) => {
    if (!dateString) return { label: 'Deadline not listed', color: 'bg-gray-100 text-gray-600' };
    const now = new Date();
    const deadline = new Date(dateString);
    const daysLeft = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysLeft <= 0) return { label: 'Closed', color: 'bg-red-100 text-red-800' };
    if (daysLeft <= 3) return { label: `${daysLeft}d left`, color: 'bg-red-100 text-red-800' };
    if (daysLeft <= 7) return { label: `${daysLeft}d left`, color: 'bg-yellow-100 text-yellow-800' };
    return { label: formatDate(dateString)!, color: 'bg-gray-100 text-gray-600' };
  };

  const deadlineInfo = getDeadlineInfo(current.cfpDeadline);
  const isLive = current.isLiveResult;

  const titleElement = (
    <Link
      to={`/opportunities/${current.id}`}
      className={`text-lg font-semibold text-gray-900 ${
        isLive ? 'hover:text-green-600' : 'hover:text-blue-600'
      }`}
    >
      {current.title}
    </Link>
  );

  const formatShortDate = (dateString: string | null) => {
    if (!dateString) return 'Not listed';
    const parsed = new Date(dateString);
    if (Number.isNaN(parsed.getTime())) return 'Not listed';
    return parsed.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const handleSave = async (category: string) => {
    if (!category) return;
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

    setIsSaving(true);
    try {
      let target = current;

      if (current.isLiveResult) {
        const saved = await apiClient.post<Opportunity>('/opportunities/save-live', {
          title: current.title,
          organization: current.organization,
          description: current.description,
          location: current.location,
          isRemote: current.isRemote,
          eventDate: current.eventDate,
          cfpDeadline: current.cfpDeadline,
          format: current.format,
          industries: current.industries,
          compensationType: current.compensationType,
          compensationAmount: current.compensationAmount,
          compensationDetails: current.compensationDetails,
          applyUrl: current.applyUrl,
          liveSearchUrl: current.liveSearchUrl,
        });

        if (saved.data) {
          target = { ...saved.data, isLiveResult: false };
          setCurrent(target);
          removeLiveResult(current.id);
        }
      }

      await apiClient.post('/saved', {
        opportunityId: target.id,
        category,
      });

      setSavedCategory(category);
    } catch (error) {
      console.error('Failed to save:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="rounded-lg shadow p-6 hover:shadow-md transition-shadow bg-white">
      <div className="flex justify-between items-start mb-2">
        {titleElement}
        <div className="flex gap-1 flex-shrink-0 ml-2">
          {isLive && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
              Live
            </span>
          )}
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 capitalize">
            {opportunity.format}
          </span>
        </div>
      </div>

      <p className="text-sm text-gray-600 mb-2">{current.organization}</p>

      {current.description && (
        <p className="text-gray-700 text-sm mb-4 line-clamp-2">
          {current.description}
        </p>
      )}

      <div className="flex flex-wrap gap-2 text-xs text-gray-500 mb-3">
        <span>Event: {formatShortDate(current.eventDate)}</span>
        <span>Deadline: {deadlineInfo.label}</span>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        {current.isRemote && (
          <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800">
            Remote
          </span>
        )}
        {current.location && (
          <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-800">
            {current.location}
          </span>
        )}
        {current.compensationType ? (
          <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-yellow-100 text-yellow-800 capitalize">
            {current.compensationType}
            {current.compensationAmount && ` ($${current.compensationAmount.toLocaleString()})`}
          </span>
        ) : (
          <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-gray-50 text-gray-500 border border-gray-200">
            Compensation not listed
          </span>
        )}
      </div>

      {/* Industry tags */}
      <div className="flex flex-wrap gap-1 mb-3">
        {current.industries && current.industries.length > 0 ? (
          <>
            {current.industries.slice(0, 3).map((industry) => (
              <span
                key={industry}
                className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-gray-50 text-gray-500 border border-gray-200 capitalize"
              >
                {industry}
              </span>
            ))}
            {current.industries.length > 3 && (
              <span className="text-xs text-gray-400">
                +{current.industries.length - 3} more
              </span>
            )}
          </>
        ) : (
          <span className="text-xs text-gray-400">Industries not listed</span>
        )}
      </div>

      <div className="flex justify-between items-center text-sm text-gray-500">
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${deadlineInfo.color}`}>
          {deadlineInfo.label}
        </span>
        <div className="flex items-center gap-3">
          {showSave && (
            <select
              value={savedCategory}
              onChange={(e) => handleSave(e.target.value)}
              disabled={isSaving}
              className="text-xs px-2 py-1 rounded border bg-white"
            >
              <option value="">Save to...</option>
              <option value="interested">Interested</option>
              <option value="applied">Applied</option>
              <option value="accepted">Accepted</option>
              <option value="rejected">Rejected</option>
            </select>
          )}
          <a
            href={current.applyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-800 font-medium"
          >
            Apply &rarr;
          </a>
        </div>
      </div>
    </div>
  );
}
