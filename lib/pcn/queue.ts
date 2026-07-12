import type { PcnView } from "./view";
import { COUNCIL_STATUSES } from "./status";
import { aliFeePenceOf, isDriverPaid, isMoneyRequested, daysSince, type MoneyPcn } from "./money";

export type QueueBucket = "todo" | "waiting" | "done";

export type QueueGroup = "SEND TO ALI" | "CONTACT OPERATOR" | "MONEY" | "DECIDE NEXT STEP";

export const QUEUE_GROUP_ORDER: readonly QueueGroup[] = [
  "SEND TO ALI",
  "CONTACT OPERATOR",
  "MONEY",
  "DECIDE NEXT STEP",
];

export type QueueActionKey =
  | "dispatch"
  | "send_to_ali"
  | "contact_operator"
  | "decide_next"
  | "pay_ali"
  | "request_money"
  | "chase_driver";

export interface QueueAction {
  key: QueueActionKey;
  group: QueueGroup;
  label: string;
}

export interface QueueEntry {
  bucket: QueueBucket;
  action: QueueAction | null;
  waitingOn: string | null;
}

// Structural input: the money checkpoints plus authority (for the TfL label).
export type QueuePcn = MoneyPcn & Pick<PcnView, "authority">;

const TFL = /tfl|transport for london/i;

// Nothing left for Alan on these once no action fires. Council "Complete" only
// lands here when its money loop is finished — an unfinished loop yields a
// MONEY action first, which routes the ticket to "todo" instead.
const DONE_STATUSES: readonly string[] = ["Appeal won", "Paid", "Canceled", "Complete"];

const WAITING_ON: Record<string, string> = {
  "In progress (Ali)": "with Ali",
  "In progress (reassign)": "appeal with council",
  "Message sent": "with operator",
};

function statusAction(p: QueuePcn): QueueAction | null {
  const s = p.status;
  if (p.category === "council") {
    if (s === "Not started")
      return {
        key: "dispatch",
        group: "SEND TO ALI",
        // TfL never accepts an Ali handoff — those always go the appeal route.
        label: TFL.test(p.authority ?? "") ? "Start appeal (TfL)" : "Send to Ali + pay / start appeal",
      };
    if (s === "New correspondence (send to Ali)")
      return { key: "send_to_ali", group: "SEND TO ALI", label: "Send new correspondence to Ali" };
    if (s === "Appeal rejected")
      return {
        key: "decide_next",
        group: "DECIDE NEXT STEP",
        label: "Rejected — resend to Ali, follow up, or pay off",
      };
  } else if (s === "Not started") {
    return { key: "contact_operator", group: "CONTACT OPERATOR", label: "Contact operator" };
  }
  return null;
}

function chaseAction(p: QueuePcn, now: Date): QueueAction {
  const name = (p.driverName ?? "").trim() || "unassigned";
  const days = daysSince(p.moneyRequestedAt, now);
  return {
    key: "chase_driver",
    group: "MONEY",
    label: `Chase ${name} for £80${days != null ? ` — requested ${days}d ago` : ""}`,
  };
}

// First incomplete step of the council money loop (pay Ali → request £80 → chase).
function moneyAction(p: QueuePcn, now: Date): QueueAction | null {
  if (p.category !== "council") return null;
  const s = p.status;
  if (s === "Appeal won") return null; // reassigned to driver — money loop waived

  if (s === "In progress (Ali)" || s === "Complete") {
    if (aliFeePenceOf(p) == null) return { key: "pay_ali", group: "MONEY", label: "Pay Ali £30/£40" };
    if (!isMoneyRequested(p)) return { key: "request_money", group: "MONEY", label: "Request £80 from driver" };
    if (!isDriverPaid(p)) return chaseAction(p, now);
    return null;
  }

  // Legacy rows (null/blank/free-text status): the path is unknowable, so never
  // prompt pay_ali/request_money — but a requested-and-unpaid debt is still real.
  const legacy = s == null || s.trim() === "" || !(COUNCIL_STATUSES as readonly string[]).includes(s);
  if (legacy && isMoneyRequested(p) && !isDriverPaid(p)) return chaseAction(p, now);
  return null;
}

export function queueEntryFor(p: QueuePcn, now: Date): QueueEntry {
  const action = statusAction(p) ?? moneyAction(p, now);
  if (action) return { bucket: "todo", action, waitingOn: null };
  if (p.status != null && DONE_STATUSES.includes(p.status))
    return { bucket: "done", action: null, waitingOn: null };
  return { bucket: "waiting", action: null, waitingOn: (p.status && WAITING_ON[p.status]) || null };
}
