package uz.kamk.dispatch;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

public final class ExcelExporter {
    private ExcelExporter() {}

    public static void write(File output, List<Observation> observations, String isoDate) throws IOException {
        Map<String, Observation> indexed = new HashMap<>();
        for (Observation observation : observations) {
            indexed.put(observation.hour + ":" + observation.pointKey, observation);
        }
        String sheetName = sheetName(isoDate);
        try (ZipOutputStream zip = new ZipOutputStream(new FileOutputStream(output))) {
            put(zip, "[Content_Types].xml",
                    "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
                    "<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">" +
                    "<Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/>" +
                    "<Default Extension=\"xml\" ContentType=\"application/xml\"/>" +
                    "<Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\"/>" +
                    "<Override PartName=\"/xl/worksheets/sheet1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/>" +
                    "<Override PartName=\"/xl/styles.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml\"/>" +
                    "</Types>");
            put(zip, "_rels/.rels",
                    "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
                    "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">" +
                    "<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"xl/workbook.xml\"/>" +
                    "</Relationships>");
            put(zip, "xl/workbook.xml",
                    "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
                    "<workbook xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\">" +
                    "<sheets><sheet name=\"" + xml(sheetName) + "\" sheetId=\"1\" r:id=\"rId1\"/></sheets></workbook>");
            put(zip, "xl/_rels/workbook.xml.rels",
                    "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
                    "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">" +
                    "<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet1.xml\"/>" +
                    "<Relationship Id=\"rId2\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles\" Target=\"styles.xml\"/>" +
                    "</Relationships>");
            put(zip, "xl/styles.xml", styles());
            put(zip, "xl/worksheets/sheet1.xml", worksheet(indexed));
        }
    }

