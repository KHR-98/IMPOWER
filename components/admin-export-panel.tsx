const ExcelExportIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M7 3.5h7.2L19 8.3v12.2H7z" />
    <path d="M14 3.5v5h5" />
    <path d="M4 8.5h8v8H4z" />
    <path d="m6.2 10.5 3.6 4" />
    <path d="m9.8 10.5-3.6 4" />
  </svg>
);

export function AdminExportPanel() {
  return (
    <a
      className="admin-export-trigger"
      href="/api/admin/attendance-export"
      download
      aria-label="엑셀 다운로드"
      title="엑셀 다운로드"
    >
      <span className="admin-export-icon">
        <ExcelExportIcon />
      </span>
    </a>
  );
}
