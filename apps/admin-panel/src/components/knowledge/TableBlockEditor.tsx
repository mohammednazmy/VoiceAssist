/**
 * TableBlockEditor - Edit table content blocks
 *
 * Provides a spreadsheet-like interface for editing table headers and rows.
 */

import type { ContentBlock } from "../../hooks/usePageContent";

interface TableBlockEditorProps {
  block: ContentBlock;
  onChange: (block: ContentBlock) => void;
  disabled?: boolean;
}

export function TableBlockEditor({
  block,
  onChange,
  disabled = false,
}: TableBlockEditorProps) {
  const headers = block.headers || [];
  const rows = block.rows || [];

  const handleHeaderChange = (index: number, value: string) => {
    const newHeaders = [...headers];
    newHeaders[index] = value;
    onChange({ ...block, headers: newHeaders });
  };

  const handleCellChange = (rowIndex: number, cellIndex: number, value: string) => {
    const newRows = rows.map((row, rIdx) =>
      rIdx === rowIndex
        ? row.map((cell, cIdx) => (cIdx === cellIndex ? value : cell))
        : row
    );
    onChange({ ...block, rows: newRows });
  };

  const handleCaptionChange = (value: string) => {
    onChange({ ...block, caption: value });
  };

  const addRow = () => {
    const newRow = headers.map(() => "");
    onChange({ ...block, rows: [...rows, newRow] });
  };

  const removeRow = (index: number) => {
    const newRows = rows.filter((_, i) => i !== index);
    onChange({ ...block, rows: newRows });
  };

  const addColumn = () => {
    const newHeaders = [...headers, `Column ${headers.length + 1}`];
    const newRows = rows.map((row) => [...row, ""]);
    onChange({ ...block, headers: newHeaders, rows: newRows });
  };

  const removeColumn = (index: number) => {
    const newHeaders = headers.filter((_, i) => i !== index);
    const newRows = rows.map((row) => row.filter((_, i) => i !== index));
    onChange({ ...block, headers: newHeaders, rows: newRows });
  };

  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2 bg-slate-800 border-b border-slate-700">
        <svg
          className="h-4 w-4 text-cyan-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
          />
        </svg>
        <span className="text-sm font-medium text-slate-200">Table</span>
        <span className="text-xs text-slate-500">
          ({headers.length} cols, {rows.length} rows)
        </span>
      </div>

      {/* Caption */}
      <div className="px-4 py-3 border-b border-slate-700">
        <label className="block text-xs text-slate-500 mb-1">Caption</label>
        <input
          type="text"
          value={block.caption || ""}
          onChange={(e) => handleCaptionChange(e.target.value)}
          disabled={disabled}
          placeholder="Table caption..."
          className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 disabled:opacity-50"
        />
      </div>

      {/* Table */}
      <div className="p-4 overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {headers.map((header, i) => (
                <th key={i} className="relative group">
                  <input
                    type="text"
                    value={header}
                    onChange={(e) => handleHeaderChange(i, e.target.value)}
                    disabled={disabled}
                    className="w-full bg-slate-700 border border-slate-600 px-2 py-1.5 text-sm font-medium text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500 disabled:opacity-50"
                  />
                  {!disabled && headers.length > 1 && (
                    <button
                      onClick={() => removeColumn(i)}
                      className="absolute -top-2 -right-2 hidden group-hover:flex items-center justify-center h-5 w-5 bg-rose-600 text-white rounded-full text-xs hover:bg-rose-500"
                      title="Remove column"
                    >
                      &times;
                    </button>
                  )}
                </th>
              ))}
              {!disabled && (
                <th className="w-8">
                  <button
                    onClick={addColumn}
                    className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded"
                    title="Add column"
                  >
                    +
                  </button>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="group">
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex}>
                    <input
                      type="text"
                      value={cell}
                      onChange={(e) =>
                        handleCellChange(rowIndex, cellIndex, e.target.value)
                      }
                      disabled={disabled}
                      className="w-full bg-slate-900 border border-slate-700 px-2 py-1.5 text-sm text-slate-300 focus:outline-none focus:ring-1 focus:ring-cyan-500 disabled:opacity-50"
                    />
                  </td>
                ))}
                {!disabled && (
                  <td className="w-8">
                    <button
                      onClick={() => removeRow(rowIndex)}
                      className="w-8 h-8 hidden group-hover:flex items-center justify-center text-rose-400 hover:text-rose-300 hover:bg-rose-900/30 rounded"
                      title="Remove row"
                    >
                      &times;
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>

        {!disabled && (
          <button
            onClick={addRow}
            className="mt-2 px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded transition-colors"
          >
            + Add Row
          </button>
        )}
      </div>
    </div>
  );
}
