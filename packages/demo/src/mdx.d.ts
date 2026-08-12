declare module "*.mdx" {
  import type { MDXComponents } from "mdx/types";
  import type { ComponentType } from "react";

  export const title: string;
  const Component: ComponentType<{ components?: MDXComponents }>;
  export default Component;
}
