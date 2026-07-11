export interface SkeletonProps {
  className?: string;
}

export function Skeleton(props?: SkeletonProps): JSX.Element;
export function SkeletonText(props?: { lines?: number; className?: string }): JSX.Element;
export function SkeletonForm(props?: { fields?: number }): JSX.Element;
export function SkeletonTable(props?: { rows?: number; cols?: number }): JSX.Element;
export function SkeletonCards(props?: { count?: number }): JSX.Element;
export function SkeletonUserList(props?: { count?: number }): JSX.Element;
