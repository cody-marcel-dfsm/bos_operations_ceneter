import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const requireFromWorkingDirectory = createRequire(
  path.join(process.cwd(), "artifact-tool-runner.cjs"),
);
const { SpreadsheetFile, Workbook } =
  requireFromWorkingDirectory("@oai/artifact-tool");

const [inputPath, requestedOutputPath] = process.argv.slice(2);
if (!inputPath) {
  throw new Error("Usage: build_bh_invoice.mjs <input.json> [output.xlsx]");
}

const input = JSON.parse(await fs.readFile(inputPath, "utf8"));
const requiredTop = [
  "date_submitted", "center_name", "address", "billing_contact_name",
  "phone_number", "invoice_reference_number", "period_start", "period_end", "rows",
];
for (const key of requiredTop) {
  if (input[key] === undefined || input[key] === null || input[key] === "") {
    throw new Error(`Missing required field: ${key}`);
  }
}
if (!Array.isArray(input.rows) || input.rows.length === 0) {
  throw new Error("rows must contain at least one invoice row");
}

const outputPath = requestedOutputPath || path.join(
  resolve(process.cwd(), "output", "invoices", "bright-horizons"),
  `BH_Invoice_${input.period_start}_to_${input.period_end}.xlsx`,
);

const requiredRow = [
  "employee_name", "employer", "case_number", "number_of_children",
  "date_of_care", "hours_of_care",
];
const configuredRatePerDay = 103;
const isoDate = /^\d{4}-\d{2}-\d{2}$/;
if (![input.date_submitted, input.period_start, input.period_end].every((v) => isoDate.test(v))) {
  throw new Error("Submission and period dates must use YYYY-MM-DD");
}

for (const [index, row] of input.rows.entries()) {
  for (const key of requiredRow) {
    if (row[key] === undefined || row[key] === null || row[key] === "") {
      throw new Error(`Row ${index + 1} missing required field: ${key}`);
    }
  }
  if (!isoDate.test(row.date_of_care)) {
    throw new Error(`Row ${index + 1} date_of_care must use YYYY-MM-DD`);
  }
  if (row.date_of_care < input.period_start || row.date_of_care > input.period_end) {
    throw new Error(`Row ${index + 1} date_of_care is outside the invoice period`);
  }
  if (!Number.isInteger(row.number_of_children) || row.number_of_children < 1) {
    throw new Error(`Row ${index + 1} number_of_children must be a positive integer`);
  }
  const ratePerDay = row.rate_per_day ?? configuredRatePerDay;
  if (!(Number(row.hours_of_care) > 0) || !(Number(ratePerDay) >= 0)) {
    throw new Error(`Row ${index + 1} hours/rate values are invalid`);
  }
}

const rows = [...input.rows].sort((a, b) =>
  a.employee_name.localeCompare(b.employee_name) ||
  a.employer.localeCompare(b.employer) ||
  a.case_number.localeCompare(b.case_number) ||
  a.date_of_care.localeCompare(b.date_of_care)
);

const excelDate = (iso) => new Date(`${iso}T12:00:00Z`);
const workbook = Workbook.create();
const sheet = workbook.worksheets.add("Invoice");
sheet.showGridLines = true;

sheet.getRange("A1:B6").values = [
  ["Date Submitted:", excelDate(input.date_submitted)],
  ["Center Name:", input.center_name],
  ["Address:", input.address],
  ["Billing Contact Name:", input.billing_contact_name],
  ["Phone Number:", String(input.phone_number)],
  ["Invoice Reference Number:", String(input.invoice_reference_number)],
];
sheet.getRange("A1:A6").format.font = { bold: true };
sheet.getRange("B1").format.numberFormat = "mm/dd/yy";

const headers = [
  "Employee Name", "Employer", "Case #", "# of Children", "Date of Care",
  "# of Hours of Care", "Rate per Day", "Amount", "Other Comments",
];
sheet.getRange("A8:I8").values = [headers];
sheet.getRange("A8:I8").format = {
  fill: "#B7DEE8",
  font: { bold: true, color: "#000000" },
  horizontalAlignment: "center",
  verticalAlignment: "center",
  wrapText: true,
  borders: { preset: "all", style: "medium", color: "#000000" },
};

