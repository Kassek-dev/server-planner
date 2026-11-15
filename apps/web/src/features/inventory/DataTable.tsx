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
import { useIsMobile } from '../../app/useIsMobile';

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
 * selected row highlight. Row clicks select the element in the project. On phones (M-05) every row
 * is a card: the first column is its title, the others label: value pairs.
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
  const mobile = useIsMobile();

  if (mobile) {
    const headers = new Map(table.getFlatHeaders().map((h) => [h.column.id, h]));
    return (
      <ul aria-label={label} className="m-0 flex list-none flex-col gap-2 px-4 py-2">
        {grouped.length === 0 ? <li className="py-6 text-text-secondary">{empty}</li> : null}
        {grouped.map((row, index) => {
          const group = groupOf?.(row.original);
          const previous =
            index > 0 ? groupOf?.((grouped[index - 1] as typeof row).original) : undefined;
          const [first, ...rest] = row.getAllCells();
          return (
            <Fragment key={row.id}>
              {groupOf && (index === 0 || group !== previous) ? (
                <li className="pt-2 font-mono text-label font-semibold tracking-[0.08em] text-text-muted uppercase">
                  {group}
                </li>
              ) : null}
              {/* biome-ignore lint/a11y/useKeyWithClickEvents: like a table row — the name cell and the canvas are the keyboard paths */}
              <li
                aria-current={row.id === selectedId ? 'true' : undefined}
                onClick={() => onSelect?.(row.original)}
                className={`flex flex-col gap-1.5 rounded-md border p-3 ${row.id === selectedId ? 'border-selection bg-accent-subtle' : 'border-border-subtle bg-panel'}`}
              >
                {first ? (
                  <div className="min-h-11 font-semibold">
                    <table.FlexRender cell={first} />
                  </div>
                ) : null}
                <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                  {rest.map((cell) => {
                    const header = headers.get(cell.column.id);
                    return (
                      <Fragment key={cell.id}>
                        <dt className="font-mono text-label tracking-[0.08em] text-text-secondary uppercase">
                          {header ? <table.FlexRender header={header} /> : null}
                        </dt>
                        <dd className="m-0 min-w-0">
                          <table.FlexRender cell={cell} />
                        </dd>
                      </Fragment>
                    );
                  })}
                </dl>
              </li>
            </Fragment>
          );
        })}
      </ul>
    );
  }

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
