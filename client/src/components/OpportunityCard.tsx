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

  const deadlineInfo = getDeadlineInfo(opportunity.cfpDeadline);

  const isLive = opportunity.isLiveResult;
  const titleElement = (
    <Link
      to={`/opportunities/${opportunity.id}`}
      className={`text-lg font-semibold text-gray-900 ${
        isLive ? 'hover:text-green-600' : 'hover:text-blue-600'
      }`}
    >
      {opportunity.title}
    </Link>
  );

  return (
    <div className={`rounded-lg shadow p-6 hover:shadow-md transition-shadow ${
      isLive ? 'bg-gradient-to-br from-green-50 to-white border border-green-200' : 'bg-white'
    }`}>
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

      <p className="text-sm text-gray-600 mb-2">{opportunity.organization}</p>

      {opportunity.description && (
        <p className="text-gray-700 text-sm mb-4 line-clamp-2">
          {opportunity.description}
        </p>
      )}

      <div className="flex flex-wrap gap-2 mb-3">
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
        {opportunity.compensationType ? (
          <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-yellow-100 text-yellow-800 capitalize">
            {opportunity.compensationType}
            {opportunity.compensationAmount && ` ($${opportunity.compensationAmount.toLocaleString()})`}
          </span>
        ) : (
          <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-gray-50 text-gray-500 border border-gray-200">
            Compensation not listed
          </span>
        )}
      </div>

      {/* Industry tags */}
      <div className="flex flex-wrap gap-1 mb-3">
        {opportunity.industries && opportunity.industries.length > 0 ? (
          <>
            {opportunity.industries.slice(0, 3).map((industry) => (
              <span
                key={industry}
                className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-gray-50 text-gray-500 border border-gray-200 capitalize"
              >
                {industry}
              </span>
            ))}
            {opportunity.industries.length > 3 && (
              <span className="text-xs text-gray-400">
                +{opportunity.industries.length - 3} more
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
    </div>
  );
}
