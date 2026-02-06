import type { ScraperResult } from './index.js';
import { config } from '../config/index.js';

interface AirtableRecord<T> {
  id: string;
  fields: T;
}

interface AirtableResponse<T> {
  records: AirtableRecord<T>[];
  offset?: string;
}

interface AirtableEventFields {
  Name?: string;
  Title?: string;
  URL?: string;
  Link?: string;
  Location?: string;
  City?: string;
  Country?: string;
  Online?: boolean;
  'Event Date'?: string;
  'CFP Deadline'?: string;
  Tags?: string[];
  Industries?: string[];
}

export async function scrapeAirtableEvents(): Promise<ScraperResult[]> {
  const apiKey = config.scrapers?.airtableApiKey;
  const baseId = config.scrapers?.airtableBaseId;
  const tableId = config.scrapers?.airtableTableId;
  const viewId = config.scrapers?.airtableViewId;

  if (!apiKey || !baseId || !tableId) {
    return [];
  }

  const results: ScraperResult[] = [];
  let offset: string | undefined;

  try {
    do {
      const params = new URLSearchParams();
      if (viewId) params.set('view', viewId);
      if (offset) params.set('offset', offset);

      const response = await fetch(`https://api.airtable.com/v0/${baseId}/${tableId}?${params}`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
        },
      });

      if (!response.ok) break;
      const data = (await response.json()) as AirtableResponse<AirtableEventFields>;

      for (const record of data.records || []) {
        const fields = record.fields;
        const title = fields.Title || fields.Name;
        const applyUrl = fields.URL || fields.Link;
        if (!title || !applyUrl) continue;

        const location =
          fields.Location ||
          (fields.City && fields.Country ? `${fields.City}, ${fields.Country}` : fields.Country) ||
          null;

        const industries = fields.Industries || fields.Tags || ['conference'];

        results.push({
          title: `${title} - Call for Speakers`,
          organization: title,
          description: `Event sourced from Airtable list.`,
          location,
          isRemote: fields.Online || false,
          eventDate: fields['Event Date'] ? new Date(fields['Event Date']) : undefined,
          cfpDeadline: fields['CFP Deadline'] ? new Date(fields['CFP Deadline']) : undefined,
          format: 'conference',
          industries,
          compensationType: undefined,
          compensationDetails: undefined,
          applyUrl,
          source: 'Airtable',
          sourceUrl: applyUrl,
        });
      }

      offset = data.offset;
    } while (offset);
  } catch {
    return results;
  }

  return results;
}
