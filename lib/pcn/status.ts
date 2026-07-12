export const STATUSES = [
  "Not started",
  "In progress (Ali)",
  "In progress (reassign)",
  "New correspondence (send to Ali)",
  "Appeal rejected",
  "Complete",
] as const;

export type Status = (typeof STATUSES)[number];

export const DEFAULT_STATUS: Status = "Not started";
