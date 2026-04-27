import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: "section" | "div" | "aside";
}

export function LiteCard({ as = "section", className, ...props }: CardProps) {
  const Component = as;
  return <Component className={cx("lite-card", className)} {...props} />;
}

export function LiteCardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("lite-card-header", className)} {...props} />;
}

export function LiteCardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("lite-card-body", className)} {...props} />;
}

interface LiteSectionHeaderProps extends HTMLAttributes<HTMLDivElement> {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function LiteSectionHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
  ...props
}: LiteSectionHeaderProps) {
  return (
    <div className={cx("section-header", className)} {...props}>
      <div className="section-header-copy">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h3>{title}</h3>
        {description ? <p className="section-description">{description}</p> : null}
      </div>
      {actions ? <div className="section-actions">{actions}</div> : null}
    </div>
  );
}

interface LiteButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
}

export function LiteButton({ variant = "primary", size = "sm", className, ...props }: LiteButtonProps) {
  return <button className={cx("lite-button", `lite-button-${variant}`, `lite-button-${size}`, className)} {...props} />;
}

interface LiteBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: "neutral" | "accent" | "success" | "warning" | "danger";
}

export function LiteBadge({ tone = "neutral", className, ...props }: LiteBadgeProps) {
  return <span className={cx("lite-badge", `lite-badge-${tone}`, className)} {...props} />;
}

export function LiteInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx("lite-input", className)} {...props} />;
}

export function LiteSelect({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cx("lite-input", "lite-select", className)} {...props} />;
}

interface LiteStatCardProps {
  label: string;
  value: string;
  note: string;
}

export function LiteStatCard({ label, value, note }: LiteStatCardProps) {
  return (
    <LiteCard className="metric-card">
      <p className="metric-label">{label}</p>
      <p className="metric-value">{value}</p>
      <p className="metric-note">{note}</p>
    </LiteCard>
  );
}

interface LiteEmptyStateProps {
  title: string;
  detail: string;
}

export function LiteEmptyState({ title, detail }: LiteEmptyStateProps) {
  return (
    <div className="empty-state-card">
      <strong>{title}</strong>
      <p>{detail}</p>
    </div>
  );
}
