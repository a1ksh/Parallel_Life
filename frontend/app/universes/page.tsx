import type { Metadata } from "next";
import { ParallelLife } from "@/components/parallel-life";

export const metadata: Metadata = {
  title: "Parallel Life — One life. Infinite possibilities.",
  description: "Explore alternate lives in the extended Parallel Life game.",
};

export default function UniversesPage() {
  return <div lang="en">
    <nav className="frame"><a className="button button-ghost" href="/" lang="kk">← Қазақша оқиғалар</a></nav>
    <ParallelLife />
  </div>;
}
