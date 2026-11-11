package uz.kamk.dispatch;

import android.content.Context;
import android.content.SharedPreferences;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import java.io.File;
import java.util.List;

public final class ReportWorker extends Worker {
    public ReportWorker(@NonNull Context context, @NonNull WorkerParameters parameters) {
        super(context, parameters);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context context = getApplicationContext();
        SharedPreferences prefs = context.getSharedPreferences("dispatcher_settings", Context.MODE_PRIVATE);
        String token = prefs.getString("telegram_token", "");
        String chatId = prefs.getString("telegram_chat_id", "");
        if (token.isEmpty() || chatId.isEmpty()) return Result.failure();

        String date = ExcelExporter.todayIso();
        ObservationDatabase database = new ObservationDatabase(context);
        List<Observation> observations = database.getByDate(date);
        File report = new File(context.getCacheDir(), "kamk-report-" + date + ".xlsx");
        try {
            ExcelExporter.write(report, observations, date);
            TelegramSender.sendDocument(token, chatId, report);
            return Result.success();
        } catch (Exception e) {
            return Result.retry();
        } finally {
            database.close();
            // Keep only the last local report in cache.
            if (report.exists()) report.delete();
        }
    }
}
