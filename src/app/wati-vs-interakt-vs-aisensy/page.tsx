import { ComparePage, compareMetadata } from "@/components/marketing/compare-page";
import { getComparePage } from "@/lib/compare";

const PAGE = getComparePage("wati-vs-interakt-vs-aisensy");

export const metadata = compareMetadata(PAGE);

export default function Page() {
  return <ComparePage page={PAGE} />;
}
