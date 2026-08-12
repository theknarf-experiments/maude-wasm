import type { MDXComponents } from "mdx/types";
import type { ComponentType } from "react";

export interface Chapter {
  id: string;
  title: string;
  Component: ComponentType<{ components?: MDXComponents }>;
}

interface ChapterModule {
  default: Chapter["Component"];
  title: string;
}

const modules = import.meta.glob<ChapterModule>("./*.mdx", { eager: true });

export const chapters: Chapter[] = Object.keys(modules)
  .sort()
  .map((path) => {
    const mod = modules[path];
    const id = path.replace(/^\.\/\d+-/, "").replace(/\.mdx$/, "");
    return { id, title: mod.title, Component: mod.default };
  });
