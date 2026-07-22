// components/schema/SchemaMap.tsx
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { getCompanyId } from "@/lib/services/schemaService";
import { useCustomTables } from "@/lib/hooks/useCustomTables";
import { Loader2, ZoomIn, ZoomOut, Maximize2, RefreshCw } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────

interface FieldRow {
  id: string;
  label: string;
  fieldType: string;
  isPrimary: boolean;
  isFK: boolean;
  linkedTableId?: string;
  linkedSystemTable?: string;
  isCustom: boolean;
}

interface TableBox {
  id: string;
  name: string;
  color: string;
  isSystem: boolean;
  fields: FieldRow[];
  x: number;
  y: number;
}

interface RelationLine {
  fromTableId: string;
  toTableId: string;
  fromColor: string;
  label: string;
}

// ── Constants ──────────────────────────────────────────────────────

const BOX_WIDTH = 260;
const HEADER_HEIGHT = 52;
const FIELD_HEIGHT = 30;
const BOX_FOOTER = 12;
const COLS = 3;
const COL_GAP = 340;
const ROW_GAP = 80;

const SYSTEM_TABLE_COLORS: Record<string, string> = {
  properties: '#6366f1',
  entities:   '#8b5cf6',
  projects:   '#ec4899',
};

const FIELD_TYPE_COLORS: Record<string, string> = {
  text:           '#64748b',
  number:         '#8b5cf6',
  date:           '#f97316',
  boolean:        '#22c55e',
  select:         '#eab308',
  email:          '#06b6d4',
  url:            '#14b8a6',
  currency:       '#10b981',
  auto_id:        '#ef4444',
  property:       '#6366f1',
  entity:         '#8b5cf6',
  project:        '#ec4899',
  table_relation: '#94a3b8',
  link:           '#6366f1',
  uuid:           '#94a3b8',
  relation:       '#6366f1',
};

// FK columns that should never generate relation lines —
// they point to tables not in the schema map
const SKIP_FK_COLUMNS = new Set([
  'created_by', 'team_id', 'approved_by', 'used_by',
  'import_id', 'active_company_id', 'company_id',
]);

function mapPgType(dataType: string): string {
  switch (dataType) {
    case 'boolean': return 'boolean';
    case 'date':
    case 'timestamp with time zone':
    case 'timestamp without time zone': return 'date';
    case 'numeric': case 'integer': case 'bigint': return 'number';
    case 'uuid': return 'uuid';
    default: return 'text';
  }
}

function boxHeight(fields: FieldRow[]): number {
  return HEADER_HEIGHT + fields.length * FIELD_HEIGHT + BOX_FOOTER;
}

function getInitialPos(idx: number): { x: number; y: number } {
  const col = idx % COLS;
  const row = Math.floor(idx / COLS);
  return {
    x: 40 + col * COL_GAP,
    y: 40 + row * (HEADER_HEIGHT + 12 * FIELD_HEIGHT + BOX_FOOTER + ROW_GAP),
  };
}

// ── Main component ─────────────────────────────────────────────────

