import { Link } from 'react-router-dom';
import type { Opportunity } from '../types';

interface OpportunityCardProps {
  opportunity: Opportunity;
}

export function OpportunityCard({ opportunity }: OpportunityCardProps) {
  const formatDate = (dateString: string | null) => {
    if (!dateString) return null;
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-2">
        <Link
          to={`/opportunities/${opportunity.id}`}
          className="text-lg font-semibold text-gray-900 hover:text-blue-600"
        >
          {opportunity.title}
        </Link>
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 capitalize">
          {opportunity.format}
        </span>
      </div>

      <p className="text-sm text-gray-600 mb-2">{opportunity.organization}</p>

      {opportunity.description && (
        <p className="text-gray-700 text-sm mb-4 line-clamp-2">
          {opportunity.description}
        </p>
      )}

      <div className="flex flex-wrap gap-2 mb-4">
        {opportunity.isRemote && (
          <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800">
            Remote
          </span>
        )}
        {opportunity.location && (
          <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-800">
            {opportunity.location}
          </span>
        )}
        {opportunity.compensationType && (
          <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-yellow-100 text-yellow-800 capitalize">
            {opportunity.compensationType}
            {opportunity.compensationAmount && ` ($${opportunity.compensationAmount.toLocaleString()})`}
          </span>
        )}
      </div>

      <div className="flex justify-between items-center text-sm text-gray-500">
        <div>
          {opportunity.cfpDeadline && (
            <span>Deadline: {formatDate(opportunity.cfpDeadline)}</span>
          )}
        </div>
        <a
          href={opportunity.applyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:text-blue-800 font-medium"
        >
          Apply &rarr;
        </a>
      </div>
    </div>
  );
}
