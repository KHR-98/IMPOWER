interface Department {
  id: string;
  name: string;
}

const ExcelExportIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M7 3.5h7.2L19 8.3v12.2H7z" />
    <path d="M14 3.5v5h5" />
    <path d="M4 8.5h8v8H4z" />
    <path d="m6.2 10.5 3.6 4" />
    <path d="m9.8 10.5-3.6 4" />
  </svg>
);

export function AdminExportPanel({ departments }: { departments: Department[] }) {
  const links = [
    { id: null, name: "전체" },
    ...departments.map((d) => ({ id: d.id, name: d.name })),
  ];

  return (
    <details className="admin-export-actions brand-export-actions">
      <summary className="admin-export-trigger" aria-label="엑셀 다운로드" title="엑셀 다운로드">
        <span className="admin-export-icon">
          <ExcelExportIcon />
        </span>
      </summary>
      <div className="admin-export-options" aria-label="출결 엑셀 다운로드">
        {links.map((link) => (
          <a
            key={link.id ?? "all"}
            className="admin-export-link"
            href={`/api/admin/attendance-export${link.id ? `?departmentId=${encodeURIComponent(link.id)}` : ""}`}
            download
          >
            {link.name}
          </a>
        ))}
      </div>
    </details>
  );
}
