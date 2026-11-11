package uz.kamk.dispatch;

import org.junit.Test;
import static org.junit.Assert.*;

public class ObservationParserTest {
    @Test
    public void parsesPk66HourHAndQ() {
        ObservationParser.ParseResult result = ObservationParser.parse(
                "Soat 9 ga KAMK bosh PK 66 H reykasi 194 Q kubasi 40",
                "Sinov dispetcheri", "2026-11-11");
        assertTrue(result.error, result.isValid());
        assertEquals(9, result.observation.hour);
        assertEquals("pk66", result.observation.pointKey);
        assertEquals(194.0, result.observation.h, 0.0001);
        assertEquals(40.0, result.observation.q, 0.0001);
    }

    @Test
    public void rejectsMissingQForPairedPoint() {
        ObservationParser.ParseResult result = ObservationParser.parse(
                "Soat 10 ga nazorat balans PK 287 H 175",
                "Sinov dispetcheri", "2026-11-11");
        assertFalse(result.isValid());
        assertTrue(result.error.contains("Q kubasi"));
    }

    @Test
    public void parsesHOnlyPoint() {
        ObservationParser.ParseResult result = ObservationParser.parse(
                "Soat 15 ga 02 reyka H 120",
                "Sinov dispetcheri", "2026-11-11");
        assertTrue(result.error, result.isValid());
        assertEquals("reyka02", result.observation.pointKey);
        assertNull(result.observation.q);
    }

    @Test
    public void rejectsOutOfRangeHour() {
        ObservationParser.ParseResult result = ObservationParser.parse(
                "Soat 25 ga PK 446 H 200",
                "Sinov dispetcheri", "2026-11-11");
        assertFalse(result.isValid());
        assertTrue(result.error.contains("1 dan 24"));
    }
}
