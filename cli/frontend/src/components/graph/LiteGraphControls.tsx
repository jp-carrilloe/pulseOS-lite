import type { ReactNode } from "react";
import { LiteBadge, LiteButton } from "../ui";

interface LiteGraphControlsProps {
  title: string;
  subtitle: string;
  headerBadges?: ReactNode;
  toolbarControls?: ReactNode;
  layoutName: string;
  onLayoutChange: (name: string) => void;
  onDefaultView: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  entityTypes: string[];
  relationshipTypes: string[];
  readLayer: string;
  colorForType: (type: string) => string;
}

const LAYOUT_OPTIONS = [
  { id: "fcose", label: "Force" },
  { id: "breadthfirst", label: "Hierarchy" },
  { id: "concentric", label: "Radial" },
] as const;

const READ_LAYER_LABELS: Record<string, string> = {
  canonical: "Verified",
  canonical_with_seed: "Full Map",
  evidence: "Raw Sources",
};

export function LiteGraphControls({
  title,
  subtitle,
  headerBadges,
  toolbarControls,
  layoutName,
  onLayoutChange,
  onDefaultView,
  onZoomIn,
  onZoomOut,
  onFit,
  entityTypes,
  relationshipTypes,
  readLayer,
  colorForType,
}: LiteGraphControlsProps) {
  return (
    <div className="lite-graph-controls" data-testid="lite-graph-controls">
      <div className="lite-graph-controls-head">
        <div className="lite-graph-controls-copy">
          <p className="lite-graph-controls-eyebrow">Graph workspace</p>
          <div className="lite-graph-controls-title-row">
            <h3>{title}</h3>
            <LiteBadge tone="accent">{READ_LAYER_LABELS[readLayer] ?? readLayer}</LiteBadge>
          </div>
          <p className="lite-graph-controls-subtitle">{subtitle}</p>
          {headerBadges ? <div className="lite-graph-toolbar-badges">{headerBadges}</div> : null}
        </div>
        <div className="lite-graph-controls-actions">
          <LiteButton type="button" variant="secondary" onClick={onDefaultView}>
            Default view
          </LiteButton>
          <LiteButton type="button" variant="ghost" onClick={onZoomIn}>
            Zoom in
          </LiteButton>
          <LiteButton type="button" variant="ghost" onClick={onZoomOut}>
            Zoom out
          </LiteButton>
          <LiteButton type="button" variant="secondary" onClick={onFit}>
            Fit graph
          </LiteButton>
        </div>
      </div>

      <div className="lite-graph-controls-body">
        <div className="lite-graph-toolbar-slot">{toolbarControls}</div>
        <div className="lite-graph-layout-section" aria-label="Graph layout">
          <span className="lite-graph-control-label">Layout</span>
          <div className="lite-graph-layout-toolbar" role="group" aria-label="Graph layout">
            {LAYOUT_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={layoutName === option.id ? "graph-segmented-option active" : "graph-segmented-option"}
                onClick={() => onLayoutChange(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <details className="lite-graph-legend-tray">
        <summary>
          <span>Legend</span>
          <span className="muted-copy">{entityTypes.length} node types</span>
        </summary>
        <div className="lite-graph-legend-inline">
          <section className="lite-graph-legend-section">
            <p className="lite-graph-legend-label">Entity types</p>
            <div className="lite-graph-legend-list">
              {entityTypes.map((type) => (
                <div key={type} className="graph-legend-chip">
                  <span className="graph-legend-swatch" style={{ backgroundColor: colorForType(type) }} aria-hidden="true" />
                  <span>{type}</span>
                </div>
              ))}
            </div>
          </section>
          <section className="lite-graph-legend-section">
            <p className="lite-graph-legend-label">Relationships</p>
            <div className="lite-graph-legend-list">
              {relationshipTypes.map((type) => (
                <div key={type} className="graph-legend-chip">
                  <span className="graph-legend-line" aria-hidden="true" />
                  <span>{type}</span>
                </div>
              ))}
            </div>
          </section>
          <section className="lite-graph-legend-section">
            <p className="lite-graph-legend-label">Read layer</p>
            <div className="lite-graph-legend-list">
              <div className="graph-legend-chip">
                <span className={`graph-legend-layer graph-legend-layer-${readLayer === "canonical_with_seed" ? "seed" : readLayer}`} aria-hidden="true" />
                <span>{READ_LAYER_LABELS[readLayer] ?? readLayer}</span>
              </div>
            </div>
          </section>
        </div>
      </details>
    </div>
  );
}
