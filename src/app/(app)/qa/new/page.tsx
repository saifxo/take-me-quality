import type { Metadata } from "next";
import { requireUser } from "@/server/auth/dal";
import { listAgents, listSites } from "@/server/services/roster";
import { PageHeader } from "@/components/ui/surface";
import { NewCall } from "./new-call";

export const metadata: Metadata = { title: "Score a call" };

export default async function NewCallPage(props: PageProps<"/qa/new">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const reviewerId = user.role === "qa" ? user.id : undefined;
  const [agents, sites] = await Promise.all([listAgents({ reviewerId }), listSites({ activeOnly: true, reviewerId })]);
  return (
    <>
      <PageHeader
        eyebrow="Score a call"
        title="Which calls are you reviewing?"
        description="Paste rows straight from the recordings portal, or enter a call by hand. Either way you’ll land in the scorecard with the call details filled in."
      />
      <NewCall
        initialTab={sp.mode === "manual" ? "manual" : "paste"}
        agents={agents.map((a) => ({ id: a.id, fullName: a.fullName, siteId: a.siteId, siteName: a.siteName, siteCode: a.siteCode, status: a.status }))}
        sites={sites.map((s) => ({ id: s.id, name: s.name, code: s.code }))}
      />
    </>
  );
}
