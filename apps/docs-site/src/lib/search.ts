export interface SearchDocument {
  id: string;
  path: string;
  docTitle: string;
  heading: string;
  url: string;
  snippet: string;
  summary?: string;
  status?: string;
  lastUpdated?: string;
  tags?: string[];
  audience?: string[];
  category?: string;
}

export interface SearchIndex {
  generatedAt: string;
  docs: SearchDocument[];
}

export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}
