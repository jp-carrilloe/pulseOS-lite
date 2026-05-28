export type SortDirection = "asc" | "desc";

export type ProfileFieldKey = string;

export interface ProfileField {
  key: ProfileFieldKey;
  label: string;
  defaultVisible: boolean;
  sortable: boolean;
}

export interface SigmaProfile {
  id: string;
  name: string;
  linkedin_url?: string | null;
  venture_name?: string | null;
  venture_description?: string | null;
  city?: string | null;
  region?: string | null;
  stage?: string | null;
  category?: string | null;
  notes?: string | null;
  research_status?: string | null;
  confidence_score?: number | null;
  venture_tags?: string | null;
  semantic_summary?: string | null;
  last_researched_at?: string | null;
  company_url?: string | null;
  match_status?: string | null;
  amount_raised_in_m_eur?: string | null;
  capital_raised?: string | null;
  capita_raised?: string | null;
  capital_raised_amount?: number | null;
  capital_raised_millions?: string | null;
  profile_completion_status?: string | null;
  profile_completion_percentage?: number | null;
  similarity?: number | null;
  [key: string]: unknown;
}

export type ProfileFilters = Record<string, string>;

export interface ProfileResponse {
  profiles: SigmaProfile[];
  total: number;
  page: number;
  pageSize: number;
  mode: "list" | "semantic";
  fields?: ProfileField[];
}

export interface FieldResponse {
  fields: ProfileField[];
  facets: Record<string, string[]>;
}

export interface Table {
  name: string;
  rowCount: number;
}

export interface DatabaseSource {
  key: string;
  label: string;
  description: string;
  path: string;
  exists: boolean;
  tableCount: number;
}
