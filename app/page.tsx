import PcnPortal from "@/components/pcn-portal";
import { getAllPcns } from "@/db/queries";
import { getSessionRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [pcns, role] = await Promise.all([getAllPcns(), getSessionRole()]);
  return <PcnPortal initialPcns={pcns} role={role ?? "alan"} />;
}
