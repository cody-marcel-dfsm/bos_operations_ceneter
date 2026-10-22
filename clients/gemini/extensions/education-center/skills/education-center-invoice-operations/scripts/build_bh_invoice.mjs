import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const validateOnly = args.includes("--validate-only");
const [inputPath, requestedOutputPath] = args.filter(
  (argument) => argument !== "--validate-only",
);
if (!inputPath) {
  throw new Error(
    "Usage: build_bh_invoice.mjs <input.json> [output.xlsx] [--validate-only]",
  );
}

const skillRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const templatePath = path.join(
  skillRoot,
  "assets",
  "bright-horizons-reimbursement-template.json",
);
const template = JSON.parse(await fs.readFile(templatePath, "utf8"));
const expectedHeaders = [
  "Employee Name", "Employer", "Case #", "# of Children", "Date of Care",
  "# of Hours of Care", "Rate per Day", "Amount", "Other Comments",
];
if (
  template.schema_version !== "bright-horizons-reimbursement-template/v1" ||
  template.worksheet_name !== "Invoice" ||
  JSON.stringify(template.detail?.headers) !== JSON.stringify(expectedHeaders) ||
  !Array.isArray(template.detail?.column_widths) ||
  template.detail.column_widths.length !== expectedHeaders.length
) {
  throw new Error(`Invalid Bright Horizons reimbursement template: ${templatePath}`);
}

const input = JSON.parse(await fs.readFile(inputPath, "utf8"));
const requiredTop = [
  "date_submitted", "center_name", "address", "billing_contact_name",
  "phone_number", "invoice_reference_number", "rate_per_day", "period_start",
  "period_end", "rows",
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
  path.resolve(process.cwd(), "output", "invoices", "bright-horizons"),
  `BH_Invoice_${input.period_start}_to_${input.period_end}.xlsx`,
);

const requiredRow = [
  "employee_name", "employer", "case_number", "number_of_children",
  "date_of_care", "hours_of_care",
];
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
  const ratePerDay = row.rate_per_day ?? input.rate_per_day;
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
const childDayCount = rows.reduce(
  (total, row) => total + Number(row.number_of_children),
  0,
);
const invoiceTotal = rows.reduce(
  (total, row) =>
    total + Number(row.number_of_children) * Number(row.rate_per_day ?? input.rate_per_day),
  0,
);
const resultSummary = {
  output_path: path.resolve(outputPath),
  invoice_reference: String(input.invoice_reference_number),
  period_start: input.period_start,
  period_end: input.period_end,
  child_day_count: childDayCount,
  invoice_total: invoiceTotal,
  template_schema_version: template.schema_version,
};
if (validateOnly) {
  process.stdout.write(`${JSON.stringify(resultSummary)}\n`);
  process.exit(0);
}

const requireFromWorkingDirectory = createRequire(
  path.join(process.cwd(), "artifact-tool-runner.cjs"),
);
const { SpreadsheetFile, Workbook } =
  requireFromWorkingDirectory("@oai/artifact-tool");

const excelDate = (iso) => new Date(`${iso}T12:00:00Z`);
const workbook = Workbook.create();
const sheet = workbook.worksheets.add(template.worksheet_name);
sheet.showGridLines = true;

// Range.values interprets leading '=' as a formula. Only the calculated
// amount/total cells below may contain formulas; provider/customer text is literal.
const textCells = [];
const literalText = (value, address) => {
  const text = String(value);
  textCells.push([address, text]);
  return text.startsWith("=") ? `'${text}` : text;
};

const metadataValues = [
  excelDate(input.date_submitted),
  input.center_name,
  input.address,
  input.billing_contact_name,
  String(input.phone_number),
  String(input.invoice_reference_number),
];
sheet.getRange(template.metadata.range).values = template.metadata.labels.map(
  (label, index) => [label, typeof metadataValues[index] === "string"
    ? literalText(metadataValues[index], `B${index + 1}`) : metadataValues[index]],
);
sheet.getRange(template.metadata.label_range).format.font = { bold: true };
sheet.getRange(template.metadata.date_cell).format.numberFormat =
  template.metadata.date_number_format;

sheet.getRange(template.detail.header_range).values = [template.detail.headers];
sheet.getRange(template.detail.header_range).format = {
  fill: template.detail.header_fill,
  font: { bold: true, color: template.detail.header_font_color },
  horizontalAlignment: "center",
  verticalAlignment: "center",
  wrapText: true,
  borders: {
    preset: "all",
    style: "medium",
    color: template.detail.border_color,
  },
};

const firstDataRow = template.detail.first_data_row;
const lastDataRow = firstDataRow + rows.length - 1;
sheet.getRange(`A${firstDataRow}:G${lastDataRow}`).values = rows.map((row, index) => [
  literalText(row.employee_name, `A${firstDataRow + index}`),
  literalText(row.employer, `B${firstDataRow + index}`),
  literalText(row.case_number, `C${firstDataRow + index}`),
  row.number_of_children,
  excelDate(row.date_of_care),
  Number(row.hours_of_care),
  Number(row.rate_per_day ?? input.rate_per_day),
]);
sheet.getRange(`I${firstDataRow}:I${lastDataRow}`).values =
  rows.map((row, index) => [literalText(row.other_comments ?? "", `I${firstDataRow + index}`)]);
