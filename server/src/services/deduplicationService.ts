export function generateDeduplicationKey(title: string, organization: string): string {
  const normalizedTitle = title
    .toLowerCase()
    .replace(organization?.toLowerCase() || '', '')
    .replace(/\b(20\d{2})\b/g, '') // Remove years (2000-2099)
    .replace(/[^a-z0-9]/g, '')     // Remove non-alphanumeric
    .trim();

  const normalizedOrg = (organization || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();

  return `${normalizedOrg}:${normalizedTitle}`;
}
