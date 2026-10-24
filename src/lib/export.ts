function csvCell(v: string | number) {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function captionsCsv(parts: { part_number: number; title: string; caption: string; hashtags: string[] }[]) {
  const rows = [["part_number", "title", "caption", "hashtags"], ...parts.map((p) => [p.part_number, p.title, p.caption, p.hashtags.join(" ")])];
  return `\uFEFF${rows.map((r) => r.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