sheet.getRange(`H${firstDataRow}`).formulas = [[`=D${firstDataRow}*G${firstDataRow}`]];
if (lastDataRow > firstDataRow) {
  sheet.getRange(`H${firstDataRow}:H${lastDataRow}`).fillDown();
}

const detail = sheet.getRange(`A${firstDataRow}:I${lastDataRow}`);
detail.format.borders = {
  preset: "all",
  style: "thin",
  color: template.detail.border_color,
};
detail.format.verticalAlignment = "center";
sheet.getRange(`C${firstDataRow}:C${lastDataRow}`).format.numberFormat =
  template.detail.case_number_format;
sheet.getRange(`D${firstDataRow}:D${lastDataRow}`).format.numberFormat =
  template.detail.children_number_format;
sheet.getRange(`E${firstDataRow}:E${lastDataRow}`).format.numberFormat =
  template.detail.date_number_format;
sheet.getRange(`F${firstDataRow}:F${lastDataRow}`).format.numberFormat =
  template.detail.hours_number_format;
sheet.getRange(`G${firstDataRow}:H${lastDataRow}`).format.numberFormat =
  template.detail.currency_number_format;
sheet.getRange(`D${firstDataRow}:H${lastDataRow}`).format.horizontalAlignment = "right";

const totalsRow = lastDataRow + template.totals.row_offset_after_last_detail;
sheet.getRange(`${template.totals.children_label_column}${totalsRow}`).values =
  [[template.totals.children_label]];
sheet.getRange(`${template.totals.children_value_column}${totalsRow}`).formulas =
  [[`=SUM(D${firstDataRow}:D${lastDataRow})`]];
sheet.getRange(`${template.totals.amount_label_column}${totalsRow}`).values =
  [[template.totals.amount_label]];
sheet.getRange(`${template.totals.amount_value_column}${totalsRow}`).formulas =
  [[`=SUM(H${firstDataRow}:H${lastDataRow})`]];
sheet.getRange(`C${totalsRow}:H${totalsRow}`).format.font = { bold: true };
sheet.getRange(`D${totalsRow}`).format.numberFormat =
  template.detail.children_number_format;
sheet.getRange(`H${totalsRow}`).format.numberFormat =
  template.detail.currency_number_format;
sheet.getRange(`C${totalsRow}:H${totalsRow}`).format.horizontalAlignment = "right";

for (let col = 0; col < template.detail.column_widths.length; col += 1) {
  sheet.getRangeByIndexes(0, col, totalsRow, 1).format.columnWidth =
    template.detail.column_widths[col];
}
sheet.getRange("A1:I6").format.rowHeight = template.metadata.row_height;
sheet.getRange(template.detail.header_range).format.rowHeight =
  template.detail.header_row_height;
sheet.freezePanes.freezeRows(firstDataRow - 1);

for (const [address, text] of textCells) {
  const cell = sheet.getRange(address);
  if (cell.values[0]?.[0] !== text || cell.formulas[0]?.[0]) {
    throw new Error("The spreadsheet serializer could not preserve literal invoice text");
  }
}
workbook.recalculate();
if (sheet.getRange(`H${totalsRow}`).values[0]?.[0] !== invoiceTotal) {
  throw new Error("Invoice calculation does not match the reconciled total");
}

const destination = path.resolve(outputPath);
await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
// Exporters may create inspection sidecars beside the workbook. Keep the whole
// run private and publish only the verified final workbook atomically.
const verificationDir = await fs.mkdtemp(path.join(path.dirname(destination), ".bh-invoice-"));
try {
  await fs.chmod(verificationDir, 0o700);
  const exported = await SpreadsheetFile.exportXlsx(workbook);
  const privateWorkbook = path.join(verificationDir, "invoice.xlsx");
  const originalLog = console.log;
  try {
    // The exporter logs inspection sidecar details. This single-purpose CLI emits
    // only its sanitized result summary; diagnostics stay inside the private run.
    console.log = () => {};
    await exported.save(privateWorkbook);
  } finally { console.log = originalLog; }
  await fs.chmod(privateWorkbook, 0o600);
  const preview = await workbook.render({
    sheetName: template.worksheet_name,
    range: `A1:I${totalsRow}`,
    scale: 1,
    format: "png",
  });
  await fs.writeFile(
    path.join(verificationDir, `${path.basename(outputPath)}.preview.png`),
    new Uint8Array(await preview.arrayBuffer()),
    { mode: 0o600, flag: "wx" },
  );
  await fs.rename(privateWorkbook, destination);
} finally {
  await fs.rm(verificationDir, { recursive: true, force: true });
}
process.stdout.write(`${JSON.stringify(resultSummary)}\n`);
