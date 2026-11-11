package uz.kamk.dispatch;

import java.io.BufferedReader;
import java.io.DataOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

public final class TelegramSender {
    private TelegramSender() {}

    public static void sendDocument(String token, String chatId, File file) throws Exception {
        if (token == null || token.trim().isEmpty() || chatId == null || chatId.trim().isEmpty()) {
            throw new IllegalArgumentException("Telegram bot tokeni va guruh chat ID kiritilmagan.");
        }
        String boundary = "----KAMKBoundary" + System.currentTimeMillis();
        URL url = new URL("https://api.telegram.org/bot" + token.trim() + "/sendDocument");
        HttpURLConnection connection = (HttpURLConnection) url.openConnection();
        connection.setConnectTimeout(20000);
        connection.setReadTimeout(30000);
        connection.setRequestMethod("POST");
        connection.setDoOutput(true);
        connection.setRequestProperty("Content-Type", "multipart/form-data; boundary=" + boundary);

        try (DataOutputStream out = new DataOutputStream(connection.getOutputStream())) {
            writeText(out, boundary, "chat_id", chatId.trim());
            out.writeBytes("--" + boundary + "\r\n");
            out.writeBytes("Content-Disposition: form-data; name=\"document\"; filename=\"KAMK-soatli-kuzatuv.xlsx\"\r\n");
            out.writeBytes("Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n");
            try (FileInputStream input = new FileInputStream(file)) {
                byte[] buffer = new byte[8192];
                int read;
                while ((read = input.read(buffer)) != -1) out.write(buffer, 0, read);
            }
            out.writeBytes("\r\n--" + boundary + "--\r\n");
            out.flush();
        }

        int responseCode = connection.getResponseCode();
        InputStream stream = responseCode >= 200 && responseCode < 300
                ? connection.getInputStream() : connection.getErrorStream();
        String response = readAll(stream);
        connection.disconnect();
        if (responseCode < 200 || responseCode >= 300 || !response.contains("\"ok\":true")) {
            throw new IllegalStateException("Telegram yuborishda xato (" + responseCode + "): " + response);
        }
    }

    private static void writeText(DataOutputStream out, String boundary, String name, String value)
            throws Exception {
        out.writeBytes("--" + boundary + "\r\n");
        out.writeBytes("Content-Disposition: form-data; name=\"" + name + "\"\r\n\r\n");
        out.write(value.getBytes(StandardCharsets.UTF_8));
        out.writeBytes("\r\n");
    }

    private static String readAll(InputStream input) throws Exception {
        if (input == null) return "";
        StringBuilder result = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(input, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) result.append(line);
        }
        return result.toString();
    }
}
