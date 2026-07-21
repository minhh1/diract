// lib/services/savedViewsService.ts
import { supabase } from "@/lib/supabase";
import type { ActiveFilter } from "@/lib/types/filters";

export interface SavedView {
  id: string;
  user_id: string;
  company_id: string;
  table_slug: string;
  view_name: string;
  filters: ActiveFilter[];
  created_at: string;
  updated_at: string;
}

// Reserved view name for the implicit, always-auto-saved filter slot used
// when the user hasn't created/selected a named view — lets filters persist
// without forcing anyone through the "name a view" flow first. Hidden from
// the Sidebar's saved-views list.
export const DEFAULT_VIEW_NAME = "__default__";

export const savedViewsService = {
  async getDefaultFilters(userId: string, companyId: string, tableSlug: string): Promise<ActiveFilter[]> {
    const { data, error } = await supabase
      .from("user_saved_views")
      .select("filters")
      .eq("user_id", userId)
      .eq("company_id", companyId)
      .eq("table_slug", tableSlug)
      .eq("view_name", DEFAULT_VIEW_NAME)
      .maybeSingle();
    if (error) {
      console.error("savedViewsService.getDefaultFilters error:", error);
      return [];
    }
    return data?.filters || [];
  },

  async saveDefaultFilters(userId: string, companyId: string, tableSlug: string, filters: ActiveFilter[]): Promise<void> {
    const { error } = await supabase
      .from("user_saved_views")
      .upsert({
        user_id: userId,
        company_id: companyId,
        table_slug: tableSlug,
        view_name: DEFAULT_VIEW_NAME,
        filters,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,company_id,table_slug,view_name" });
    if (error) console.error("savedViewsService.saveDefaultFilters error:", error);
  },
  async listByTable(userId: string, companyId: string, tableSlug: string): Promise<SavedView[]> {
    const { data, error } = await supabase
      .from("user_saved_views")
      .select("*")
      .eq("user_id", userId)
      .eq("company_id", companyId)
      .eq("table_slug", tableSlug)
      .order("view_name", { ascending: true });

    if (error) {
      console.error("savedViewsService.listByTable error:", error);
      return [];
    }
    return data || [];
  },

  async get(id: string): Promise<SavedView | null> {
    const { data, error } = await supabase
      .from("user_saved_views")
      .select("*")
      .eq("id", id)
      .single();
    if (error) return null;
    return data;
  },

  async create(payload: {
    user_id: string;
    company_id: string;
    table_slug: string;
    view_name: string;
    filters: ActiveFilter[];
  }): Promise<SavedView | null> {
    const { data, error } = await supabase
      .from("user_saved_views")
      .insert(payload)
      .select()
      .single();
    if (error) {
      console.error("savedViewsService.create error:", error);
      return null;
    }
    return data;
  },

  async updateFilters(id: string, filters: ActiveFilter[]): Promise<void> {
    const { error } = await supabase
      .from("user_saved_views")
      .update({ filters, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) console.error("savedViewsService.updateFilters error:", error);
  },

  async rename(id: string, view_name: string): Promise<void> {
    const { error } = await supabase
      .from("user_saved_views")
      .update({ view_name, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) console.error("savedViewsService.rename error:", error);
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase
      .from("user_saved_views")
      .delete()
      .eq("id", id);
    if (error) console.error("savedViewsService.remove error:", error);
  },
};
