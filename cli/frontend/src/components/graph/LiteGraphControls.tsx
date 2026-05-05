import type { ReactNode } from "react";
import { LiteBadge, LiteButton } from "../ui";

interface LiteGraphControlsProps {
  title: string;
  subtitle: string;
  headerBadges?: ReactNode;
  toolbarControls?: ReactNode;
  maintenanceControls?: ReactNode;
  entityTypes: string[];
  relationshipTypes: string[];
  readLayer: string;
  colorForType: (type: string) => string;
}

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
  maintenanceControls,
  entityTypes,
  relationshipTypes,
  readLayer,
  colorForType,
}: LiteGraphControlsProps) {
  return (
    <div className="lite-graph-controls" data-testid="lite-graph-controls">
      <div className="lite-graph-controls-head">
        <div className="lite-graph-controls-copy">
          <p className="lite-graph-controls-eyebrow">Map controls</p>
          <div className="lite-graph-controls-title-row">
            <h3>{title}</h3>
            <LiteBadge tone="accent">{READ_LAYER_LABELS[readLayer] ?? readLayer}</LiteBadge>
          </div>
          <p className="lite-graph-controls-subtitle">{subtitle}</p>
          {headerBadges ? <div className="lite-graph-toolbar-badges">{headerBadges}</div> : null}
        </div>
        {toolbarControls ? <div className="lite-graph-controls-actions">{toolbarControls}</div> : null}
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

      {maintenanceControls ? (
        <details className="lite-graph-maintenance-tray">
          <summary>
            <span>Settings and maintenance</span>
            <span className="muted-copy">Documents, terminal, and index controls</span>
          </summary>
          <div className="lite-graph-maintenance-body">{maintenanceControls}</div>
        </details>
      ) : null}
    </div>
  );
}
