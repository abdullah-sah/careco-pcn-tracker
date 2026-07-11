export const STATUSES = [
  "Not started",
  "In progress (Ali)",
  "In progress (reassign)",
  "Appeal rejected",
  "Complete",
] as const;

export type Status = (typeof STATUSES)[number];

export const DEFAULT_STATUS: Status = "Not started";
