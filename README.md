# KAMK Dispetcher

Android ilova: soatlik suv kuzatuvi, ovozli buyruqdan qiymatlarni ajratish, tasdiqlangan yozuvlarni saqlash, Excel (.xlsx) hisobot va Telegram yuborish.

## Hozirgi MVP chegaralari
- Ovoz tanish Android Speech Recognizer orqali ishlaydi; o‘zbek tili qo‘llab-quvvatlashi qurilmadagi speech service ga bog‘liq.
- Buyruqlar hozircha belgilangan kuzatuv punktlari uchun deterministik qoidalar bilan tahlil qilinadi, generativ AI emas.
- Dispetcher profili va yozuvlar qurilmaning o‘zida saqlanadi; ko‘p qurilmali markaziy akkaunt/sinxronlash uchun server talab qilinadi.
- Telegram yuborish uchun BotFather tokeni va guruh chat ID foydalanuvchi tomonidan ilovada kiritiladi.

## Build
GitHub Actions `Android APK` workflow har bir pushda debug APK yig‘adi va `app-debug.apk` artifact sifatida saqlaydi.

## Excel tuzilishi
39 varaqli namunadagi kunlik jadval asosida 24 soat va 7 kuzatuv punkti: 02 reyka; KAMK bosh PK66 (H/Q); nazorat balans PK287 (H/Q); PK390 (H); PK446 (H); PK559 (H); KAMK chegara PK583 (H/Q).
