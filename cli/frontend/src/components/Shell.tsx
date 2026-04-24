import type { ReactNode } from "react";
import { LiteCard, LiteCardBody, LiteCardHeader, LiteSectionHeader } from "./ui";

interface ShellProps {
  title: string;
  subtitle: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}

export function Shell({ title, subtitle, description, actions, children, className, bodyClassName }: ShellProps) {
  return (
    <LiteCard className={["panel", className].filter(Boolean).join(" ")}>
      <LiteCardHeader>
        <LiteSectionHeader eyebrow={subtitle} title={title} description={description} actions={actions} />
      </LiteCardHeader>
      <LiteCardBody className={["panel-flow", bodyClassName].filter(Boolean).join(" ")}>{children}</LiteCardBody>
    </LiteCard>
  );
}