const firstDataRow = 9;
const lastDataRow = firstDataRow + rows.length - 1;
sheet.getRange(`A${firstDataRow}:G${lastDataRow}`).values = rows.map((row) => [
  row.employee_name,
  row.employer,
  String(row.case_number),
  row.number_of_children,
  excelDate(row.date_of_care),
  Number(row.hours_of_care),
  Number(row.rate_per_day ?? configuredRatePerDay),
]);
sheet.getRange(`I${firstDataRow}:I${lastDataRow}`).values =
  rows.map((row) => [row.other_comments ?? ""]);
sheet.getRange(`H${firstDataRow}`).formulas = [[`=D${firstDataRow}*G${firstDataRow}`]];
if (lastDataRow > firstDataRow) {
  sheet.getRange(`H${firstDataRow}:H${lastDataRow}`).fillDown();
}

const detail = sheet.getRange(`A${firstDataRow}:I${lastDataRow}`);
detail.format.borders = { preset: "all", style: "thin", color: "#000000" };
detail.format.verticalAlignment = "center";
sheet.getRange(`C${firstDataRow}:C${lastDataRow}`).format.numberFormat = "@";
sheet.getRange(`D${firstDataRow}:D${lastDataRow}`).format.numberFormat = "0";
sheet.getRange(`E${firstDataRow}:E${lastDataRow}`).format.numberFormat = "mm/dd/yy";
sheet.getRange(`F${firstDataRow}:F${lastDataRow}`).format.numberFormat = "0.##";
sheet.getRange(`G${firstDataRow}:H${lastDataRow}`).format.numberFormat = "$#,##0.00";
sheet.getRange(`D${firstDataRow}:H${lastDataRow}`).format.horizontalAlignment = "right";

const totalsRow = lastDataRow + 2;
sheet.getRange(`C${totalsRow}`).values = [["Total Children"]];
sheet.getRange(`D${totalsRow}`).formulas = [[`=SUM(D${firstDataRow}:D${lastDataRow})`]];
sheet.getRange(`G${totalsRow}`).values = [["Total:"]];
sheet.getRange(`H${totalsRow}`).formulas = [[`=SUM(H${firstDataRow}:H${lastDataRow})`]];
sheet.getRange(`C${totalsRow}:H${totalsRow}`).format.font = { bold: true };
sheet.getRange(`D${totalsRow}`).format.numberFormat = "0";
sheet.getRange(`H${totalsRow}`).format.numberFormat = "$#,##0.00";
sheet.getRange(`C${totalsRow}:H${totalsRow}`).format.horizontalAlignment = "right";

const widths = [26, 24, 19, 14, 14, 18, 14, 14, 24];
for (let col = 0; col < widths.length; col += 1) {
  sheet.getRangeByIndexes(0, col, totalsRow, 1).format.columnWidth = widths[col];
}
sheet.getRange("A1:I6").format.rowHeight = 22;
sheet.getRange("A8:I8").format.rowHeight = 30;
sheet.freezePanes.freezeRows(8);

await fs.mkdir(path.dirname(path.resolve(outputPath)), { recursive: true });
const exported = await SpreadsheetFile.exportXlsx(workbook);
await exported.save(outputPath);

const preview = await workbook.render({
  sheetName: "Invoice",
  range: `A1:I${totalsRow}`,
  scale: 1,
  format: "png",
});
await fs.writeFile(
  `${outputPath}.preview.png`,
  new Uint8Array(await preview.arrayBuffer()),
);

const inspection = await workbook.inspect({
  kind: "table",
  range: `Invoice!A1:I${totalsRow}`,
  include: "values,formulas",
  tableMaxRows: Math.min(totalsRow, 100),
  tableMaxCols: 9,
  maxChars: 12000,
});
const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  summary: "Bright Horizons invoice formula error scan",
});
process.stdout.write(`${inspection.ndjson}\n${errors.ndjson}\n`);
