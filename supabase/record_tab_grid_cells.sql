CREATE TABLE IF NOT EXISTS record_tab_grid_cells (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tab_id uuid NOT NULL REFERENCES record_tabs(id) ON DELETE CASCADE,
  row_start int NOT NULL,
  col_start int NOT NULL,
  row_span int NOT NULL DEFAULT 1,
  col_span int NOT NULL DEFAULT 1,
  cell_type text NOT NULL CHECK (cell_type IN ('static', 'field')),
  content text,
  field_id uuid REFERENCES company_table_fields(id) ON DELETE SET NULL,
  display_order int NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS record_tab_grid_cells_tab_id_idx ON record_tab_grid_cells(tab_id);

ALTER TABLE record_tab_grid_cells ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS record_tab_grid_cells_company_members ON record_tab_grid_cells;
CREATE POLICY record_tab_grid_cells_company_members ON record_tab_grid_cells
  FOR ALL
  USING (tab_id IN (SELECT id FROM record_tabs WHERE company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid())))
  WITH CHECK (tab_id IN (SELECT id FROM record_tabs WHERE company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid())));
