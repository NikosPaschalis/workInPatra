import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath = "C:/Users/n.pashalis/Downloads/https___workinpatras.netlify.app_-Performance-on-Search-2026-08-04.xlsx";
const input = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(input);

const sheets = await workbook.inspect({
  kind: "sheet",
  include: "id,name",
  maxChars: 8000,
});

const overview = await workbook.inspect({
  kind: "workbook,sheet,table",
  maxChars: 16000,
  tableMaxRows: 8,
  tableMaxCols: 10,
  tableMaxCellChars: 120,
});

console.log("---SHEETS---");
console.log(sheets.ndjson);
console.log("---OVERVIEW---");
console.log(overview.ndjson);
