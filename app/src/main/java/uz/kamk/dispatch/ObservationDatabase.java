package uz.kamk.dispatch;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

import java.util.ArrayList;
import java.util.List;

public final class ObservationDatabase extends SQLiteOpenHelper {
    private static final String DB_NAME = "kamk_dispatcher.db";
    private static final int DB_VERSION = 1;

    public ObservationDatabase(Context context) {
        super(context, DB_NAME, null, DB_VERSION);
    }

    @Override
    public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE observations (" +
                "id INTEGER PRIMARY KEY AUTOINCREMENT," +
                "obs_date TEXT NOT NULL," +
                "hour INTEGER NOT NULL," +
                "point_key TEXT NOT NULL," +
                "h_value REAL NOT NULL," +
                "q_value REAL," +
                "dispatcher TEXT NOT NULL," +
                "created_at INTEGER NOT NULL," +
                "UNIQUE(obs_date, hour, point_key) ON CONFLICT REPLACE)");
    }

    @Override
    public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        // Versioned migrations will be added without discarding saved observations.
    }

    public void save(Observation observation) {
        ContentValues values = new ContentValues();
        values.put("obs_date", observation.date);
        values.put("hour", observation.hour);
        values.put("point_key", observation.pointKey);
        values.put("h_value", observation.h);
        if (observation.q == null) values.putNull("q_value");
        else values.put("q_value", observation.q);
        values.put("dispatcher", observation.dispatcher);
        values.put("created_at", observation.createdAt);
        getWritableDatabase().insertWithOnConflict("observations", null, values,
                SQLiteDatabase.CONFLICT_REPLACE);
    }

    public List<Observation> getByDate(String date) {
        List<Observation> result = new ArrayList<>();
        try (Cursor cursor = getReadableDatabase().query("observations",
                new String[]{"hour", "point_key", "h_value", "q_value", "dispatcher", "obs_date", "created_at"},
                "obs_date=?", new String[]{date}, null, null, "hour ASC, point_key ASC")) {
            while (cursor.moveToNext()) {
                Double q = cursor.isNull(3) ? null : cursor.getDouble(3);
                result.add(new Observation(cursor.getInt(0), cursor.getString(1),
                        cursor.getDouble(2), q, cursor.getString(4),
                        cursor.getString(5), cursor.getLong(6)));
            }
        }
        return result;
    }

    public int countByDate(String date) {
        try (Cursor cursor = getReadableDatabase().rawQuery(
                "SELECT COUNT(*) FROM observations WHERE obs_date=?", new String[]{date})) {
            return cursor.moveToFirst() ? cursor.getInt(0) : 0;
        }
    }
}
