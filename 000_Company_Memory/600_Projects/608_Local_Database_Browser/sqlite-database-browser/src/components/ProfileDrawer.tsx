import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, ExternalLink, X } from "lucide-react";
import type { SigmaProfile } from "../lib/types";
import { cn, formatValue, statusTone } from "../lib/utils";

interface ProfileDrawerProps {
  profile: SigmaProfile | null;
  onClose: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  hasPrevious?: boolean;
  hasNext?: boolean;
  currentIndex?: number;
  totalCount?: number;
}

export function ProfileDrawer({
  profile,
  onClose,
  onPrevious,
  onNext,
  hasPrevious = false,
  hasNext = false,
  currentIndex,
  totalCount
}: ProfileDrawerProps) {
  const title =
    profile?.name ||
    profile?.full_name ||
    profile?.company_name ||
    profile?.name ||
    profile?.title ||
    profile?.domain ||
    profile?.website ||
    profile?.id ||
    "Record";
  const linkedInUrl = profile?.linkedin_url ? String(profile.linkedin_url) : undefined;
  const websiteUrl = profile?.company_url || profile?.website || profile?.domain;
  const normalizedWebsiteUrl = websiteUrl ? String(websiteUrl) : undefined;

  return (
    <AnimatePresence>
      {profile ? (
        <>
          <motion.button
            aria-label="Close profile drawer"
            className="fixed inset-0 z-30 bg-background/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            type="button"
          />
          <motion.aside
            className="panel-surface fixed right-3 top-3 z-40 flex h-[calc(100vh-1.5rem)] w-[min(560px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-[32px]"
            initial={{ opacity: 0, x: 80, scale: 0.98 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 80, scale: 0.98 }}
            transition={{ type: "spring", damping: 28, stiffness: 250 }}
          >
            <div className="border-b border-border/70 px-6 py-6">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">Record inspector</div>
                    {typeof currentIndex === "number" && typeof totalCount === "number" ? (
                      <span className="rounded-full border border-border/70 bg-background/60 px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
                        {currentIndex + 1} / {totalCount}
                      </span>
                    ) : null}
                  </div>
                  <div>
                    <h2 className="font-identity text-3xl font-bold tracking-[-0.04em]">{String(title)}</h2>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      Review the full metadata for this row without losing your table context.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {profile.research_status ? (
                      <span className={cn("rounded-full border px-3 py-1 text-xs font-semibold", statusTone(profile.research_status))}>
                        {profile.research_status}
                      </span>
                    ) : null}
                    {profile.profile_completion_status ? (
                      <span
                        className={cn(
                          "rounded-full border px-3 py-1 text-xs font-semibold",
                          statusTone(profile.profile_completion_status)
                        )}
                      >
                        {profile.profile_completion_status}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    className="icon-button focused-ring h-10 w-10 shrink-0 rounded-2xl"
                    disabled={!hasPrevious}
                    onClick={onPrevious}
                    type="button"
                  >
                    <ChevronLeft className="h-4.5 w-4.5" />
                  </button>
                  <button
                    className="icon-button focused-ring h-10 w-10 shrink-0 rounded-2xl"
                    disabled={!hasNext}
                    onClick={onNext}
                    type="button"
                  >
                    <ChevronRight className="h-4.5 w-4.5" />
                  </button>
                  <button className="icon-button focused-ring h-10 w-10 shrink-0 rounded-2xl" onClick={onClose} type="button">
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </div>

            <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <ProfileLink label="LinkedIn" value={linkedInUrl} />
                <ProfileLink label="Website" value={normalizedWebsiteUrl} />
              </div>

              <div className="grid gap-3">
                {Object.entries(profile)
                  .filter(([key]) => key !== "id")
                  .map(([key, value]) => (
                    <section className="panel-muted rounded-2xl px-4 py-4" key={key}>
                      <h4 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        {key.replace(/_/g, " ")}
                      </h4>
                      <div className="mt-2 whitespace-pre-wrap text-sm leading-7 text-foreground">{formatValue(value)}</div>
                    </section>
                  ))}
              </div>
            </div>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}

function ProfileLink({ label, value }: { label: string; value?: string | null }) {
  if (!value) {
    return (
      <div className="panel-muted rounded-2xl px-4 py-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
        <div className="mt-2 text-sm text-muted-foreground">Not available</div>
      </div>
    );
  }

  return (
    <a
      className="panel-muted focused-ring rounded-2xl px-4 py-4 transition hover:border-primary/30 hover:bg-primary/[0.08]"
      href={value}
      rel="noreferrer"
      target="_blank"
    >
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      <div className="mt-2 flex items-center gap-2 text-sm font-semibold text-primary">
        Open link <ExternalLink className="h-4 w-4" />
      </div>
    </a>
  );
}
