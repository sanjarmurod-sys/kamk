import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import {
  validDate,
  dateFromSheetName,
  numericCellValue,
  findOrCreateDailyWorksheet
} from "../src/workbook-utils.js";

test("validates ISO dates without accepting impossible calendar days", () => {
  assert.equal(validDate("2026-11-12"), true);
  assert.equal(validDate("2026-02-30"), false);
  assert.equal(validDate("12,11,26"), false);
});

test("parses official workbook sheet names", () => {
  assert.equal(dateFromSheetName("10,11,26"), "2026-11-10");
  assert.equal(dateFromSheetName("27,03,2023"), "2023-03-27");
  assert.equal(dateFromSheetName("31,02,26"), null);
  assert.equal(dateFromSheetName("Overview"), null);
});

test("reads numeric cells and decimal comma text", () => {
  assert.equal(numericCellValue({ value: 10.5 }), 10.5);
  assert.equal(numericCellValue({ value: "37,5" }), 37.5);
  assert.equal(numericCellValue({ value: null }), null);
  assert.equal(numericCellValue({ value: { formula: "A1+B1" } }), null);
});

test("clones missing day tab, keeps layout and clears prior H/Q observations", () => {
  const workbook = new ExcelJS.Workbook();
  const source = workbook.addWorksheet("10,11,26");
  source.columns = Array.from({ length: 11 }, (_, index) => ({
    width: index === 0 ? 9 : 14
  }));
  source.mergeCells("A1:A2");
  source.mergeCells("C1:D1");
  source.getCell("A1").value = "соат";
  source.getCell("C1").value = "KAMK bosh PK 66";
  source.getCell("C2").value = "H";
  source.getCell("D2").value = "Q";
  source.getCell("A1").style = {
    font: { bold: true, color: { argb: "FFFFFFFF" } },
    fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FF20374B" } },
    alignment: { horizontal: "center", vertical: "center" },
    border: { bottom: { style: "thin", color: { argb: "FF8795A1" } } }
  };
  for (let hour = 1; hour <= 24; hour++) {
    source.getCell(hour + 2, 1).value = hour;
    source.getCell(hour + 2, 1).style = { alignment: { horizontal: "center" } };
  }
  source.getCell("C3").value = 194;
  source.getCell("D3").value = 40;
  source.getCell("C3").style = { numFmt: "0.00", border: { bottom: { style: "thin" } } };
  source.getRow(1).height = 34;
  source.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1 };
  source.pageMargins = { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5 };

  const result = findOrCreateDailyWorksheet(workbook, "2026-11-12");
  const sheet = result.worksheet;

  assert.equal(result.created, true);
  assert.equal(result.source_sheet, "10,11,26");
  assert.equal(sheet.name, "12,11,26");
  assert.equal(sheet.getCell("A1").value, "соат");
  assert.equal(sheet.getCell("C1").value, "KAMK bosh PK 66");
  assert.equal(sheet.getCell("C2").value, "H");
  assert.equal(sheet.getCell("D2").value, "Q");
  assert.equal(sheet.getCell("A26").value, 24);
  assert.equal(sheet.getCell("C3").value, null);
  assert.equal(sheet.getCell("D3").value, null);
  assert.equal(sheet.getRow(1).height, 34);
  assert.equal(sheet.getCell("C3").numFmt, "0.00");
  assert.deepEqual(sheet.model.merges.sort(), source.model.merges.sort());
  assert.equal(sheet.pageSetup.orientation, "landscape");
});

test("reuses an existing daily tab rather than adding a duplicate", () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("12,11,26");
  const result = findOrCreateDailyWorksheet(workbook, "2026-11-12");
  assert.equal(result.created, false);
  assert.equal(result.worksheet, sheet);
  assert.equal(workbook.worksheets.length, 1);
});
