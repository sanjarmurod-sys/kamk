export function validDate(value) {
  if (typeof value !== "string" || !/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T00:00:00Z");
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function dateFromSheetName(name) {
  const match = String(name).match(/^(\\d{1,2}),(\\d{1,2}),(\\d{2}|\\d{4})$/);
  if (!match) return null;
  const day = match[1].padStart(2, "0");
  const month = match[2].padStart(2, "0");
  const year = match[3].length === 2 ? "20" + match[3] : match[3];
  const date = year + "-" + month + "-" + day;
  return validDate(date) ? date : null;
}

export function numericCellValue(cell) {
  const value = cell?.value;
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "object") {
    if (value.result !== undefined && value.result !== null) {
      const n = Number(value.result);
      return Number.isFinite(n) ? n : null;
    }
    if (value.formula) return null;
    if (value.text !== undefined) {
      const n = Number(String(value.text).replace(",", "."));
      return Number.isFinite(n) ? n : null;
    }
    return null;
  }
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

export function cloneDailyWorksheet(workbook, source, targetName) {
  const target = workbook.addWorksheet(targetName, { properties: { ...source.properties } });
  target.properties = { ...source.properties };
  target.pageSetup = { ...source.pageSetup };
  target.pageMargins = { ...source.pageMargins };
  target.headerFooter = { ...source.headerFooter };
  target.views = Array.isArray(source.views) ? source.views.map(view => ({ ...view })) : [];

  target.columns = (source.columns || []).map(column => ({
    width: column.width,
    hidden: column.hidden,
    outlineLevel: column.outlineLevel,
    style: column.style ? structuredClone(column.style) : undefined
  }));

  source.eachRow({ includeEmpty: true }, (sourceRow, rowNumber) => {
    const targetRow = target.getRow(rowNumber);
    targetRow.height = sourceRow.height;
    targetRow.hidden = sourceRow.hidden;
    targetRow.outlineLevel = sourceRow.outlineLevel;
    sourceRow.eachCell({ includeEmpty: true }, (sourceCell, colNumber) => {
      const targetCell = targetRow.getCell(colNumber);
      targetCell.style = structuredClone(sourceCell.style || {});
      targetCell.numFmt = sourceCell.numFmt;
      if (rowNumber <= 2 || colNumber === 1) {
        targetCell.value = sourceCell.value;
      } else if (sourceCell.value && typeof sourceCell.value === "object"
          && (sourceCell.value.formula || sourceCell.value.sharedFormula)) {
        targetCell.value = structuredClone(sourceCell.value);
      }
    });
  });

  const merges = source.model?.merges || [];
  for (const merge of merges) {
    try { target.mergeCells(merge); } catch (error) {
      console.warn("Could not copy workbook merge:", merge, error.message);
    }
  }
  if (source.autoFilter) target.autoFilter = structuredClone(source.autoFilter);
  if (source.dataValidations) target.dataValidations = structuredClone(source.dataValidations);
  return target;
}

export function findOrCreateDailyWorksheet(workbook, date) {
  if (!validDate(date)) throw new Error("Invalid report date.");
  const [year, month, day] = date.split("-");
  const shortName = day + "," + month + "," + year.slice(-2);
  const longName = day + "," + month + "," + year;
  const existing = workbook.getWorksheet(shortName) || workbook.getWorksheet(longName);
  if (existing) return { worksheet: existing, created: false };

  const targetTime = Date.parse(date + "T00:00:00Z");
  const candidates = workbook.worksheets
    .map(worksheet => ({ worksheet, date: dateFromSheetName(worksheet.name) }))
    .filter(item => item.date)
    .sort((a, b) => {
      const aTime = Date.parse(a.date + "T00:00:00Z");
      const bTime = Date.parse(b.date + "T00:00:00Z");
      const aDistance = Math.abs(aTime - targetTime);
      const bDistance = Math.abs(bTime - targetTime);
      return aDistance - bDistance;
    });
  if (!candidates.length) {
    throw new Error("No dated daily worksheet is available to use as a template.");
  }
  const source = candidates[0].worksheet;
  const worksheet = cloneDailyWorksheet(workbook, source, shortName);
  return { worksheet, created: true, source_sheet: source.name };
}
