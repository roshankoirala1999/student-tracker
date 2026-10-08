export interface RecordReport {
  kind: "attendance" | "marks";
  title: string;
  subtitle: string;
  headers: string[];
  rows: (string | number)[][];
  generatedAt: string;
}
