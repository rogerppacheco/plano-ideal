import type { ReactNode } from "react";

export interface PanelCardProps {
  title?: string;
  description?: string;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
  id?: string;
}

export interface MetricCardProps {
  label: string;
  value: ReactNode;
  hint?: string;
  className?: string;
}

export interface DashboardTabItem {
  id: string;
  label: string;
  icon?: string;
}

export function PanelCard(props: PanelCardProps): JSX.Element;
export function MetricCard(props: MetricCardProps): JSX.Element;
export function DashboardTabs(props: {
  tabs: DashboardTabItem[];
  activeTab: string;
  onChange: (tabId: string) => void;
}): JSX.Element;
