import { ComparePage, compareMetadata } from "@/components/marketing/compare-page";
import { getComparePage } from "@/lib/compare";

const PAGE = getComparePage("aisensy-alternative");

export const metadata = compareMetadata(PAGE);

export default function Page() {
  return <ComparePage page={PAGE} />;
}
