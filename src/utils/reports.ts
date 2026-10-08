import { RecordReport } from "../types/reports.ts";
import { generateCsv, downloadCsvFile } from "./csv.ts";
export function exportReportCsv(report: RecordReport) {
  const safe = (value: string | number) =>
    typeof value === "string" && /^[=+@\-\t\r]/.test(value)
      ? `'${value}`
      : value;
  downloadCsvFile(
    `${report.kind}-report.csv`,
    generateCsv(
      report.headers,
      report.rows.map((row) => row.map(safe)),
    ),
  );
}
export async function exportReportPdf(report: RecordReport) {
  const [{ default: pdfMake }, { default: fonts }] = await Promise.all([
    import("pdfmake/build/pdfmake"),
    import("pdfmake/build/vfs_fonts"),
  ]);
  pdfMake.addVirtualFileSystem(fonts);
  const document: any = {
    pageSize: "A4",
    pageOrientation: "landscape",
    pageMargins: [28, 32, 28, 35],
    defaultStyle: { font: "Roboto", fontSize: 8, color: "#253e3a" },
    info: { title: report.title, author: "Student Tracker" },
    content: [
      {
        text: report.title,
        fontSize: 21,
        bold: true,
        color: "#168579",
        margin: [0, 0, 0, 5],
      },
      { text: report.subtitle, margin: [0, 0, 0, 5] },
      {
        text: `${report.rows.length} records · Generated ${new Date(report.generatedAt).toLocaleString()}`,
        fontSize: 8,
        color: "#6a7e79",
        margin: [0, 0, 0, 18],
      },
      {
        table: {
          headerRows: 1,
          widths: ["*", 35, "*", "*", "*", "*", 45, "*"],
          body: [
            report.headers.map((text) => ({
              text,
              bold: true,
              fillColor: "#168579",
              color: "white",
              margin: [2, 5],
            })),
            ...report.rows.map((row) =>
              row.map((cell) => ({ text: String(cell), margin: [2, 4] })),
            ),
          ],
        },
        layout: {
          hLineWidth: () => 0.4,
          vLineWidth: () => 0,
          hLineColor: () => "#dce6e1",
          fillColor: (i: number) => (i > 0 && i % 2 === 0 ? "#f2f7f5" : null),
        },
      },
    ],
    footer: (page: number, pages: number) => ({
      text: `Student Tracker  •  ${page} / ${pages}`,
      alignment: "right",
      margin: [28, 8],
      fontSize: 8,
      color: "#73867f",
    }),
  };
  const blob = await new Promise<Blob>((resolve) =>
    pdfMake.createPdf(document).getBlob(resolve),
  );
  const url = URL.createObjectURL(blob);
  const link = documentLink(url, `${report.kind}-report.pdf`);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function documentLink(url: string, name: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  return a;
}
