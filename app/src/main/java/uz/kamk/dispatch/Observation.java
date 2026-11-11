package uz.kamk.dispatch;

public final class Observation {
    public final int hour;
    public final String pointKey;
    public final double h;
    public final Double q;
    public final String dispatcher;
    public final String date;
    public final long createdAt;

    public Observation(int hour, String pointKey, double h, Double q,
                       String dispatcher, String date, long createdAt) {
        this.hour = hour;
        this.pointKey = pointKey;
        this.h = h;
        this.q = q;
        this.dispatcher = dispatcher;
        this.date = date;
        this.createdAt = createdAt;
    }
}
