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

// Council tickets that are new or have fresh correspondence can be emailed to Ali.
export const SEND_TO_ALI_STATUSES: readonly string[] = [
  "Not started",
  "New correspondence (send to Ali)",
];

export function canSendToAli(category: string, status: string | null): boolean {
  return category === "council" && status != null && SEND_TO_ALI_STATUSES.includes(status);
}
