import { resolveFilter } from "./filters";
import type { EvaluationFilters } from "@/server/services/evaluations";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const uuidish = (v: string | undefined) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined);
const slug = (v: string | undefined) => (v && /^[a-z_]{2,60}$/.test(v) ? v : undefined);

/** Explorer and export share one reading of the URL. */
export function explorerFilters(sp: SP) {
  const f = resolveFilter(sp, "4w");
  const band = one(sp.band);
  const filters: EvaluationFilters = {
    from: f.from,
    to: f.to,
    siteId: f.siteId,
    reviewerId: f.reviewerId,
    callType: f.callType as EvaluationFilters["callType"],
    agentId: uuidish(one(sp.agent)),
    band: band && ["perfect", "meets", "below", "fail"].includes(band) ? (band as EvaluationFilters["band"]) : undefined,
    issueKey: slug(one(sp.issue)),
    criterionKey: slug(one(sp.criterion)),
    q: one(sp.q)?.slice(0, 100) || undefined,
  };
  const sortRaw = one(sp.sort);
  const sort = sortRaw === "score_asc" || sortRaw === "score_desc" ? sortRaw : "recent";
  return { period: f, filters, sort: sort as "recent" | "score_asc" | "score_desc", page: Math.max(1, Number(one(sp.page)) || 1) };
}
