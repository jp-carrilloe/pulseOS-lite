import type {
  DatabaseSource,
  FieldResponse,
  ProfileField,
  ProfileFilters,
  ProfileResponse,
  SigmaProfile,
  SortDirection,
  Table
} from "./types";

const API_URL = import.meta.env.VITE_PROFILE_BROWSER_API_URL || "http://localhost:8787";


export const FIELD_DEFINITIONS: ProfileField[] = [
  { key: "name", label: "Name", defaultVisible: true, sortable: true },
  { key: "venture_name", label: "Venture", defaultVisible: true, sortable: true },
  { key: "city", label: "City", defaultVisible: true, sortable: true },
  { key: "region", label: "Region", defaultVisible: true, sortable: true },
  { key: "stage", label: "Stage", defaultVisible: true, sortable: true },
  { key: "category", label: "Category", defaultVisible: true, sortable: true },
  { key: "research_status", label: "Research", defaultVisible: true, sortable: true },
  { key: "profile_completion_status", label: "Completion", defaultVisible: true, sortable: true },
  { key: "profile_completion_percentage", label: "%", defaultVisible: true, sortable: true },
  { key: "last_researched_at", label: "Last researched", defaultVisible: true, sortable: true },
  { key: "linkedin_url", label: "LinkedIn", defaultVisible: false, sortable: false },
  { key: "company_url", label: "Website", defaultVisible: false, sortable: false },
  { key: "venture_description", label: "Description", defaultVisible: false, sortable: false },
  { key: "venture_tags", label: "Tags", defaultVisible: false, sortable: false },
  { key: "semantic_summary", label: "Summary", defaultVisible: false, sortable: false },
  { key: "capital_raised_millions", label: "Raised", defaultVisible: true, sortable: true },
  { key: "amount_raised_in_m_eur", label: "Raised source", defaultVisible: false, sortable: false },
  { key: "capital_raised", label: "Capital raised", defaultVisible: false, sortable: false },
  { key: "capita_raised", label: "Capita raised", defaultVisible: false, sortable: false },
  { key: "notes", label: "Notes", defaultVisible: false, sortable: false },
  { key: "match_status", label: "Match status", defaultVisible: false, sortable: true },
  { key: "confidence_score", label: "Confidence", defaultVisible: false, sortable: true }
];

const MOCK_PROFILES: SigmaProfile[] = [
  {
    id: "mock-1",
    name: "Aisha Novak",
    venture_name: "Carbon Ledger",
    city: "Berlin",
    region: "Europe",
    stage: "Seed",
    category: "Climate fintech",
    research_status: "RESEARCHED",
    profile_completion_status: "COMPLETE",
    profile_completion_percentage: 95,
    last_researched_at: "2026-04-10",
    company_url: "https://example.com",
    linkedin_url: "https://linkedin.com/in/example",
    venture_tags: "climate, fintech, carbon accounting",
    semantic_summary: "Founder building accounting infrastructure for carbon-linked finance workflows.",
    venture_description: "Carbon Ledger helps finance teams reconcile emissions data with commercial reporting.",
    capital_raised: "$2.1M seed",
    capital_raised_millions: "2.1M"
  },
  {
    id: "mock-2",
    name: "Mateo Rios",
    venture_name: "ClinicFlow AI",
    city: "Madrid",
    region: "Europe",
    stage: "Pre-seed",
    category: "Health AI",
    research_status: "PENDING",
    profile_completion_status: "PARTIAL",
    profile_completion_percentage: 62,
    last_researched_at: "",
    venture_tags: "healthcare, ai, operations",
    semantic_summary: "Healthcare workflow automation for outpatient clinics.",
    venture_description: "ClinicFlow AI reduces administrative load across clinical intake and follow-up."
  },
  {
    id: "mock-3",
    name: "Lina Park",
    venture_name: "GridPulse",
    city: "Seoul",
    region: "APAC",
    stage: "Series A",
    category: "Energy",
    research_status: "RESEARCHED",
    profile_completion_status: "COMPLETE",
    profile_completion_percentage: 88,
    last_researched_at: "2026-04-09",
    venture_tags: "energy, grid, infrastructure",
    semantic_summary: "Grid analytics infrastructure for distributed energy operators.",
    capital_raised: "$8M Series A",
    capital_raised_millions: "8.0M"
  }
];

export async function fetchDatabases(): Promise<DatabaseSource[]> {
  const response = await fetch(`${API_URL}/api/databases`);
  if (!response.ok) throw new Error(`Databases request failed: ${response.status}`);
  return response.json();
}

export async function fetchFields(databaseKey: string = "crm", tableName: string = "Companies"): Promise<FieldResponse> {
  try {
    const url = new URL(`${API_URL}/api/fields`);
    url.searchParams.set("database", databaseKey);
    url.searchParams.set("table", tableName);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Fields request failed: ${response.status}`);
    return response.json();
  } catch {
    return {
      fields: [],
      facets: {}
    };
  }
}

export async function fetchTables(databaseKey: string = "crm"): Promise<Table[]> {
  try {
    const url = new URL(`${API_URL}/api/tables`);
    url.searchParams.set("database", databaseKey);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Tables request failed: ${response.status}`);
    return response.json();
  } catch {
    return [];
  }
}

