import { clsx, type ClassValue } from "clsx";
import type { Table } from "./types";

const TABLE_NAME_ALIASES: Record<string, string> = {
  Companies: "Companies",
  People: "People",
  Deals: "Deals",
  candidate_companies: "Candidate Companies",
  candidate_company_evidence: "Candidate Company Evidence",
  candidate_company_expansions: "Candidate Company Expansions",
  candidate_company_signals: "Candidate Company Signals",
  company_candidates: "Company Candidates",
  company_evidence: "Company Evidence",
  company_role_targets: "Company Role Targets",
  company_scores: "Company Scores",
  people_leads: "People Leads",
  run_exports: "Run Exports",
  run_tool_usage: "Run Tool Usage",
  signal_hits: "Signal Hits",
  signal_queries: "Signal Queries",
  post_drafts: "Post Drafts",
  post_ideas: "Post Ideas",
  calendar_items: "Calendar Items",
  edit_briefs: "Edit Briefs",
  source_assets: "Source Assets",
  source_content_usage: "Content Usage",
  sources: "Sources",
  transcripts: "Transcripts",
  transcript_chunks: "Transcript Chunks",
  segments: "Segments",
  topics: "Topics",
  people: "People",
  source_topics: "Source Topics",
  source_people: "Source People",
  tiktok_raw_clips: "TikTok Raw Clips",
  content_calendar: "Content Calendar",
  content_ideas: "Content Ideas",
  research_queue: "Research Queue",
  source_library: "Source Library",
  strategy_briefs: "Strategy Briefs",
  publishing_pipeline: "Publishing Pipeline"
};

const TABLE_SORT_PRIORITY: Record<string, number> = {
  Companies: 10,
  People: 20,
  Deals: 30,
  company_candidates: 40,
  company_scores: 50,
  company_evidence: 60,
  people_leads: 70,
  candidate_companies: 80,
  candidate_company_signals: 90,
  candidate_company_evidence: 100,
  signal_queries: 110,
  signal_hits: 120,
  run_exports: 130,
  run_tool_usage: 140,
  post_drafts: 10,
  post_ideas: 20,
  calendar_items: 30,
  edit_briefs: 40,
  source_assets: 50,
  source_content_usage: 60,
  sources: 70,
  transcripts: 80,
  transcript_chunks: 90,
  segments: 100,
  topics: 110,
  people: 120,
  source_topics: 130,
  source_people: 140,
  tiktok_raw_clips: 150
};

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatTableName(tableName: string) {
  const alias = TABLE_NAME_ALIASES[tableName];
  if (alias) {
    return alias;
  }

  return tableName
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function sortTablesForDisplay(tables: Table[]) {
  return [...tables].sort((left, right) => {
    const leftPriority = TABLE_SORT_PRIORITY[left.name] ?? 999;
    const rightPriority = TABLE_SORT_PRIORITY[right.name] ?? 999;

    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }

    return formatTableName(left.name).localeCompare(formatTableName(right.name));
  });
}

// Matches ISO 8601 datetime strings like "2026-04-10T14:32:00Z" or "2026-04-10 14:32:00"
const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;

export function formatValue(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  if (typeof value === "number") {
    return Number.isInteger(value) ? value.toString() : value.toFixed(1);
  }

  const str = String(value);

  // Format datetime strings as date-only (YYYY-MM-DD)
  if (ISO_DATETIME_RE.test(str)) {
    return str.slice(0, 10);
  }

  return str;
}

export function statusTone(value?: string | null) {
  const normalized = (value || "").toLowerCase();
  if (normalized.includes("complete") || normalized.includes("researched")) {
    return "border-success/25 bg-success/10 text-success";
  }
  if (normalized.includes("partial") || normalized.includes("pending")) {
    return "border-warning/30 bg-warning/10 text-warning";
  }
  if (normalized.includes("blank") || normalized.includes("minimal") || normalized.includes("error")) {
    return "border-sigma-red/30 bg-sigma-red/10 text-sigma-red";
  }
  return "border-border bg-secondary text-secondary-foreground";
}

export function truncate(value: string | null | undefined, length = 90) {
  if (!value) return "—";
  if (value.length <= length) return value;
  return `${value.slice(0, length).trim()}...`;
}