    public static String todayIso() {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Calendar.getInstance().getTime());
    }

    public static String todaySheetName() {
        return sheetName(todayIso());
    }

    private static String sheetName(String iso) {
        try {
            java.util.Date date = new SimpleDateFormat("yyyy-MM-dd", Locale.US).parse(iso);
            return new SimpleDateFormat("dd,MM,yy", Locale.US).format(date);
        } catch (Exception ignored) {
            return iso.replace("-", ",");
        }
    }

    private static String worksheet(Map<String, Observation> values) {
        StringBuilder out = new StringBuilder(16000);
        out.append("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>");
        out.append("<worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\">");
        out.append("<dimension ref=\"A1:K26\"/><sheetViews><sheetView workbookViewId=\"0\"/></sheetViews>");
        out.append("<cols>");
        for (int i = 1; i <= 11; i++) {
            int width = i == 1 ? 9 : (i == 2 ? 13 : 15);
            out.append("<col min=\"").append(i).append("\" max=\"").append(i)
                    .append("\" width=\"").append(width).append("\" customWidth=\"1\"/>");
        }
        out.append("</cols><sheetData>");
        out.append("<row r=\"1\" ht=\"34\" customHeight=\"1\">");
        stringCell(out, "A1", "соат", 1);
        stringCell(out, "B1", "02 reyka", 1);
        stringCell(out, "C1", "KAMK bosh suv sarfi PK 66", 1);
        stringCell(out, "E1", "Nazorat balans posti PK 287", 1);
        stringCell(out, "G1", "390 РК nazorat", 1);
        stringCell(out, "H1", "PK446 nazorat", 1);
        stringCell(out, "I1", "PK559 nazorat", 1);
        stringCell(out, "J1", "KAMK chegara g/p PK583", 1);
        out.append("</row><row r=\"2\">");
        stringCell(out, "C2", "H", 2); stringCell(out, "D2", "Q", 2);
        stringCell(out, "E2", "H", 2); stringCell(out, "F2", "Q", 2);
        stringCell(out, "G2", "H", 2); stringCell(out, "H2", "H", 2);
        stringCell(out, "I2", "H", 2); stringCell(out, "J2", "H", 2);
        stringCell(out, "K2", "Q", 2);
        out.append("</row>");

        for (int hour = 1; hour <= 24; hour++) {
            int row = hour + 2;
            out.append("<row r=\"").append(row).append("\">");
            numberCell(out, "A" + row, hour, 3);
            appendObservation(out, values.get(hour + ":reyka02"), "B" + row, null);
            appendObservation(out, values.get(hour + ":pk66"), "C" + row, "D" + row);
            appendObservation(out, values.get(hour + ":pk287"), "E" + row, "F" + row);
            appendObservation(out, values.get(hour + ":pk390"), "G" + row, null);
            appendObservation(out, values.get(hour + ":pk446"), "H" + row, null);
            appendObservation(out, values.get(hour + ":pk559"), "I" + row, null);
            appendObservation(out, values.get(hour + ":pk583"), "J" + row, "K" + row);
            out.append("</row>");
        }
        out.append("</sheetData><mergeCells count=\"5\">");
        out.append("<mergeCell ref=\"A1:A2\"/><mergeCell ref=\"B1:B2\"/>");
        out.append("<mergeCell ref=\"C1:D1\"/><mergeCell ref=\"E1:F1\"/><mergeCell ref=\"J1:K1\"/>");
        out.append("</mergeCells><pageMargins left=\"0.25\" right=\"0.25\" top=\"0.5\" bottom=\"0.5\" header=\"0.2\" footer=\"0.2\"/>");
        out.append("</worksheet>");
        return out.toString();
    }

    private static void appendObservation(StringBuilder out, Observation value, String hCell, String qCell) {
        if (value == null) return;
        numberCell(out, hCell, value.h, 3);
        if (qCell != null && value.q != null) numberCell(out, qCell, value.q, 3);
    }

    private static void stringCell(StringBuilder out, String ref, String value, int style) {
        out.append("<c r=\"").append(ref).append("\" s=\"").append(style).append("\" t=\"inlineStr\"><is><t>")
                .append(xml(value)).append("</t></is></c>");
    }

    private static void numberCell(StringBuilder out, String ref, double value, int style) {
        out.append("<c r=\"").append(ref).append("\" s=\"").append(style).append("\"><v>")
                .append(String.format(Locale.US, "%.4f", value).replaceAll("0+$", "").replaceAll("\\.$", ""))
                .append("</v></c>");
    }

    private static String styles() {
        return "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
                "<styleSheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\">" +
                "<fonts count=\"2\"><font><sz val=\"10\"/><name val=\"Arial\"/></font>" +
                "<font><b/><color rgb=\"FFFFFFFF\"/><sz val=\"10\"/><name val=\"Arial\"/></font></fonts>" +
                "<fills count=\"3\"><fill><patternFill patternType=\"none\"/></fill>" +
                "<fill><patternFill patternType=\"gray125\"/></fill>" +
                "<fill><patternFill patternType=\"solid\"><fgColor rgb=\"FF20374B\"/><bgColor indexed=\"64\"/></patternFill></fill></fills>" +
                "<borders count=\"2\"><border><left/><right/><top/><bottom/><diagonal/></border>" +
                "<border><left style=\"thin\"><color rgb=\"FF8795A1\"/></left><right style=\"thin\"><color rgb=\"FF8795A1\"/></right>" +
                "<top style=\"thin\"><color rgb=\"FF8795A1\"/></top><bottom style=\"thin\"><color rgb=\"FF8795A1\"/></bottom><diagonal/></border></borders>" +
                "<cellStyleXfs count=\"1\"><xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"0\"/></cellStyleXfs>" +
                "<cellXfs count=\"4\"><xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"1\" xfId=\"0\"/>" +
                "<xf numFmtId=\"0\" fontId=\"1\" fillId=\"2\" borderId=\"1\" xfId=\"0\" applyAlignment=\"1\"><alignment horizontal=\"center\" vertical=\"center\" wrapText=\"1\"/></xf>" +
                "<xf numFmtId=\"0\" fontId=\"1\" fillId=\"2\" borderId=\"1\" xfId=\"0\" applyAlignment=\"1\"><alignment horizontal=\"center\" vertical=\"center\"/></xf>" +
                "<xf numFmtId=\"4\" fontId=\"0\" fillId=\"0\" borderId=\"1\" xfId=\"0\" applyAlignment=\"1\"><alignment horizontal=\"center\" vertical=\"center\"/></xf>" +
                "</cellXfs></styleSheet>";
    }

    private static void put(ZipOutputStream zip, String name, String content) throws IOException {
        zip.putNextEntry(new ZipEntry(name));
        zip.write(content.getBytes(StandardCharsets.UTF_8));
        zip.closeEntry();
    }

    private static String xml(String value) {
        return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                .replace("\"", "&quot;").replace("'", "&apos;");
    }
}
