package uz.kamk.dispatch;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Switch;
import android.widget.TextView;
import android.widget.Toast;

import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import java.io.File;
import java.io.OutputStream;
import java.text.DecimalFormat;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

public final class MainActivity extends Activity {
    private static final int REQUEST_AUDIO = 501;
    private static final int REQUEST_EXPORT = 502;
    private static final String WORK_NAME = "kamk_two_hour_report";
    private static final int NAVY = Color.rgb(11, 17, 24);
    private static final int PANEL = Color.rgb(21, 32, 44);
    private static final int GOLD = Color.rgb(215, 181, 109);
    private static final int TEXT = Color.rgb(241, 244, 247);
    private static final int MUTED = Color.rgb(160, 174, 186);

    private SharedPreferences prefs;
    private ObservationDatabase database;
    private SpeechRecognizer speechRecognizer;
    private TextToSpeech textToSpeech;
    private ExecutorService executor;

    private EditText commandInput;
    private TextView profileText;
    private TextView statusText;
    private TextView previewText;
    private TextView recordsText;
    private Button confirmButton;
    private Button cancelButton;
    private Observation pendingObservation;
    private boolean listening = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences("dispatcher_settings", MODE_PRIVATE);
        database = new ObservationDatabase(this);
        executor = Executors.newSingleThreadExecutor();
        initSpeech();
        buildUi();
        String dispatcher = prefs.getString("dispatcher_name", "");
        if (dispatcher.trim().isEmpty()) showSettings(true);
        if (prefs.getBoolean("reports_enabled", false)
                && !prefs.getString("telegram_token", "").isEmpty()
                && !prefs.getString("telegram_chat_id", "").isEmpty()) {
            scheduleReports(true);
        }
        refreshRecords();
    }

    private void buildUi() {
        LinearLayout page = new LinearLayout(this);
        page.setOrientation(LinearLayout.VERTICAL);
        page.setPadding(dp(18), dp(16), dp(18), dp(18));
        page.setBackgroundColor(NAVY);

        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.HORIZONTAL);
        header.setGravity(Gravity.CENTER_VERTICAL);
        TextView brand = text("KAMK  /  DISPETCHER", 17, GOLD, true);
        header.addView(brand, new LinearLayout.LayoutParams(0, dp(42), 1));
        Button settings = smallButton("SOZLAMALAR");
        settings.setOnClickListener(v -> showSettings(false));
        header.addView(settings);
        page.addView(header);

        TextView title = text("Soatlik kuzatuv", 26, TEXT, true);
        page.addView(title);
        TextView subtitle = text("Ovozli buyruq  •  tekshirish  •  Excel hisobot", 13, MUTED, false);
        page.addView(subtitle);

        profileText = text("", 14, GOLD, true);
        profileText.setPadding(0, dp(16), 0, dp(8));
        page.addView(profileText);

        statusText = text("Tizim tayyor. Buyruqni ayting yoki matn kiriting.", 13, MUTED, false);
        statusText.setPadding(dp(12), dp(10), dp(12), dp(10));
        statusText.setBackground(background(PANEL, 12));
        page.addView(statusText);

        ScrollView scroll = new ScrollView(this);
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(0, dp(12), 0, dp(8));

        TextView commandTitle = text("DISPETCHER BUYRUG‘I", 12, GOLD, true);
        commandTitle.setPadding(dp(2), dp(8), 0, dp(8));
        content.addView(commandTitle);

        commandInput = new EditText(this);
        commandInput.setTextColor(TEXT);
        commandInput.setHintTextColor(MUTED);
        commandInput.setHint("Masalan: Soat 9 ga KAMK bosh PK 66, H 194, Q 40");
        commandInput.setTextSize(16);
        commandInput.setGravity(Gravity.TOP | Gravity.START);
        commandInput.setMinLines(3);
        commandInput.setMaxLines(5);
        commandInput.setPadding(dp(14), dp(12), dp(14), dp(12));
        commandInput.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE);
        commandInput.setBackground(background(PANEL, 12));
        content.addView(commandInput, matchWrap());

        LinearLayout commandButtons = new LinearLayout(this);
        commandButtons.setOrientation(LinearLayout.HORIZONTAL);
        commandButtons.setPadding(0, dp(10), 0, dp(4));
        Button listen = actionButton("🎙  GAPIRISH", true);
        listen.setOnClickListener(v -> startListening());
        commandButtons.addView(listen, weighted());
        Button analyze = actionButton("BUYRUQNI TEKSHIRISH", false);
        analyze.setOnClickListener(v -> analyzeCommand(commandInput.getText().toString()));
        LinearLayout.LayoutParams analyzeParams = weighted();
        analyzeParams.leftMargin = dp(8);
        commandButtons.addView(analyze, analyzeParams);
        content.addView(commandButtons);

        TextView confirmTitle = text("TASDIQLASH", 12, GOLD, true);
        confirmTitle.setPadding(dp(2), dp(18), 0, dp(8));
        content.addView(confirmTitle);

        previewText = text("Hozircha tasdiqlanadigan buyruq yo‘q.", 15, TEXT, false);
        previewText.setPadding(dp(14), dp(14), dp(14), dp(14));
        previewText.setMinHeight(dp(82));
        previewText.setBackground(background(PANEL, 12));
        content.addView(previewText, matchWrap());

        LinearLayout confirmRow = new LinearLayout(this);
        confirmRow.setOrientation(LinearLayout.HORIZONTAL);
        confirmRow.setPadding(0, dp(9), 0, dp(4));
        confirmButton = actionButton("TASDIQLASH", true);
        confirmButton.setEnabled(false);
        confirmButton.setAlpha(0.45f);
        confirmButton.setOnClickListener(v -> confirmPending());
        confirmRow.addView(confirmButton, weighted());
        cancelButton = actionButton("BEKOR QILISH", false);
        cancelButton.setEnabled(false);
        cancelButton.setAlpha(0.45f);
        cancelButton.setOnClickListener(v -> clearPending("Buyruq bekor qilindi."));
        LinearLayout.LayoutParams cancelParams = weighted();
        cancelParams.leftMargin = dp(8);
        confirmRow.addView(cancelButton, cancelParams);
        content.addView(confirmRow);

        TextView historyTitle = text("BUGUNGI KIRITILGANLAR", 12, GOLD, true);
        historyTitle.setPadding(dp(2), dp(20), 0, dp(8));
        content.addView(historyTitle);
        recordsText = text("Hozircha yozuv yo‘q.", 13, TEXT, false);
        recordsText.setPadding(dp(14), dp(14), dp(14), dp(14));
        recordsText.setBackground(background(PANEL, 12));
        content.addView(recordsText, matchWrap());

        LinearLayout actions = new LinearLayout(this);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        actions.setPadding(0, dp(14), 0, dp(8));
        Button export = actionButton("EXCEL SAQLASH", false);
        export.setOnClickListener(v -> chooseExportLocation());
        actions.addView(export, weighted());
        Button send = actionButton("TELEGRAMGA YUBORISH", true);
        send.setOnClickListener(v -> sendReportNow());
        LinearLayout.LayoutParams sendParams = weighted();
        sendParams.leftMargin = dp(8);
        actions.addView(send, sendParams);
        content.addView(actions);

        TextView note = text("Ma’lumotlar hozircha ushbu telefonda saqlanadi. Telegram yuborish uchun bot tokeni va guruh ID sozlamalardan kiritiladi.", 11, MUTED, false);
        note.setPadding(dp(3), dp(8), dp(3), dp(10));
        content.addView(note);

        scroll.addView(content);
        page.addView(scroll, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));

        setContentView(page);
        updateProfile();
    }

    private void initSpeech() {
        try {
            if (SpeechRecognizer.isRecognitionAvailable(this)) {
                speechRecognizer = SpeechRecognizer.createSpeechRecognizer(this);
                speechRecognizer.setRecognitionListener(new RecognitionListener() {
                    @Override public void onReadyForSpeech(Bundle params) {
                        listening = true;
                        setStatus("Tinglayapman. Buyruqni aniq ayting.", GOLD);
                    }
                    @Override public void onBeginningOfSpeech() {}
                    @Override public void onRmsChanged(float rmsdB) {}
                    @Override public void onBufferReceived(byte[] buffer) {}
                    @Override public void onEndOfSpeech() {
                        listening = false;
                        setStatus("Ovoz tahlil qilinmoqda…", MUTED);
                    }
                    @Override public void onError(int error) {
                        listening = false;
                        setStatus("Ovoz tanishda xato. Matnni qo‘lda kiritib ko‘ring.", Color.rgb(235, 145, 120));
                    }
                    @Override public void onResults(Bundle results) {
                        listening = false;
                        List<String> matches = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                        if (matches == null || matches.isEmpty()) {
                            setStatus("Ovozdan matn olinmadi. Qayta urinib ko‘ring.", MUTED);
                            return;
                        }
                        String spoken = matches.get(0);
                        if (pendingObservation != null && isYes(spoken)) {
                            confirmPending();
                        } else if (pendingObservation != null && isNo(spoken)) {
                            clearPending("Ovozli buyruq bekor qilindi.");
                        } else {
                            commandInput.setText(spoken);
                            analyzeCommand(spoken);
                        }
                    }
                    @Override public void onPartialResults(Bundle partialResults) {}
                    @Override public void onEvent(int eventType, Bundle params) {}
                });
            }
        } catch (Exception ignored) {
            speechRecognizer = null;
        }

        textToSpeech = new TextToSpeech(this, status -> {
            if (status == TextToSpeech.SUCCESS) {
                int result = textToSpeech.setLanguage(new Locale("uz", "UZ"));
                if (result == TextToSpeech.LANG_MISSING_DATA || result == TextToSpeech.LANG_NOT_SUPPORTED) {
                    textToSpeech.setLanguage(new Locale("ru", "UZ"));
                }
            }
        });
    }

    private void startListening() {
        if (pendingObservation != null) {
            say("Tasdiqlash uchun ha yoki bekor qilish uchun yo‘q deb ayting.");
        }
        if (speechRecognizer == null) {
            Toast.makeText(this, "Bu qurilmada ovoz tanish xizmati mavjud emas.", Toast.LENGTH_LONG).show();
            return;
        }
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQUEST_AUDIO);
            return;
        }
        try {
            Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "uz-UZ");
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "uz-UZ");
            intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3);
            intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false);
            speechRecognizer.startListening(intent);
        } catch (Exception e) {
            setStatus("Mikrofonni ishga tushirib bo‘lmadi: " + e.getMessage(), Color.RED);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode == REQUEST_AUDIO && results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) {
            startListening();
        } else if (requestCode == REQUEST_AUDIO) {
            setStatus("Ovozli buyruq uchun mikrofon ruxsati kerak.", Color.rgb(235, 145, 120));
        }
    }

    private void analyzeCommand(String transcript) {
        String dispatcher = prefs.getString("dispatcher_name", "Dispetcher");
        ObservationParser.ParseResult result = ObservationParser.parse(
                transcript, dispatcher, ExcelExporter.todayIso());
        if (!result.isValid()) {
            pendingObservation = null;
            showPendingButtons(false);
            previewText.setText(result.error);
            setStatus("Buyruq to‘liq emas. Ma’lumotlarni aniqlashtiring.", Color.rgb(235, 145, 120));
            say(result.error);
            return;
        }
        pendingObservation = result.observation;
        String qText = pendingObservation.q == null ? "Q: —" : "Q: " + number(pendingObservation.q);
        String preview = "Sana: " + pendingObservation.date +
                "\nSoat: " + String.format(Locale.US, "%02d:00", pendingObservation.hour) +
                "\nPunkt: " + pointTitle(pendingObservation.pointKey) +
                "\nH: " + number(pendingObservation.h) + "     " + qText +
                "\n\nExcel jadvaliga yozishga ruxsat berasizmi?";
        previewText.setText(preview);
        showPendingButtons(true);
        setStatus("Buyruq aniqlandi. Qiymatlarni tekshirib tasdiqlang.", GOLD);
        say("Soat " + pendingObservation.hour + ". " + pointTitle(pendingObservation.pointKey) +
                ". H " + number(pendingObservation.h) + ". " +
                (pendingObservation.q == null ? "" : "Q " + number(pendingObservation.q) + ". ") +
                "To‘g‘rimi?");
    }

    private void confirmPending() {
        if (pendingObservation == null) return;
        Observation item = pendingObservation;
        try {
            database.save(item);
            pendingObservation = null;
            showPendingButtons(false);
            previewText.setText("Tasdiqlandi va telefon xotirasiga saqlandi.\n" +
                    String.format(Locale.US, "%02d:00", item.hour) + "  •  " +
                    pointTitle(item.pointKey) + "  •  H " + number(item.h) +
                    (item.q == null ? "" : "  •  Q " + number(item.q)));
            setStatus("Yozuv saqlandi. Keyingi kuzatuvni aytishingiz mumkin.", GOLD);
            say("Tasdiqlandi. Ma’lumot yozildi.");
            refreshRecords();
        } catch (Exception e) {
            setStatus("Saqlashda xato: " + e.getMessage(), Color.RED);
        }
    }

    private void clearPending(String message) {
        pendingObservation = null;
        showPendingButtons(false);
        previewText.setText(message);
        setStatus(message, MUTED);
        say(message);
    }

    private void showPendingButtons(boolean enabled) {
        confirmButton.setEnabled(enabled);
        cancelButton.setEnabled(enabled);
        confirmButton.setAlpha(enabled ? 1f : 0.45f);
        cancelButton.setAlpha(enabled ? 1f : 0.45f);
    }

    private void refreshRecords() {
        if (recordsText == null) return;
        String date = ExcelExporter.todayIso();
        List<Observation> values = database.getByDate(date);
        if (values.isEmpty()) {
            recordsText.setText("Bugun hali kuzatuv kiritilmagan.");
            return;
        }
        StringBuilder text = new StringBuilder();
        for (int i = Math.max(0, values.size() - 10); i < values.size(); i++) {
            Observation item = values.get(i);
            text.append(String.format(Locale.US, "%02d:00", item.hour))
                    .append("  •  ").append(pointTitle(item.pointKey))
                    .append("\nH: ").append(number(item.h));
            if (item.q != null) text.append("   Q: ").append(number(item.q));
            text.append("\n");
        }
        text.append("\nJami yozuv: ").append(values.size());
        recordsText.setText(text.toString());
    }

    private void chooseExportLocation() {
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        intent.putExtra(Intent.EXTRA_TITLE, "KAMK-soatli-kuzatuv-" + ExcelExporter.todaySheetName() + ".xlsx");
        startActivityForResult(intent, REQUEST_EXPORT);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQUEST_EXPORT && resultCode == Activity.RESULT_OK && data != null) {
            Uri uri = data.getData();
            executor.execute(() -> {
                try (OutputStream output = getContentResolver().openOutputStream(uri)) {
                    if (output == null) throw new IllegalStateException("Fayl yozish oqimi ochilmadi.");
                    File temp = new File(getCacheDir(), "kamk-export.xlsx");
                    ExcelExporter.write(temp, database.getByDate(ExcelExporter.todayIso()), ExcelExporter.todayIso());
                    try (java.io.FileInputStream input = new java.io.FileInputStream(temp)) {
                        byte[] buffer = new byte[8192];
                        int read;
                        while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
                    }
                    temp.delete();
                    runOnUiThread(() -> Toast.makeText(this, "Excel fayli saqlandi.", Toast.LENGTH_LONG).show());
                } catch (Exception e) {
                    runOnUiThread(() -> Toast.makeText(this, "Excel eksport xatosi: " + e.getMessage(), Toast.LENGTH_LONG).show());
                }
            });
        }
    }

    private void sendReportNow() {
        String token = prefs.getString("telegram_token", "");
        String chatId = prefs.getString("telegram_chat_id", "");
        if (token.trim().isEmpty() || chatId.trim().isEmpty()) {
            showSettings(false);
            Toast.makeText(this, "Avval Telegram bot tokeni va guruh chat ID ni kiriting.", Toast.LENGTH_LONG).show();
            return;
        }
        setStatus("Excel hisobot Telegram guruhiga yuborilmoqda…", GOLD);
        executor.execute(() -> {
            File temp = new File(getCacheDir(), "kamk-report.xlsx");
            try {
                ExcelExporter.write(temp, database.getByDate(ExcelExporter.todayIso()), ExcelExporter.todayIso());
                TelegramSender.sendDocument(token, chatId, temp);
                runOnUiThread(() -> {
                    setStatus("Hisobot Telegram guruhiga yuborildi.", GOLD);
                    Toast.makeText(this, "Telegramga yuborildi.", Toast.LENGTH_LONG).show();
                });
            } catch (Exception e) {
                runOnUiThread(() -> {
                    setStatus("Telegram yuborishda xato: " + e.getMessage(), Color.rgb(235, 145, 120));
                    Toast.makeText(this, "Yuborilmadi. Token va chat ID ni tekshiring.", Toast.LENGTH_LONG).show();
                });
            } finally {
                temp.delete();
            }
        });
    }

    private void showSettings(boolean firstRun) {
        LinearLayout form = new LinearLayout(this);
        form.setOrientation(LinearLayout.VERTICAL);
        form.setPadding(dp(20), dp(8), dp(20), dp(4));

        EditText name = new EditText(this);
        name.setSingleLine(true);
        name.setHint("Dispetcher ism-familiyasi");
        name.setText(prefs.getString("dispatcher_name", ""));
        form.addView(name, matchWrap());

        EditText token = new EditText(this);
        token.setSingleLine(true);
        token.setHint("Telegram bot tokeni (BotFather)");
        token.setText(prefs.getString("telegram_token", ""));
        form.addView(token, matchWrap());

        EditText chatId = new EditText(this);
        chatId.setSingleLine(true);
        chatId.setHint("Guruh chat ID (masalan: -100...)");
        chatId.setText(prefs.getString("telegram_chat_id", ""));
        form.addView(chatId, matchWrap());

        Switch periodic = new Switch(this);
        periodic.setText("Har 2 soatda hisobot yuborish");
        periodic.setTextColor(TEXT);
        periodic.setChecked(prefs.getBoolean("reports_enabled", false));
        form.addView(periodic, matchWrap());

        TextView disclaimer = text("Profil, kuzatuvlar va Telegram tokeni shu telefonda saqlanadi. Markaziy dispetcher akkauntlari va qurilmalararo sinxronlash bu ilk versiyada ulanmagan.", 12, MUTED, false);
        disclaimer.setPadding(0, dp(12), 0, dp(4));
        form.addView(disclaimer);

        AlertDialog dialog = new AlertDialog.Builder(this)
                .setTitle(firstRun ? "Dispetcher profilini sozlash" : "Sozlamalar")
                .setView(form)
                .setPositiveButton("SAQLASH", (d, w) -> {
                    String dispatcher = name.getText().toString().trim();
                    String botToken = token.getText().toString().trim();
                    String groupId = chatId.getText().toString().trim();
                    boolean enabled = periodic.isChecked();
                    if (dispatcher.isEmpty()) dispatcher = "Dispetcher";
                    prefs.edit()
                            .putString("dispatcher_name", dispatcher)
                            .putString("telegram_token", botToken)
                            .putString("telegram_chat_id", groupId)
                            .putBoolean("reports_enabled", enabled)
                            .apply();
                    updateProfile();
                    scheduleReports(enabled && !botToken.isEmpty() && !groupId.isEmpty());
                    Toast.makeText(this, "Sozlamalar saqlandi.", Toast.LENGTH_SHORT).show();
                })
                .setNegativeButton(firstRun ? "KEYINROQ" : "YOPISH", (d, w) -> {
                    if (firstRun && prefs.getString("dispatcher_name", "").isEmpty()) {
                        prefs.edit().putString("dispatcher_name", "Dispetcher").apply();
                        updateProfile();
                    }
                })
                .create();
        dialog.show();
    }

    private void scheduleReports(boolean enabled) {
        if (!enabled) {
            WorkManager.getInstance(this).cancelUniqueWork(WORK_NAME);
            return;
        }
        Constraints constraints = new Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build();
        PeriodicWorkRequest request = new PeriodicWorkRequest.Builder(
                ReportWorker.class, 2, TimeUnit.HOURS)
                .setConstraints(constraints)
                .build();
        WorkManager.getInstance(this).enqueueUniquePeriodicWork(
                WORK_NAME, ExistingPeriodicWorkPolicy.UPDATE, request);
    }

    private void updateProfile() {
        if (profileText == null) return;
        String name = prefs.getString("dispatcher_name", "Dispetcher");
        String today = new SimpleDateFormat("dd.MM.yyyy", Locale.getDefault()).format(new Date());
        profileText.setText(name + "     •     " + today);
    }

    private void setStatus(String message, int color) {
        if (statusText != null) {
            statusText.setText(message);
            statusText.setTextColor(color);
        }
    }

    private void say(String message) {
        if (textToSpeech != null) {
            textToSpeech.speak(message, TextToSpeech.QUEUE_FLUSH, null, "kamk-voice");
        }
    }

    private boolean isYes(String value) {
        String v = value.toLowerCase(Locale.ROOT);
        return v.equals("ha") || v.contains("ha tasdiq") || v.contains("tasdiqlayman") || v.contains("to'g'ri");
    }

    private boolean isNo(String value) {
        String v = value.toLowerCase(Locale.ROOT);
        return v.equals("yo'q") || v.equals("yoq") || v.contains("bekor qil");
    }

    private String pointTitle(String key) {
        switch (key) {
            case "reyka02": return "02 reyka";
            case "pk66": return "KAMK bosh PK 66";
            case "pk287": return "Nazorat balans PK 287";
            case "pk390": return "390 PK nazorat";
            case "pk446": return "PK 446 nazorat";
            case "pk559": return "PK 559 nazorat";
            case "pk583": return "KAMK chegara PK 583";
            default: return key;
        }
    }

    private String number(double value) {
        return new DecimalFormat("0.####", java.text.DecimalFormatSymbols.getInstance(Locale.US))
                .format(value).replace('.', ',');
    }

    private TextView text(String value, int size, int color, boolean bold) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(size);
        view.setTextColor(color);
        if (bold) view.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        return view;
    }

    private Button actionButton(String label, boolean primary) {
        Button button = new Button(this);
        button.setText(label);
        button.setTextSize(12);
        button.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        button.setTextColor(primary ? NAVY : TEXT);
        button.setAllCaps(false);
        button.setPadding(dp(8), dp(10), dp(8), dp(10));
        button.setBackground(background(primary ? GOLD : PANEL, 10));
        return button;
    }

    private Button smallButton(String label) {
        Button button = actionButton(label, false);
        button.setTextSize(10);
        return button;
    }

    private GradientDrawable background(int color, int radius) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(color);
        drawable.setCornerRadius(dp(radius));
        return drawable;
    }

    private LinearLayout.LayoutParams matchWrap() {
        return new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT);
    }

    private LinearLayout.LayoutParams weighted() {
        return new LinearLayout.LayoutParams(0, dp(52), 1);
    }

    private int dp(int value) {
        return (int) (value * getResources().getDisplayMetrics().density + 0.5f);
    }

    @Override
    protected void onDestroy() {
        if (speechRecognizer != null) speechRecognizer.destroy();
        if (textToSpeech != null) textToSpeech.shutdown();
        if (executor != null) executor.shutdown();
        if (database != null) database.close();
        super.onDestroy();
    }
}
