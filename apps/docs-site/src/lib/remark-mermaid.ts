import { visit } from "unist-util-visit";

export function remarkMermaidToComponent() {
  return (tree: unknown) => {
    visit(tree as any, "code", (node: any, index: number | undefined, parent: any) => {
      if (node.lang === "mermaid" && parent?.children && typeof index === "number") {
        parent.children.splice(index, 1, {
          type: "mdxJsxFlowElement",
          name: "Mermaid",
          attributes: [
            {
              type: "mdxJsxAttribute",
              name: "chart",
              value: node.value,
            },
          ],
          children: [],
        });
      }
    });
  };
}
