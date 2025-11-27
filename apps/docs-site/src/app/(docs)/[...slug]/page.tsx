import { notFound } from "next/navigation";
import { DocPage } from "@/components/DocPage";
import { findNavItemByHref, getFlattenedNavigation } from "@/lib/navigation";

export default function DocRoutePage({ params }: { params: { slug: string[] } }) {
  const href = `/${params.slug.join("/")}`;
  const navItem = findNavItemByHref(href);

  if (!navItem) {
    return notFound();
  }

  return <DocPage title={navItem.title} description={navItem.description} docPaths={navItem.docPaths || []} />;
}

export function generateStaticParams() {
  return getFlattenedNavigation()
    .filter((item) => item.href !== "/")
    .map((item) => ({ slug: item.href.replace(/^\//, "").split("/") }));
}
