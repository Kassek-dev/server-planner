import {
  type ColumnDef,
  columnFilteringFeature,
  createFilteredRowModel,
  createSortedRowModel,
  filterFn_includesString,
  globalFilteringFeature,
  type RowData,
  rowSortingFeature,
  type SortingState,
  sortFn_alphanumeric,
  sortFn_basic,
  tableFeatures,
  useTable,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { Fragment, useState } from 'react';

/** Table features shared by every data table (sorting + text search) — stable at module scope. */
export const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, basic: sortFn_basic },
  columnFilteringFeature,
  globalFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  filterFns: { includesString: filterFn_includesString },
});

/** Columns of mixed value types — `any` is TanStack's own convention for heterogeneous columns. */
// biome-ignore lint/suspicious/noExplicitAny: column value types differ per column
export type Column<T extends RowData> = ColumnDef<typeof features, T, any>;

/**
 * Data table (docs/05 § 9): sortable headers (`aria-sort`), text search, optional grouping rows,
 * selected row highlight. Row clicks select the element in the project.
 */
export function DataTable<T extends RowData>({
  label,
  rows,
  columns,
  rowId,
  query,
  selectedId,
  onSelect,
  groupOf,
  empty,
}: {
  label: string;
  rows: T[];
  columns: Column<T>[];
  rowId: (row: T) => string;
  query: string;
  selectedId?: string | undefined;
  onSelect?: (row: T) => void;
  /** Group label per row (rows are kept in group order). */
  groupOf?: (row: T) => string;
  empty: string;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const table = useTable({
    features,
    columns,
    data: rows,
    getRowId: (row) => rowId(row),
    state: { sorting, globalFilter: query },
    onSortingChange: setSorting,
    globalFilterFn: 'includesString',
  });
  const visible = table.getRowModel().rows;
  const grouped = groupOf
    ? [...visible].sort((a, b) => groupOf(a.original).localeCompare(groupOf(b.original)))
    : visible;
  const span = table.getAllLeafColumns().length;

  return (
    <table aria-label={label} className="w-full border-collapse text-left">
      <thead className="sticky top-0 z-1 bg-app">
        {table.getHeaderGroups().map((group) => (
          <tr key={group.id}>
            {group.headers.map((header) => {
              const sorted = header.column.getIsSorted();
              return (
                <th
                  key={header.id}
                  aria-sort={
                    sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none'
                  }
                  className="border-b border-border-default px-3 py-2 font-mono text-label font-semibold tracking-[0.08em] whitespace-nowrap text-text-secondary uppercase"
                >
                  {header.isPlaceholder ? null : header.column.getCanSort() ? (
                    <button
                      type="button"
                      onClick={header.column.getToggleSortingHandler()}
                      className="flex items-center gap-1 uppercase hover:text-text-primary"
                    >
                      <table.FlexRender header={header} />
                      {sorted === 'asc' ? <ArrowUp size={12} aria-hidden="true" /> : null}
                      {sorted === 'desc' ? <ArrowDown size={12} aria-hidden="true" /> : null}
                    </button>
                  ) : (
                    <table.FlexRender header={header} />
                  )}
                </th>
              );
            })}
          </tr>
        ))}
      </thead>
      <tbody>
        {grouped.length === 0 ? (
          <tr>
            <td colSpan={span} className="px-3 py-6 text-text-secondary">
              {empty}
            </td>
          </tr>
        ) : null}
        {grouped.map((row, index) => {
          const group = groupOf?.(row.original);
          const previous =
            index > 0 ? groupOf?.((grouped[index - 1] as typeof row).original) : undefined;
          const selected = row.id === selectedId;
          return (
            <Fragment key={row.id}>
              {groupOf && (index === 0 || group !== previous) ? (
                <tr>
                  <th
                    colSpan={span}
                    scope="colgroup"
                    className="bg-panel px-3 pt-4 pb-1.5 text-left font-mono text-label font-semibold tracking-[0.08em] text-text-muted uppercase"
                  >
                    {group}
                  </th>
                </tr>
              ) : null}
              <tr
                aria-selected={selected}
                onClick={() => onSelect?.(row.original)}
                className={`border-b border-border-subtle ${selected ? 'bg-accent-subtle' : 'hover:bg-tile'} ${onSelect ? 'cursor-pointer' : ''}`}
              >
                {row.getAllCells().map((cell) => (
                  <td key={cell.id} className="px-3 py-1.5 align-middle whitespace-nowrap">
                    <table.FlexRender cell={cell} />
                  </td>
                ))}
              </tr>
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}
