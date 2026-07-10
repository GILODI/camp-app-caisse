import ExcelJS from "exceljs";

const path = process.argv[2];
const filter = process.argv[3];
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(path);

for (const sheet of wb.worksheets) {
  console.log(`\n===== SHEET: ${sheet.name} (${sheet.rowCount} rows x ${sheet.columnCount} cols) =====`);
  const maxRow = sheet.rowCount;
  for (let r = 1; r <= maxRow; r++) {
    const row = sheet.getRow(r);
    const cells = [];
    let hasContent = false;
    let matchesFilter = !filter;
    for (let c = 1; c <= Math.min(sheet.columnCount, 20); c++) {
      const cell = row.getCell(c);
      let v = cell.value;
      if (v && typeof v === "object" && "formula" in v) {
        v = `=${v.formula}` + (v.result !== undefined ? ` [${v.result}]` : "");
      }
      if (v !== null && v !== undefined && v !== "") hasContent = true;
      const str = v === null || v === undefined ? "" : String(v);
      if (filter && str.toLowerCase().includes(filter.toLowerCase())) matchesFilter = true;
      cells.push(str);
    }
    if (hasContent && matchesFilter) console.log(`R${r}: ` + cells.join(" | "));
  }
}