export default function SchemaMap() {
  const { tables: customTables, loading: tablesLoading } = useCustomTables();
  const [boxes, setBoxes] = useState<TableBox[]>([]);
  const [relations, setRelations] = useState<RelationLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState(0.7);
  const [pan, setPan] = useState({ x: 40, y: 40 });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const dragState = useRef<{
    type: 'box' | 'pan';
    boxId?: string;
    startMouseX: number;
    startMouseY: number;
    startValueX: number;
    startValueY: number;
  } | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!tablesLoading) loadSchema();
  }, [tablesLoading, customTables]);

  // ── Global mouse handlers ──────────────────────────────────────

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragState.current) return;
    const dx = e.clientX - dragState.current.startMouseX;
    const dy = e.clientY - dragState.current.startMouseY;

    if (dragState.current.type === 'pan') {
      setPan({
        x: dragState.current.startValueX + dx,
        y: dragState.current.startValueY + dy,
      });
    } else if (dragState.current.type === 'box' && dragState.current.boxId) {
      const id = dragState.current.boxId;
      setBoxes(prev => prev.map(b =>
        b.id === id
          ? {
              ...b,
              x: dragState.current!.startValueX + dx / zoom,
              y: dragState.current!.startValueY + dy / zoom,
            }
          : b
      ));
    }
  }, [zoom]);

  const handleMouseUp = useCallback(() => {
    dragState.current = null;
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  // ── Load schema ────────────────────────────────────────────────

  const loadSchema = async () => {
    setLoading(true);
    const companyId = await getCompanyId();
    const systemTables = ['properties', 'entities', 'projects'];

    const [schemaResults, { data: sysCustomFields }, ...customTableFieldResults] =
      await Promise.all([
        Promise.all(
          systemTables.map(t =>
            supabase.rpc('get_schema_metadata', {
              target_table: t,
              p_company_id: companyId,
            })
          )
        ),
        supabase
          .from('company_custom_fields')
          .select('*')
          .is('deleted_at', null)
          .order('display_order'),
        ...customTables.map(t =>
          supabase
            .from('company_table_fields')
            .select('*')
            .eq('table_id', t.id)
            .is('deleted_at', null)
            .order('display_order')
        ),
      ]);

    const newBoxes: TableBox[] = [];
    const newRelations: RelationLine[] = [];
    const seenRelations = new Set<string>();

    // All known table IDs — only draw lines between these
    const knownTableIds = new Set([
      ...systemTables,
      ...customTables.map(t => t.id),
    ]);

    let boxIdx = 0;

    // ── System tables ──────────────────────────────────────────

    systemTables.forEach((tableName, i) => {
      const schemaCols = schemaResults[i].data || [];
      const tableCustomFields = (sysCustomFields || []).filter(
        f => f.table_name === tableName
      );

      const fields: FieldRow[] = [
        // System columns from schema metadata
        ...schemaCols
          .filter((c: any) => ['data', 'relation', 'identity'].includes(c.category))
          .filter((c: any) => !SKIP_FK_COLUMNS.has(c.column_name))
          .map((c: any) => ({
            id: c.column_name,
            label: c.label || c.column_name.replace(/_/g, ' '),
            fieldType: c.category === 'relation' ? 'relation' : mapPgType(c.data_type),
            isPrimary: c.category === 'identity',
            isFK: c.category === 'relation',
            linkedSystemTable: c.relation_table || undefined,
            isCustom: false,
          })),
        // Company custom fields on this system table
        ...tableCustomFields.map((f: any) => ({
          id: f.id,
          label: f.label,
          fieldType: f.field_type,
          isPrimary: false,
          isFK: ['property', 'entity', 'project', 'link', 'table_relation'].includes(f.field_type),
          linkedSystemTable:
            f.field_type === 'property' ? 'properties'
            : f.field_type === 'entity' ? 'entities'
            : f.field_type === 'project' ? 'projects'
            : f.linked_table || undefined,
          linkedTableId: f.linked_table_id || undefined,
          isCustom: true,
        })),
      ];

      // Extract deduplicated relation lines — only to known tables
      fields
        .filter(f => f.isFK && !SKIP_FK_COLUMNS.has(f.id))
        .forEach(f => {
          const toId = f.linkedSystemTable || f.linkedTableId;
          if (!toId || toId === tableName || !knownTableIds.has(toId)) return;
          const key = [tableName, toId].sort().join('::');
          if (seenRelations.has(key)) return;
          seenRelations.add(key);
          newRelations.push({
            fromTableId: tableName,
            toTableId: toId,
            fromColor: SYSTEM_TABLE_COLORS[tableName],
            label: f.label,
          });
        });

      const pos = getInitialPos(boxIdx++);
      newBoxes.push({
        id: tableName,
        name: tableName.charAt(0).toUpperCase() + tableName.slice(1),
        color: SYSTEM_TABLE_COLORS[tableName],
        isSystem: true,
        fields,
        x: pos.x,
        y: pos.y,
      });
    });

    // ── Custom tables ──────────────────────────────────────────

    customTables.forEach((table, i) => {
      const tableFields = (customTableFieldResults[i] as any)?.data || [];

      const fields: FieldRow[] = tableFields.map((f: any) => ({
        id: f.id,
        label: f.label,
        fieldType: f.field_type,
        isPrimary: false,
        isFK: ['property', 'entity', 'project', 'table_relation', 'link'].includes(f.field_type),
        linkedTableId: f.linked_table_id || undefined,
        linkedSystemTable: f.linked_system_table || undefined,
        isCustom: true,
      }));

      fields
        .filter(f => f.isFK)
        .forEach(f => {
          const toId = f.linkedSystemTable || f.linkedTableId;
          if (!toId || toId === table.id || !knownTableIds.has(toId)) return;
          const key = [table.id, toId].sort().join('::');
          if (seenRelations.has(key)) return;
          seenRelations.add(key);
          newRelations.push({
            fromTableId: table.id,
            toTableId: toId,
            fromColor: table.color,
            label: f.label,
          });
        });

      const pos = getInitialPos(boxIdx++);
      newBoxes.push({
        id: table.id,
        name: table.name,
        color: table.color,
        isSystem: false,
        fields,
        x: pos.x,
        y: pos.y,
      });
    });

    setBoxes(newBoxes);
    setRelations(newRelations);
    setLoading(false);
  };

  // ── Draw relation line ─────────────────────────────────────────

  const drawLine = (rel: RelationLine, idx: number) => {
    const from = boxes.find(b => b.id === rel.fromTableId);
    const to = boxes.find(b => b.id === rel.toTableId);
    if (!from || !to || from.id === to.id) return null;

    const fh = boxHeight(from.fields);
    const th = boxHeight(to.fields);

    const fromCenterX = from.x + BOX_WIDTH / 2;
    const toCenterX = to.x + BOX_WIDTH / 2;

    let fx: number, tx: number;
    if (fromCenterX <= toCenterX) {
      fx = from.x + BOX_WIDTH;
      tx = to.x;
    } else {
      fx = from.x;
      tx = to.x + BOX_WIDTH;
    }

    // Stagger vertical attachment points slightly per relation
    // to avoid all lines connecting at the same Y
    const stagger = (idx % 3) * (FIELD_HEIGHT * 0.8);
    const fy = from.y + HEADER_HEIGHT + Math.min(stagger, fh * 0.6);
    const ty = to.y + HEADER_HEIGHT + Math.min(stagger, th * 0.6);

    const offset = Math.max(50, Math.abs(tx - fx) * 0.35);
    const cpfx = fx + (fromCenterX <= toCenterX ? offset : -offset);
    const cptx = tx + (fromCenterX <= toCenterX ? -offset : offset);

    const color = rel.fromColor;

    return (
      <g key={`rel-${idx}-${rel.fromTableId}-${rel.toTableId}`}>
        <path
          d={`M ${fx} ${fy} C ${cpfx} ${fy}, ${cptx} ${ty}, ${tx} ${ty}`}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeDasharray="5 4"
          strokeOpacity={0.55}
        />
        {/* Source dot */}
        <circle cx={fx} cy={fy} r={4} fill={color} fillOpacity={0.8} />
        {/* Target arrow dot */}
        <circle cx={tx} cy={ty} r={4} fill="white" stroke={color} strokeWidth={2} />
      </g>
    );
  };

  // ── Wheel zoom ─────────────────────────────────────────────────

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.92 : 1.08;
    setZoom(z => Math.min(2.5, Math.max(0.2, z * factor)));
  };

  if (loading) return (
    <div className="flex items-center justify-center h-96">
      <Loader2 className="animate-spin text-slate-300" size={24} />
    </div>
  );

  return (
    <div className="flex flex-col h-full min-h-0">

      {/* Toolbar */}
      <div className="flex items-center gap-2 mb-3 shrink-0">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex-1">
          Schema · {boxes.length} tables · {relations.length} relations ·
          drag tables to arrange · scroll to zoom
        </p>
        <button
          onClick={() => setZoom(z => Math.min(2.5, z + 0.1))}
          className="p-2 bg-slate-100 rounded-lg hover:bg-slate-200 text-slate-600 transition-all"
          title="Zoom in"
        >
          <ZoomIn size={14} />
        </button>
        <button
          onClick={() => setZoom(z => Math.max(0.2, z - 0.1))}
          className="p-2 bg-slate-100 rounded-lg hover:bg-slate-200 text-slate-600 transition-all"
          title="Zoom out"
        >
          <ZoomOut size={14} />
        </button>
        <button
          onClick={() => { setZoom(0.7); setPan({ x: 40, y: 40 }); }}
          className="p-2 bg-slate-100 rounded-lg hover:bg-slate-200 text-slate-600 transition-all"
          title="Reset view"
        >
          <Maximize2 size={14} />
        </button>
        <button
          onClick={loadSchema}
          className="p-2 bg-slate-100 rounded-lg hover:bg-slate-200 text-slate-600 transition-all"
          title="Refresh"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Canvas */}
      <div
        className="flex-1 overflow-hidden border border-slate-200 rounded-2xl bg-slate-50/30 relative"
        onWheel={handleWheel}
      >
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          onMouseDown={e => {
            const target = e.target as Element;
            const isCanvas =
              target === svgRef.current ||
              target.classList.contains('canvas-bg') ||
              target.tagName === 'defs' ||
              (target.tagName === 'rect' && target.getAttribute('class') === 'canvas-bg');
            if (isCanvas) {
              dragState.current = {
                type: 'pan',
                startMouseX: e.clientX,
                startMouseY: e.clientY,
                startValueX: pan.x,
                startValueY: pan.y,
              };
              setSelectedId(null);
            }
          }}
          style={{ userSelect: 'none', cursor: 'default' }}
        >
          {/* Dot grid */}
          <defs>
            <pattern id="dots" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="1" fill="#cbd5e1" opacity="0.5" />
            </pattern>
          </defs>
          <rect
            className="canvas-bg"
            width="100%"
            height="100%"
            fill="url(#dots)"
            style={{ cursor: 'grab' }}
          />

          <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>

            {/* Relation lines behind boxes */}
            {relations.map((rel, i) => drawLine(rel, i))}

            {/* Table boxes */}
            {boxes.map(box => {
              const bh = boxHeight(box.fields);
              const isSelected = selectedId === box.id;

              return (
                <g
                  key={box.id}
                  transform={`translate(${box.x}, ${box.y})`}
                  onMouseDown={e => {
                    e.stopPropagation();
                    setSelectedId(box.id);
                    dragState.current = {
                      type: 'box',
                      boxId: box.id,
                      startMouseX: e.clientX,
                      startMouseY: e.clientY,
                      startValueX: box.x,
                      startValueY: box.y,
                    };
                  }}
                  style={{ cursor: 'grab' }}
                >
                  {/* Drop shadow */}
                  <rect
                    x={3} y={4}
                    width={BOX_WIDTH}
                    height={bh}
                    rx={14}
                    fill="rgba(0,0,0,0.06)"
                  />

                  {/* Box body */}
                  <rect
                    width={BOX_WIDTH}
                    height={bh}
                    rx={14}
                    fill="white"
                    stroke={isSelected ? box.color : '#e2e8f0'}
                    strokeWidth={isSelected ? 2.5 : 1}
                  />

                  {/* Header fill — full top + square bottom to avoid gap */}
                  <rect
                    width={BOX_WIDTH}
                    height={HEADER_HEIGHT + 8}
                    rx={14}
                    fill={box.color}
                  />
                  <rect
                    y={HEADER_HEIGHT}
                    width={BOX_WIDTH}
                    height={8}
                    fill={box.color}
                  />

                  {/* Table name */}
                  <text
                    x={16} y={27}
                    fontSize={13}
                    fontWeight="700"
                    fill="white"
                    fontFamily="system-ui, -apple-system, sans-serif"
                  >
                    {box.name}
                  </text>

                  {/* Subtitle */}
                  <text
                    x={16} y={43}
                    fontSize={9}
                    fill="rgba(255,255,255,0.65)"
                    fontFamily="system-ui, -apple-system, sans-serif"
                    style={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}
                  >
                    {box.isSystem ? 'System' : 'Custom'} · {box.fields.length} fields
                  </text>

                  {/* Header / body divider */}
                  <line
                    x1={0} y1={HEADER_HEIGHT}
                    x2={BOX_WIDTH} y2={HEADER_HEIGHT}
                    stroke="#f1f5f9"
                    strokeWidth={1}
                  />

                  {/* Fields */}
                  {box.fields.map((field, idx) => {
                    const fy = HEADER_HEIGHT + idx * FIELD_HEIGHT;
                    const typeColor = FIELD_TYPE_COLORS[field.fieldType] || '#64748b';
                    const isLast = idx === box.fields.length - 1;

                    return (
                      <g key={field.id}>
                        {/* Row separator */}
                        {!isLast && (
                          <line
                            x1={0} y1={fy + FIELD_HEIGHT}
                            x2={BOX_WIDTH} y2={fy + FIELD_HEIGHT}
                            stroke="#f8fafc"
                            strokeWidth={1}
                          />
                        )}

                        {/* Left accent bar */}
                        {(field.isPrimary || field.isFK || field.isCustom) && (
                          <rect
                            x={0} y={fy + 5}
                            width={3}
                            height={FIELD_HEIGHT - 10}
                            fill={
                              field.isPrimary ? box.color
                              : field.isFK ? '#f97316'
                              : '#a78bfa'
                            }
                            rx={1.5}
                          />
                        )}

                        {/* Type dot */}
                        <circle
                          cx={18}
                          cy={fy + FIELD_HEIGHT / 2}
                          r={5}
                          fill={typeColor + '22'}
                          stroke={typeColor}
                          strokeWidth={1.5}
                        />

                        {/* Field label */}
                        <text
                          x={30}
                          y={fy + FIELD_HEIGHT / 2 + 4}
                          fontSize={11}
                          fill={field.isPrimary ? '#0f172a' : '#475569'}
                          fontWeight={field.isPrimary ? '700' : '400'}
                          fontFamily="system-ui, -apple-system, sans-serif"
                        >
                          {field.label.length > 22
                            ? field.label.slice(0, 22) + '…'
                            : field.label}
                        </text>

                        {/* Custom badge */}
                        {field.isCustom && (
                          <text
                            x={BOX_WIDTH - 52}
                            y={fy + FIELD_HEIGHT / 2 + 4}
                            fontSize={8}
                            fill="#a78bfa"
                            fontFamily="system-ui, -apple-system, sans-serif"
                            style={{ letterSpacing: '0.04em' }}
                          >
                            CUSTOM
                          </text>
                        )}

                        {/* Field type — right aligned */}
                        {!field.isCustom && (
                          <text
                            x={BOX_WIDTH - 10}
                            y={fy + FIELD_HEIGHT / 2 + 4}
                            fontSize={9}
                            fill={typeColor}
                            fontFamily="'Menlo','Monaco',monospace"
                            textAnchor="end"
                          >
                            {field.fieldType}
                          </text>
                        )}
                      </g>
                    );
                  })}

                  {/* Bottom rounded cap */}
                  <rect
                    y={bh - BOX_FOOTER}
                    width={BOX_WIDTH}
                    height={BOX_FOOTER + 1}
                    rx={14}
                    fill="white"
                  />
                </g>
              );
            })}
          </g>
        </svg>

        {/* Zoom level */}
        <div className="absolute bottom-3 right-3 px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-400 shadow-sm pointer-events-none">
          {Math.round(zoom * 100)}%
        </div>

        {/* Empty state */}
        {boxes.length === 0 && !loading && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-slate-300 text-[11px] font-bold uppercase tracking-widest">
              No tables found
            </p>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-5 mt-3 shrink-0 flex-wrap">
        {[
          { color: '#6366f1', label: 'System table' },
          { color: '#a78bfa', label: 'Custom table / field' },
          { color: '#f97316', label: 'Foreign key field' },
        ].map(l => (
          <div key={l.label} className="flex items-center gap-1.5">
            <div
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: l.color, opacity: 0.75 }}
            />
            <span className="text-[10px] text-slate-400 font-medium">{l.label}</span>
          </div>
        ))}
        <div className="ml-auto flex items-center gap-1.5">
          <svg width="24" height="8">
            <line
              x1="0" y1="4" x2="24" y2="4"
              stroke="#94a3b8"
              strokeWidth="1.5"
              strokeDasharray="4 3"
            />
          </svg>
          <span className="text-[10px] text-slate-400 font-medium">Relation</span>
        </div>
      </div>
    </div>
  );
}