import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { get } from "./api";
import { pick } from "./format";
import { useI18n } from "./i18n";
import type { Category } from "./types";

export function useCategories() {
  return useQuery({ queryKey: ["categories"], queryFn: () => get<Category[]>("/waste/categories"), staleTime: Infinity });
}

/** slug → category, plus a localized name helper. */
export function useCategoryMap() {
  const { data } = useCategories();
  const { lang } = useI18n();
  return useMemo(() => {
    const map = new Map((data ?? []).map((c) => [c.slug, c]));
    const name = (slug: string) => {
      const c = map.get(slug);
      return c ? pick(lang, c.name, c.name_hi) : slug;
    };
    return { map, name, list: data ?? [] };
  }, [data, lang]);
}

export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} · Swacchify` : "Swacchify";
  }, [title]);
}
