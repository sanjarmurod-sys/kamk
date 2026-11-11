package uz.kamk.dispatch;

import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class ObservationParser {
    private static final Pattern H_PATTERN = Pattern.compile(
            "(?:\\bh\\b\\s*(?:reykasi?\\s*)?|\\breykasi\\s*)(-?\\d+(?:[.,]\\d+)?)",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern Q_PATTERN = Pattern.compile(
            "(?:\\bq\\b\\s*(?:kubasi?\\s*)?|\\bkubasi\\s*)(-?\\d+(?:[.,]\\d+)?)",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern HOUR_PATTERN = Pattern.compile(
            "\\bsoat\\s*(\\d{1,2})\\b|\\b(\\d{1,2})\\s*[:.]\\s*00\\b",
            Pattern.CASE_INSENSITIVE);

    private ObservationParser() {}

    public static final class ParseResult {
        public final Observation observation;
        public final String error;
        private ParseResult(Observation observation, String error) {
            this.observation = observation;
            this.error = error;
        }
        public boolean isValid() { return observation != null; }
        public static ParseResult ok(Observation value) { return new ParseResult(value, null); }
        public static ParseResult fail(String message) { return new ParseResult(null, message); }
    }

    public static ParseResult parse(String transcript, String dispatcher, String date) {
        if (transcript == null || transcript.trim().isEmpty()) {
            return ParseResult.fail("Buyruqni eshita olmadim. Qayta ayting yoki matn kiriting.");
        }
        String text = normalize(transcript);

        Matcher timeMatcher = HOUR_PATTERN.matcher(text);
        if (!timeMatcher.find()) {
            return ParseResult.fail("Kuzatuv soatini aniqlay olmadim. Masalan: “Soat 09 ga ...” deb ayting.");
        }
        String hourText = timeMatcher.group(1) != null ? timeMatcher.group(1) : timeMatcher.group(2);
        int hour;
        try {
            hour = Integer.parseInt(hourText);
        } catch (NumberFormatException e) {
            return ParseResult.fail("Soat qiymati noto‘g‘ri.");
        }
        if (hour < 1 || hour > 24) {
            return ParseResult.fail("Soat 1 dan 24 gacha bo‘lishi kerak.");
        }

        Point point = detectPoint(text);
        if (point == null) {
            return ParseResult.fail("Kuzatuv punktini aniqlay olmadim. Punkt nomini yoki PK raqamini aniq ayting.");
        }

        Double hValue = extract(H_PATTERN, text);
        if (hValue == null) {
            return ParseResult.fail(point.title + " uchun H qiymati topilmadi. H reykasini ayting.");
        }
        if (hValue < 0) {
            return ParseResult.fail("H qiymati manfiy bo‘lishi mumkin emas.");
        }

        Double qValue = extract(Q_PATTERN, text);
        if (point.hasQ && qValue == null) {
            return ParseResult.fail(point.title + " uchun Q kubasi ham kerak. Q qiymatini ayting.");
        }
        if (!point.hasQ && qValue != null) {
            return ParseResult.fail(point.title + " punktida Q ustuni yo‘q. Faqat H qiymatini kiriting.");
        }
        if (qValue != null && qValue < 0) {
            return ParseResult.fail("Q qiymati manfiy bo‘lishi mumkin emas.");
        }

        Observation observation = new Observation(hour, point.key, hValue, qValue,
                dispatcher, date, System.currentTimeMillis());
        return ParseResult.ok(observation);
    }

    private static Double extract(Pattern pattern, String text) {
        Matcher matcher = pattern.matcher(text);
        if (!matcher.find()) return null;
        try {
            return Double.parseDouble(matcher.group(1).replace(',', '.'));
        } catch (NumberFormatException ignored) {
            return null;
        }
    }

    private static Point detectPoint(String text) {
        if (has(text, "02 reyka", "2 reyka", "ikkinchi reyka", "ikkichi reyka")) {
            return new Point("reyka02", "02 reyka", false);
        }
        if (has(text, "kamk bosh", "pk 66", "pk66", "66 post")) {
            return new Point("pk66", "KAMK bosh PK 66", true);
        }
        if (has(text, "nazorat balans", "balans posti", "pk 287", "pk287")) {
            return new Point("pk287", "Nazorat balans posti PK 287", true);
        }
        if (has(text, "390 pk", "390 рк", "pk 390", "pk390")) {
            return new Point("pk390", "390 PK nazorat", false);
        }
        if (has(text, "pk 446", "pk446", "446 post")) {
            return new Point("pk446", "PK 446 nazorat", false);
        }
        if (has(text, "pk 559", "pk559", "559 post")) {
            return new Point("pk559", "PK 559 nazorat", false);
        }
        if (has(text, "kamk chegara", "pk 583", "pk583", "chegara pk")) {
            return new Point("pk583", "KAMK chegara g/p PK 583", true);
        }
        return null;
    }

    private static boolean has(String text, String... values) {
        for (String value : values) {
            if (text.contains(value)) return true;
        }
        return false;
    }

    private static String normalize(String input) {
        return input.toLowerCase(Locale.ROOT)
                .replace('ў', 'у')
                .replace('қ', 'к')
                .replace('ғ', 'г')
                .replace('ҳ', 'х')
                .replace('’', '\'')
                .replace('ʻ', '\'')
                .replaceAll("[^a-zа-я0-9.,:'\\s-]", " ")
                .replaceAll("\\s+", " ")
                .trim();
    }

    private static final class Point {
        final String key;
        final String title;
        final boolean hasQ;
        Point(String key, String title, boolean hasQ) {
            this.key = key;
            this.title = title;
            this.hasQ = hasQ;
        }
    }
}
