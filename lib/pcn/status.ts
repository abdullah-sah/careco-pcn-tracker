export const COUNCIL_STATUSES = [
  "Not started",
  "In progress (Ali)",
  "In progress (reassign)",
  "New correspondence (send to Ali)",
  "Appeal rejected",
  "Appeal won",
  "Complete",
] as const;

export const PRIVATE_STATUSES = [
  "Not started",
  "Message sent",
  "Paid",
  "Canceled",
] as const;

export type Status = (typeof COUNCIL_STATUSES)[number] | (typeof PRIVATE_STATUSES)[number];

export const DEFAULT_STATUS: Status = "Not started";

export function statusesFor(category: string): readonly string[] {
  return category === "council" ? COUNCIL_STATUSES : PRIVATE_STATUSES;
}

// Nothing left to do on these; everything else with a status set needs action.
// Unset/null status means legacy-untriaged — kept out of the actionable queue.
const CLOSED_STATUSES: readonly string[] = ["Complete", "Appeal won", "Paid", "Canceled"];

export function isActionable(status: string | null): boolean {
  return status != null && status !== "" && !CLOSED_STATUSES.includes(status);
}

// Council tickets that are new or have fresh correspondence can be emailed to Ali.
export const SEND_TO_ALI_STATUSES: readonly string[] = [
  "Not started",
  "New correspondence (send to Ali)",
];

export function canSendToAli(category: string, status: string | null): boolean {
  return category === "council" && status != null && SEND_TO_ALI_STATUSES.includes(status);
}
