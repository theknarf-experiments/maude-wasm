declare module "*.mdx" {
  import type { ComponentType } from "react";
  import type { MDXComponents } from "mdx/types";

  export const title: string;
  const Component: ComponentType<{ components?: MDXComponents }>;
  export default Component;
}
