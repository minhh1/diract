import { supabase } from "../supabase";

export const preferenceService = {
  /**
   * Fetch all saved presets for a given user + table.
   * Ordered alphabetically by preset_name for stable display in ViewPresets.
   */
  async getByTable(user_id: string, table_slug: string) {
    const { data, error } = await supabase
      .from("user_column_preferences")
      .select("*")
      .eq("user_id", user_id)
      .eq("table_slug", table_slug)
      .order('preset_name', { ascending: true });

    if (error) {
      console.error("preferenceService.getByTable error:", {
        message: error.message, code: error.code, details: error.details, hint: error.hint,
      });
      return [];
    }
    return data || [];
  },

  /**
   * Create or update a preset's columns/layout/relations.
   *
   * Activation is handled entirely by the DB:
   *   - a partial unique index on (user_id, table_slug) WHERE is_active
   *   - an AFTER trigger that deactivates sibling rows whenever a row is
   *     written with is_active = true
   * So this function does not need to manually deactivate other rows
   * before upserting — Postgres guarantees at most one active preset per
   * (user_id, table_slug) atomically, even under concurrent writes from
   * multiple tabs/devices.
   *
   * Defaults to is_active: true, since saving a view's columns/layout
   * almost always means "and make this the one I'm looking at now."
   * Pass is_active: false explicitly if you ever need to save a preset
   * without switching to it.
   */
  async save(payload: {
    user_id: string;
    table_slug: string;
    preset_name: string;
    columns: string[];
    expansion_columns?: string[];
    column_widths?: Record<string, number>;
    expand_relations?: string[];
    is_active?: boolean;
  }) {
    const isActive = payload.is_active ?? true;

    const { data, error } = await supabase
      .from("user_column_preferences")
      .upsert(
        { ...payload, is_active: isActive },
        { onConflict: 'user_id,table_slug,preset_name' }
      )
      .select()
      .single();

    if (error) {
      console.error("preferenceService.save error:", {
        message: error.message, code: error.code, details: error.details, hint: error.hint,
      });
    }

    return { data, error };
  },

  /**
   * Switch the active preset WITHOUT touching its stored columns/layout.
   * Use this when the user clicks an existing saved view in ViewPresets —
   * you want to flip which one is "active," not resave/overwrite its
   * column config with whatever happens to be in local state at that
   * moment.
   *
   * Implemented as a single set-based UPDATE via RPC so that deactivating
   * the previously-active row and activating the newly-selected row happen
   * as one atomic statement — this avoids the unique-index/trigger race
   * that occurs if siblings are deactivated and the target activated as
   * two separate statements.
   */
  async setActive(user_id: string, table_slug: string, preset_name: string) {
    const { data, error } = await supabase.rpc('set_active_preference', {
      p_user_id: user_id,
      p_table_slug: table_slug,
      p_preset_name: preset_name
    });

    if (error) {
      console.error("preferenceService.setActive error:", {
        message: error.message, code: error.code, details: error.details, hint: error.hint,
      });
    }

    return { data, error };
  },

  /**
   * Delete a saved preset. If the deleted preset was the active one,
   * the caller is responsible for picking a new active preset
   * (e.g. fall back to the first remaining preset, or "Default view")
   * since the DB won't auto-promote another row to active for you.
   */
  async remove(user_id: string, table_slug: string, preset_name: string) {
    const { error } = await supabase
      .from("user_column_preferences")
      .delete()
      .eq("user_id", user_id)
      .eq("table_slug", table_slug)
      .eq("preset_name", preset_name);

    if (error) {
      console.error("preferenceService.remove error:", {
        message: error.message, code: error.code, details: error.details, hint: error.hint,
      });
    }

    return { error };
  }
};