export async function registerDatabase(params: {
  key: string;
  label: string;
  path: string;
  description?: string;
}): Promise<DatabaseSource> {
  const response = await fetch(`${API_URL}/api/databases`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      key: params.key,
      label: params.label,
      path: params.path,
      description: params.description || "Custom database"
    })
  });

  if (!response.ok && response.status !== 409) {
    throw new Error(`Database registration failed: ${response.status}`);
  }

  if (response.status === 409) {
    return {
      key: params.key,
      label: params.label,
      path: params.path,
      description: params.description || "Custom database",
      exists: true,
      tableCount: 0
    };
  }

  return response.json();
}

export async function fetchProfiles(params: {
  query: string;
  filters: ProfileFilters;
  sortBy: string;
  sortDirection: SortDirection;
  page: number;
  pageSize: number;
  databaseKey?: string;
  tableName?: string;
}): Promise<ProfileResponse> {
  const hasQuery = params.query.trim().length > 0;

  try {
    const url = new URL(`${API_URL}/api/profiles`);
    url.searchParams.set("database", params.databaseKey || "crm");
    url.searchParams.set("page", String(params.page));
    url.searchParams.set("pageSize", String(params.pageSize));
    url.searchParams.set("sortBy", params.sortBy);
    url.searchParams.set("sortDirection", params.sortDirection);
    if (params.query) url.searchParams.set("query", params.query);
    if (params.tableName) url.searchParams.set("table", params.tableName);

    Object.entries(params.filters).forEach(([key, filter]) => {
      if (filter && filter.operator) {
        url.searchParams.set(`${key}__${filter.operator}`, filter.value);
      }
    });

    const response = await fetch(url);
    if (!response.ok) throw new Error(`Profiles request failed: ${response.status}`);
    return response.json();
  } catch (error) {
    throw error instanceof Error ? error : new Error("Profiles request failed");
  }
}

function filterMockProfiles(params: {
  query: string;
  filters: ProfileFilters;
  sortBy: string;
  sortDirection: SortDirection;
  page: number;
  pageSize: number;
  databaseKey?: string;
  tableName?: string;
}): ProfileResponse {
  const query = params.query.toLowerCase().trim();
  let profiles = MOCK_PROFILES.filter((profile) => {
    const filterMatches = Object.entries(params.filters).every(([key, filter]) => {
      if (!filter || !filter.operator) return true;
      const field = filterKeyToProfileField(key);
      const cellValue = String(profile[field] || "");
      
      switch (filter.operator) {
        case "eq":
          return cellValue === filter.value;
        case "contains":
          return cellValue.toLowerCase().includes(filter.value.toLowerCase());
        case "empty":
          return !cellValue;
        case "not_empty":
          return !!cellValue;
        default:
          return true;
      }
    });

    if (!filterMatches) return false;
    if (!query) return true;

    return JSON.stringify(profile).toLowerCase().includes(query);
  });

  profiles = profiles.sort((a, b) => {
    const aValue = String(a[params.sortBy as keyof SigmaProfile] || "");
    const bValue = String(b[params.sortBy as keyof SigmaProfile] || "");
    return params.sortDirection === "asc" ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
  });

  return {
    profiles,
    total: profiles.length,
    page: params.page,
    pageSize: params.pageSize,
    mode: "list"
  };
}

export async function updateCell(params: {
  databaseKey: string;
  tableName: string;
  rowId: string | number;
  field: string;
  value: unknown;
}): Promise<SigmaProfile> {
  const response = await fetch(`${API_URL}/api/cells`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      database: params.databaseKey,
      table: params.tableName,
      rowId: params.rowId,
      field: params.field,
      value: params.value
    })
  });

  if (!response.ok) {
    throw new Error(`Cell update failed: ${response.status}`);
  }

  const data = await response.json();
  return data.row as SigmaProfile;
}

export async function fetchSavedViews() {
  try {
    const response = await fetch(`${API_URL}/api/views`);
    if (!response.ok) return [];
    return response.json();
  } catch {
    return [];
  }
}

export async function saveViews(views: any[]) {
  try {
    await fetch(`${API_URL}/api/views`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(views)
    });
  } catch (error) {
    console.error("Failed to save views:", error);
  }
}

function filterKeyToProfileField(key: string): keyof SigmaProfile {
  const map: Record<string, keyof SigmaProfile> = {
    researchStatus: "research_status",
    completionStatus: "profile_completion_status",
    region: "region",
    city: "city",
    category: "category",
    stage: "stage"
  };
  return map[key] || "name";
}

function buildMockFacets(profiles: SigmaProfile[]) {
  const keys = ["research_status", "profile_completion_status", "region", "city", "category", "stage"] as const;
  return Object.fromEntries(
    keys.map((key) => [
      key,
      Array.from(new Set(profiles.map((profile) => profile[key]).filter(Boolean) as string[])).sort()
    ])
  );
}
