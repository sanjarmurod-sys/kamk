# Voice dispatcher conversation examples

These examples define the expected behavior. They are not rigid voice command syntax.

## Multi-turn capture

Dispatcher: "To'qqizga KAMK boshdan yozing."
Agent: "PK 66 ni nazarda tutyapsizmi? H va Q qiymatlarini ayting."
Dispatcher: "Ha. H bir yuz to'qson to'rt, Q qirq."
Agent: "Tushundim: bugun soat 09:00, KAMK bosh PK 66, H 194, Q 40. Yana qaysi punktni qo'shay?"
Dispatcher: "Nazorat balansga ham: H 182, Q 37,5."
Agent: "Ikkinchi yozuv: PK 287, H 182, Q 37,5. Hozir ikkita yozuv tayyor. Ikkalasini ham Excelga kiritaymi?"
Dispatcher: "Ha, kirit."
Agent: "Ikkala yozuv saqlandi. 09:00 uchun yana 5 ta punkt kiritilmagan."

## Context and correction

Dispatcher: "PK 446 ga 173 yoz."
Agent: "Soat 09:00 dagi kuzatuvmi? H 173 deb tushundim. Tasdiqlaysizmi?"
Dispatcher: "Yo'q, 174."
Agent: "H qiymatini 174 ga tuzatdim. PK 446, 09:00, H 174. Saqlaymi?"
Dispatcher: "Ha."
Agent: "Saqlandi."

## Ambiguity

Dispatcher: "Chegaraga 190 yoz."
Agent: "KAMK chegara PK 583 ni aytyapsizmi? Q qiymati ham kerak."
Dispatcher: "Boshqa chegara emas, PK 583."
Agent: "Tushunarli. H 190 deb yozaymi? Q kubasini ham ayting."

## Report delivery

Dispatcher: "Bugungi hisobotni guruhga yubor."
Agent: "Avval Excel hisobotini tayyorlayman va ma'lumotlar to'liqligini tekshiraman."
Agent: "Hisobot tayyor. Guruhga yuborishni tasdiqlaysizmi?"
Dispatcher: "Tasdiqlayman."
Agent: "Telegram hisobotni qabul qildi. Yuborilgan vaqt va xabar raqami saqlandi."

## Voice behavior requirements

- Respond in natural Uzbek; avoid robotic phrases and repetitive boilerplate.
- Keep short acknowledgements while the dispatcher is dictating multiple values.
- Do not speak a long paragraph after every small input.
- Listen continuously while a live session is active, but visibly show microphone state.
- Support barge-in: if the dispatcher speaks while the agent is speaking, stop the agent's playback and listen.
- Never claim that data was saved or a Telegram message was sent until the corresponding tool/backend reports success.
