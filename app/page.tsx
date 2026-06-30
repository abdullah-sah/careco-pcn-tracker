import PcnPortal from "@/components/pcn-portal";
import { getAllPcns } from "@/db/queries";

export const dynamic = "force-dynamic";

export default async function Page() {
  const pcns = await getAllPcns();
  return <PcnPortal initialPcns={pcns} />;
}
