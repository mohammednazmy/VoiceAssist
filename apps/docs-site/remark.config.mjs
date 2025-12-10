import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkMdx from "remark-mdx";
import remarkPresetLintRecommended from "remark-preset-lint-recommended";
import remarkValidateLinks from "remark-validate-links";

export default {
  plugins: [
    remarkFrontmatter,
    remarkGfm,
    remarkMdx,
    remarkPresetLintRecommended,
    [remarkValidateLinks, { repository: "https://github.com/mohammednazmy/VoiceAssist" }],
  ],
};
