import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pg from "pg";
import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import ExcelJS from "exceljs";
import multer from "multer";
import cron from "node-cron";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { rateLimit } from "express-rate-limit";

const { Pool } = pg;
const PORT = Number(process.env.PORT || 8080);
const REQUIRED_ENV = ["DATABASE_URL", "JWT_SECRET", "OPENAI_API_KEY"];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
}
if (process.env.JWT_SECRET.length < 32) {
  console.error("JWT_SECRET must be at least 32 characters.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000
});

const app = express();
app.disable("x-powered-by");
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
const allowedOrigins = (process.env.CORS_ORIGINS || "https://appassets.androidplatform.net")
  .split(",").map((x) => x.trim()).filter(Boolean);
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("Origin is not allowed by CORS"));
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Authorization", "Content-Type"]
}));
app.use(express.json({ limit: "1mb" }));

const POINTS = {
  reyka02: { title: "02 reyka", hasQ: false },
  pk66: { title: "KAMK bosh PK 66", hasQ: true },
  pk287: { title: "Nazorat balans PK 287", hasQ: true },
  pk390: { title: "390 PK nazorat", hasQ: false },
  pk446: { title: "PK 446 nazorat", hasQ: false },
  pk559: { title: "PK 559 nazorat", hasQ: false },
  pk583: { title: "KAMK chegara g/p PK 583", hasQ: true }
};

const AGENT_INSTRUCTIONS = `Siz KAMK suv xo'jaligi uchun tajribali AI dispetchersiz. Suhbatni tabiiy, qisqa, xushmuomala o'zbek tilida olib boring. Faqat o'zbekcha javob bering. Siz ovozli suhbatdasiz: qisqa, tushunarli jumlalar bilan gapiring va dispetcher gapini bo'lmang.

Siz oddiy buyruq parseri emassiz. Kontekstni kuzating: dispetcher avval vaqt yoki punktni aytib, H/Q qiymatlarini keyin berishi mumkin. Yetishmagan maydonlarni suhbatdan aniqlang. Bitta raqamning ma'nosi aniq bo'lmasa, uni H yoki Q deb taxmin qilmang. "Keyingisi", "o'sha soat", "yana shu punkt" kabi iboralarni suhbat kontekstidan tushuning. Bugungi sana: {{today_date}} (Asia/Tashkent). Sana sifatida shu sanani ishlating, faqat dispetcher boshqa sanani aniq aytsa o'zgartiring.

Kuzatuv punktlari va ustunlari:
- reyka02 = 02 reyka, faqat H.
- pk66 = KAMK bosh PK 66, H va Q.
- pk287 = Nazorat balans posti PK 287, H va Q.
- pk390 = 390 PK nazorat, faqat H.
- pk446 = PK 446 nazorat, faqat H.
- pk559 = PK 559 nazorat, faqat H.
- pk583 = KAMK chegara g/p PK 583, H va Q.

H — reyka ko'rsatkichi, Q — suv sarfi kubasi. Ovozli o'nli sonlarni ehtiyotkorlik bilan talqin qiling: "37 yarim" = 37.5; "37 vergul 5" = 37.5. Noaniq bo'lsa aniqlashtiring. Hech qachon raqam, vaqt yoki punktni o'ylab topmang.

Yozuv jarayoni:
1) Avval kontekstdan soat, punkt va barcha H/Q qiymatlarini yig'ing. Bir nechta punktni bitta batch qilib tayyorlashingiz mumkin.
2) Barcha kerakli ma'lumot yetarli bo'lganda prepare_observation_batch vositasini chaqiring. Bu vosita hali Excelga yoki asosiy bazaga yozmaydi.
3) Vosita batch ID va tekshiruv natijasini qaytargach, vaqt, har bir punkt, H va Q ni ovoz chiqarib qaytarib o'qing. Faqat shundan so'ng aniq rozilik so'rang: "Shu ma'lumotlarni saqlaymi?"
4) Faqat dispetcher aniq "ha", "tasdiqlayman", "saqlang", "to'g'ri, yozing" kabi rozilik berganidan keyin confirm_observation_batch vositasini chaqiring. "Keyingisi", "davom eting" yoki sukut rozilik hisoblanmaydi.
5) Tasdiqdan keyin vosita muvaffaqiyat qaytargandagina "saqlandi" deb ayting. Xato yoki dublikat bo'lsa, to'g'risini ayting va tasdiqsiz ustiga yozmang.
6) Ma'lumotni o'zgartirish yoki avvalgi yozuvni almashtirish alohida tasdiq talab qiladi. Hozircha dublikatni avtomatik yangilamang.

Vositalarni faqat maqsadga muvofiq ishlating. get_observations — avval kiritilgan yozuvlarni tekshirish uchun. prepare_observation_batch — yangi yozuv tayyorlash uchun. confirm_observation_batch — foydalanuvchi og'zaki tasdiqlaganidan keyin saqlash uchun.

Dispetcher: {{dispatcher_name}} ({{role}}). Sizning vazifangiz kuzatuvni to'g'ri tushunish, yozuvni nazorat bilan bajarish va hisobot ishini yengillashtirish. Hisobot jarayoni:
- Dispetcher "hisobotni yubor" desa, avval prepare_telegram_report ni chaqiring. Bu shablon asosida Excel faylini tayyorlaydi, hali Telegramga yubormaydi.
- Fayl sanasi va yozuvlar sonini aytib, "Shu hisobotni Telegram guruhiga yuboraymi?" deb aniq rozilik so'rang.
- Faqat aniq rozilikdan keyin confirm_telegram_report ni chaqiring. Telegram API muvaffaqiyatli javob bergandagina yuborilganini tasdiqlang.
- Har 2 soatlik avtomatik yuborishni server o'zi bajarishi mumkin; uni dispetcherning og'zaki tasdig'i bilan aralashtirmang.

Dispetcher: {{dispatcher_name}} ({{role}}). Sizning vazifangiz kuzatuvni to'g'ri tushunish, yozuvni nazorat bilan bajarish va hisobot ishini yengillashtirish. Siz Telegramga yoki Excel fayliga yuborilganini faqat tegishli xizmat haqiqatda bajarib bergandan keyin aytishingiz mumkin.`;

const toolDefinitions = [
  {
    type: "function",
    name: "prepare_observation_batch",
    description: "Prepare one or more hourly water observations for dispatcher review. This does not save them. Use only when all values are clear.",
    parameters: {
      type: "object",
      properties: {
        observation_date: { type: "string", description: "Date in YYYY-MM-DD format, Asia/Tashkent." },
        hour: { type: "integer", minimum: 1, maximum: 24, description: "Observation hour, 1 through 24." },
        readings: {
          type: "array",
          minItems: 1,
          maxItems: 7,
          items: {
            type: "object",
            properties: {
              point_key: { type: "string", enum: Object.keys(POINTS) },
              h_value: { type: "number", minimum: 0 },
              q_value: { anyOf: [{ type: "number", minimum: 0 }, { type: "null" }] }
            },
            required: ["point_key", "h_value", "q_value"],
            additionalProperties: false
          }
        }
      },
      required: ["observation_date", "hour", "readings"],
      additionalProperties: false
    },
    strict: true
  },
  {
    type: "function",
    name: "confirm_observation_batch",
    description: "Commit a previously prepared batch only after the dispatcher explicitly agrees to save the exact values read back by the assistant.",
    parameters: {
      type: "object",
      properties: { batch_id: { type: "string", description: "The pending batch UUID returned by prepare_observation_batch." } },
      required: ["batch_id"],
      additionalProperties: false
    },
    strict: true
  },
  {
    type: "function",
    name: "get_observations",
    description: "Read existing observations for a date, optionally filtered by hour and observation point.",
    parameters: {
      type: "object",
      properties: {
        observation_date: { type: "string", description: "YYYY-MM-DD date." },
        hour: { anyOf: [{ type: "integer", minimum: 1, maximum: 24 }, { type: "null" }] },
        point_key: { anyOf: [{ type: "string", enum: Object.keys(POINTS) }, { type: "null" }] }
      },
      required: ["observation_date", "hour", "point_key"],
      additionalProperties: false
    },
    strict: true
  },
  {
    type: "function",
    name: "prepare_telegram_report",
    description: "Prepare the official Excel report for a date and show its details. This does not send it to Telegram.",
    parameters: {
      type: "object",
      properties: {
        observation_date: { type: "string", description: "Date in YYYY-MM-DD format." }
      },
      required: ["observation_date"],
      additionalProperties: false
    },
    strict: true
  },
  {
    type: "function",
    name: "confirm_telegram_report",
    description: "Send a previously prepared report to the configured Telegram group only after the dispatcher explicitly confirms.",
    parameters: {
      type: "object",
      properties: {
        report_id: { type: "string", description: "Pending report UUID returned by prepare_telegram_report." }
      },
      required: ["report_id"],
      additionalProperties: false
    },
    strict: true
  }
];

function signToken(user) {
  return jwt.sign(
    { sub: user.id, username: user.username, display_name: user.display_name, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "12h", issuer: "kamk-dispatcher-api", audience: "kamk-android" }
  );
}

function requireAuth(req, res, next) {
  const value = req.get("authorization") || "";
  const match = value.match(/^Bearer\s+(.+)$/i);
  if (!match) return res.status(401).json({ error: "Kirish talab qilinadi." });
  try {
    req.user = jwt.verify(match[1], process.env.JWT_SECRET, {
      issuer: "kamk-dispatcher-api",
      audience: "kamk-android"
    });
    next();
  } catch {
    return res.status(401).json({ error: "Sessiya muddati tugagan. Qayta kiring." });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: "Bu amal uchun ruxsat yo'q." });
    next();
  };
}

function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T00:00:00Z");
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

async function initializeDatabase() {
  const schemaUrl = new URL("../schema.sql", import.meta.url);
  const schema = await readFile(schemaUrl, "utf8");
  await pool.query(schema);

  const username = (process.env.SEED_ADMIN_USERNAME || "").trim();
  const password = process.env.SEED_ADMIN_PASSWORD || "";
  if (username && password) {
    const existing = await pool.query("SELECT id FROM dispatchers WHERE username = $1", [username]);
    if (existing.rowCount === 0) {
      const hash = await bcrypt.hash(password, 12);
      await pool.query(
        "INSERT INTO dispatchers (id, username, display_name, password_hash, role) VALUES ($1,$2,$3,$4,'admin')",
        [randomUUID(), username, "KAMK Administrator", hash]
      );
      console.log("Initial administrator account created from environment configuration.");
    }
  }
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Juda ko'p urinish. Birozdan keyin qayta urinib ko'ring." }
});

app.get("/healthz", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", database: "connected", service: "kamk-dispatcher-api" });
  } catch {
    res.status(503).json({ status: "unavailable", database: "disconnected" });
  }
});

app.post("/api/auth/login", loginLimiter, async (req, res, next) => {
  try {
    const username = String(req.body?.username || "").trim();
    const password = String(req.body?.password || "");
    if (!username || !password || username.length > 120 || password.length > 256) {
      return res.status(400).json({ error: "Login va parolni kiriting." });
    }
    const result = await pool.query(
      "SELECT id, username, display_name, password_hash, role, active FROM dispatchers WHERE username=$1",
      [username]
    );
    const user = result.rows[0];
    const accepted = user && user.active && await bcrypt.compare(password, user.password_hash);
    if (!accepted) return res.status(401).json({ error: "Login yoki parol noto'g'ri." });
    const { password_hash, active, ...publicUser } = user;
    res.set("Cache-Control", "no-store");
    res.json({ token: signToken(publicUser), user: publicUser });
  } catch (error) {
    next(error);
  }
});

app.get("/api/auth/me", requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query(
      "SELECT id, username, display_name, role, active FROM dispatchers WHERE id=$1",
      [req.user.sub]
    );
    const user = result.rows[0];
    if (!user || !user.active) return res.status(401).json({ error: "Akkaunt faol emas." });
    res.json({ user });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/dispatchers", requireAuth, requireRole("admin", "supervisor"), async (req, res, next) => {
  try {
    const username = String(req.body?.username || "").trim();
    const displayName = String(req.body?.display_name || "").trim();
    const password = String(req.body?.password || "");
    const role = String(req.body?.role || "dispatcher");
    if (!/^[a-zA-Z0-9._-]{3,40}$/.test(username) || !displayName || displayName.length > 120
        || password.length < 10 || password.length > 256 || !["dispatcher", "supervisor"].includes(role)) {
      return res.status(400).json({ error: "Login, ism, kamida 10 belgili parol va rolni tekshiring." });
    }
    if (req.user.role !== "admin" && role !== "dispatcher") {
      return res.status(403).json({ error: "Supervisor faqat dispetcher qo'sha oladi." });
    }
    const id = randomUUID();
    const hash = await bcrypt.hash(password, 12);
    await pool.query(
      "INSERT INTO dispatchers (id, username, display_name, password_hash, role) VALUES ($1,$2,$3,$4,$5)",
      [id, username, displayName, hash, role]
    );
    res.status(201).json({ user: { id, username, display_name: displayName, role } });
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "Bu login band." });
    next(error);
  }
});

app.get("/api/admin/dispatchers", requireAuth, requireRole("admin", "supervisor"), async (_req, res, next) => {
  try {
    const result = await pool.query(
      "SELECT id, username, display_name, role, active, created_at FROM dispatchers ORDER BY display_name"
    );
    res.json({ users: result.rows });
  } catch (error) {
    next(error);
  }
});


const templateUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter(_req, file, callback) {
    const allowed = file.originalname.toLowerCase().endsWith(".xlsx");
    callback(allowed ? null : new Error("Faqat .xlsx Excel shablonini yuklang."), allowed);
  }
});

const TEMPLATE_PATH = process.env.WORKBOOK_TEMPLATE_PATH || "/data/kamk-hourly-observation-template.xlsx";
const REPORT_DIR = process.env.REPORT_OUTPUT_DIR || "/data/reports";
const POINT_COLUMNS = [
  { key: "reyka02", h: 2, q: null },
  { key: "pk66", h: 3, q: 4 },
  { key: "pk287", h: 5, q: 6 },
  { key: "pk390", h: 7, q: null },
  { key: "pk446", h: 8, q: null },
  { key: "pk559", h: 9, q: null },
  { key: "pk583", h: 10, q: 11 }
];

function dateFromSheetName(name) {
  const match = String(name).match(/^(\d{1,2}),(\d{1,2}),(\d{2}|\d{4})$/);
  if (!match) return null;
  const day = match[1].padStart(2, "0");
  const month = match[2].padStart(2, "0");
  const year = match[3].length === 2 ? "20" + match[3] : match[3];
  const date = year + "-" + month + "-" + day;
  return validDate(date) ? date : null;
}

function numericCellValue(cell) {
  const value = cell?.value;
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "object") {
    if (value.result !== undefined && value.result !== null) {
      const n = Number(value.result);
      return Number.isFinite(n) ? n : null;
    }
    if (value.formula) return null;
    if (value.text !== undefined) {
      const n = Number(String(value.text).replace(",", "."));
      return Number.isFinite(n) ? n : null;
    }
    return null;
  }
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

async function importTemplateReadings(workbook, dispatcherId) {
  const client = await pool.connect();
  let imported = 0;
  let sheetsImported = 0;
  try {
    await client.query("BEGIN");
    for (const sheet of workbook.worksheets) {
      const date = dateFromSheetName(sheet.name);
      if (!date) continue;
      sheetsImported++;
      for (let row = 3; row <= 26; row++) {
        const hour = numericCellValue(sheet.getCell(row, 1));
        if (!Number.isInteger(hour) || hour < 1 || hour > 24) continue;
        for (const point of POINT_COLUMNS) {
          const hValue = numericCellValue(sheet.getCell(row, point.h));
          if (hValue === null || hValue < 0) continue;
          const qValue = point.q === null ? null : numericCellValue(sheet.getCell(row, point.q));
          if (point.q !== null && (qValue === null || qValue < 0)) continue;
          const inserted = await client.query(
            "INSERT INTO observations (id,observation_date,hour,point_key,h_value,q_value,dispatcher_id) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (observation_date,hour,point_key) DO NOTHING",
            [randomUUID(), date, hour, point.key, hValue, qValue, dispatcherId]
          );
          imported += inserted.rowCount;
        }
      }
    }
    await client.query(
      "INSERT INTO audit_events (dispatcher_id,event_type,payload) VALUES ($1,'official_template_imported',$2::jsonb)",
      [dispatcherId, JSON.stringify({ sheets_imported: sheetsImported, observations_imported: imported })]
    );
    await client.query("COMMIT");
    return { sheets_imported: sheetsImported, observations_imported: imported };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

app.post("/api/admin/workbook-template", requireAuth, requireRole("admin"), templateUpload.single("workbook"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Excel .xlsx faylini tanlang." });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);
    const firstSheet = workbook.worksheets[0];
    if (!firstSheet || !String(firstSheet.getCell(1, 1).value || "").toLowerCase().includes("соат")
        || workbook.worksheets.length < 1) {
      return res.status(400).json({ error: "Bu fayl KAMK soatli kuzatuv shabloniga o'xshamaydi." });
    }
    await mkdir(path.dirname(TEMPLATE_PATH), { recursive: true });
    await writeFile(TEMPLATE_PATH, req.file.buffer);
    const imported = await importTemplateReadings(workbook, req.user.sub);
    res.status(201).json({
      ok: true,
      template_file: path.basename(TEMPLATE_PATH),
      ...imported,
      message: "Rasmiy Excel shabloni saqlandi. Mavjud kunlik varaqlar va katak formatlari saqlanadi."
    });
  } catch (error) {
    if (error.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "Excel fayli 10 MB dan kichik bo'lishi kerak." });
    next(error);
  }
});

function cloneDailyWorksheet(workbook, source, targetName) {
  const target = workbook.addWorksheet(targetName, { properties: { ...source.properties } });
  target.properties = { ...source.properties };
  target.pageSetup = { ...source.pageSetup };
  target.pageMargins = { ...source.pageMargins };
  target.headerFooter = { ...source.headerFooter };
  target.views = Array.isArray(source.views) ? source.views.map(view => ({ ...view })) : [];

  target.columns = (source.columns || []).map(column => ({
    width: column.width,
    hidden: column.hidden,
    outlineLevel: column.outlineLevel,
    style: column.style ? structuredClone(column.style) : undefined
  }));

  source.eachRow({ includeEmpty: true }, (sourceRow, rowNumber) => {
    const targetRow = target.getRow(rowNumber);
    targetRow.height = sourceRow.height;
    targetRow.hidden = sourceRow.hidden;
    targetRow.outlineLevel = sourceRow.outlineLevel;
    sourceRow.eachCell({ includeEmpty: true }, (sourceCell, colNumber) => {
      const targetCell = targetRow.getCell(colNumber);
      targetCell.style = structuredClone(sourceCell.style || {});
      targetCell.numFmt = sourceCell.numFmt;
      if (rowNumber <= 2 || colNumber === 1) {
        targetCell.value = sourceCell.value;
      } else if (sourceCell.value && typeof sourceCell.value === "object"
          && (sourceCell.value.formula || sourceCell.value.sharedFormula)) {
        targetCell.value = structuredClone(sourceCell.value);
      }
    });
  });

  const merges = source.model?.merges || [];
  for (const merge of merges) {
    try { target.mergeCells(merge); } catch (error) {
      console.warn("Could not copy workbook merge:", merge, error.message);
    }
  }
  if (source.autoFilter) target.autoFilter = structuredClone(source.autoFilter);
  if (source.dataValidations) target.dataValidations = structuredClone(source.dataValidations);
  return target;
}

function findOrCreateDailyWorksheet(workbook, date) {
  const [year, month, day] = date.split("-");
  const shortName = day + "," + month + "," + year.slice(-2);
  const longName = day + "," + month + "," + year;
  const existing = workbook.getWorksheet(shortName) || workbook.getWorksheet(longName);
  if (existing) return { worksheet: existing, created: false };

  const targetTime = Date.parse(date + "T00:00:00Z");
  const candidates = workbook.worksheets
    .map(worksheet => ({ worksheet, date: dateFromSheetName(worksheet.name) }))
    .filter(item => item.date)
    .sort((a, b) => {
      const aTime = Date.parse(a.date + "T00:00:00Z");
      const bTime = Date.parse(b.date + "T00:00:00Z");
      const aDistance = Math.abs(aTime - targetTime);
      const bDistance = Math.abs(bTime - targetTime);
      return aDistance - bDistance;
    });
  if (!candidates.length) {
    throw Object.assign(new Error("Shablonda nusxa olish uchun kunlik varaq topilmadi."), { status: 503 });
  }
  const source = candidates[0].worksheet;
  const worksheet = cloneDailyWorksheet(workbook, source, shortName);
  return { worksheet, created: true, source_sheet: source.name };
}

async function buildOfficialReport(date) {
  if (!validDate(date)) throw Object.assign(new Error("Hisobot sanasi YYYY-MM-DD ko'rinishida bo'lishi kerak."), { status: 400 });
  try { await stat(TEMPLATE_PATH); }
  catch { throw Object.assign(new Error("Rasmiy Excel shabloni hali yuklanmagan. Administrator avval .xlsx shablonni kabinetdan yuklashi kerak."), { status: 503 }); }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(TEMPLATE_PATH);
  const dailySheet = findOrCreateDailyWorksheet(workbook, date);
  const worksheet = dailySheet.worksheet;

  const result = await pool.query(
    "SELECT hour,point_key,h_value,q_value FROM observations WHERE observation_date=$1 ORDER BY hour,point_key",
    [date]
  );
  const entries = result.rows;
  for (const entry of entries) {
    const point = POINT_COLUMNS.find(item => item.key === entry.point_key);
    if (!point) continue;
    const row = Number(entry.hour) + 2;
    const hCell = worksheet.getCell(row, point.h);
    const hValue = Number(entry.h_value);
    const existingH = numericCellValue(hCell);
    if (hCell.value && typeof hCell.value === "object" && hCell.value.formula) {
      throw Object.assign(new Error("Excel " + hCell.address + " katagida formula bor; avtomatik almashtirish bloklandi."), { status: 409 });
    }
    if (existingH !== null && Math.abs(existingH - hValue) > 0.00005) {
      throw Object.assign(new Error("Excel " + hCell.address + " katagida bazadagi qiymatdan farqli qiymat mavjud. Hisobot xavfsizlik uchun to'xtatildi."), { status: 409 });
    }
    if (existingH === null) hCell.value = hValue;

    if (point.q !== null && entry.q_value !== null) {
      const qCell = worksheet.getCell(row, point.q);
      const qValue = Number(entry.q_value);
      const existingQ = numericCellValue(qCell);
      if (qCell.value && typeof qCell.value === "object" && qCell.value.formula) {
        throw Object.assign(new Error("Excel " + qCell.address + " katagida formula bor; avtomatik almashtirish bloklandi."), { status: 409 });
      }
      if (existingQ !== null && Math.abs(existingQ - qValue) > 0.00005) {
        throw Object.assign(new Error("Excel " + qCell.address + " katagida bazadagi qiymatdan farqli qiymat mavjud. Hisobot xavfsizlik uchun to'xtatildi."), { status: 409 });
      }
      if (existingQ === null) qCell.value = qValue;
    }
  }

  await mkdir(REPORT_DIR, { recursive: true });
  const fileName = "KAMK-soatli-kuzatuv-" + date + ".xlsx";
  const filePath = path.join(REPORT_DIR, fileName);
  const buffer = await workbook.xlsx.writeBuffer();
  await writeFile(filePath, Buffer.from(buffer));
  return {
    filePath,
    fileName,
    record_count: entries.length,
    worksheet: worksheet.name,
    worksheet_created: dailySheet.created,
    source_sheet: dailySheet.source_sheet || null
  };
}

async function sendReportToTelegram(filePath, fileName, date) {
  const token = process.env.TELEGRAM_BOT_TOKEN || "";
  const chatId = process.env.TELEGRAM_CHAT_ID || "";
  if (!token || !chatId) {
    throw Object.assign(new Error("Telegram bot tokeni yoki guruh chat ID server sozlamalarida yo'q."), { status: 503 });
  }
  const file = await readFile(filePath);
  const form = new FormData();
  form.set("chat_id", chatId);
  form.set("caption", "KAMK soatli kuzatuv hisoboti · " + date);
  form.set("document", new Blob([file], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  }), fileName);
  const response = await fetch("https://api.telegram.org/bot" + token + "/sendDocument", {
    method: "POST",
    body: form
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) {
    console.error("Telegram sendDocument failed:", response.status, payload);
    throw Object.assign(new Error("Telegram hisobotni qabul qilmadi. Botning guruhga qo'shilganini va chat ID ni tekshiring."), { status: 502 });
  }
  return payload.result?.message_id ?? null;
}

async function prepareTelegramReport(user, args) {
  const date = args?.observation_date;
  if (!validDate(date)) throw Object.assign(new Error("Hisobot sanasi noto'g'ri."), { status: 400 });
  const report = await buildOfficialReport(date);
  const id = randomUUID();
  await pool.query(
    "INSERT INTO pending_reports (id,dispatcher_id,observation_date,record_count,status) VALUES ($1,$2,$3,$4,'pending')",
    [id, user.sub, date, report.record_count]
  );
  await pool.query(
    "INSERT INTO audit_events (dispatcher_id,event_type,entity_id,payload) VALUES ($1,'telegram_report_prepared',$2,$3::jsonb)",
    [user.sub, id, JSON.stringify({ observation_date: date, record_count: report.record_count, file_name: report.fileName })]
  );
  return {
    report_id: id,
    status: "pending_confirmation",
    observation_date: date,
    file_name: report.fileName,
    worksheet: report.worksheet,
    record_count: report.record_count,
    requires_explicit_confirmation: true,
    message: "Excel hisoboti tayyor, ammo Telegramga hali yuborilmadi. Dispetcher aniq tasdiqlashi kerak."
  };
}

async function confirmTelegramReport(user, args) {
  const reportId = String(args?.report_id || "");
  if (!/^[0-9a-f-]{36}$/i.test(reportId)) {
    throw Object.assign(new Error("Hisobot identifikatori noto'g'ri."), { status: 400 });
  }
  const client = await pool.connect();
  let pending;
  try {
    await client.query("BEGIN");
    const selected = await client.query(
      "SELECT id,observation_date,record_count,status FROM pending_reports WHERE id=$1 AND dispatcher_id=$2 FOR UPDATE",
      [reportId, user.sub]
    );
    pending = selected.rows[0];
    if (!pending || pending.status !== "pending") {
      await client.query("ROLLBACK");
      throw Object.assign(new Error("Tasdiqlanadigan hisobot topilmadi yoki u allaqachon yuborilgan."), { status: 404 });
    }
    await client.query("UPDATE pending_reports SET status='sending' WHERE id=$1", [reportId]);
    await client.query("COMMIT");
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally {
    client.release();
  }

  try {
    const report = await buildOfficialReport(String(pending.observation_date).slice(0, 10));
    if (report.record_count !== Number(pending.record_count)) {
      await pool.query("UPDATE pending_reports SET status='expired' WHERE id=$1", [reportId]);
      throw Object.assign(new Error("Hisobot tayyorlanganidan keyin yozuvlar o'zgargan. Yangi hisobot tayyorlab, qayta tasdiqlang."), { status: 409 });
    }
    const messageId = await sendReportToTelegram(report.filePath, report.fileName, String(pending.observation_date).slice(0, 10));
    await pool.query(
      "UPDATE pending_reports SET status='sent',sent_at=NOW(),telegram_message_id=$2 WHERE id=$1",
      [reportId, messageId]
    );
    await pool.query(
      "INSERT INTO audit_events (dispatcher_id,event_type,entity_id,payload) VALUES ($1,'telegram_report_sent',$2,$3::jsonb)",
      [user.sub, reportId, JSON.stringify({ observation_date: pending.observation_date, telegram_message_id: messageId })]
    );
    return {
      status: "sent",
      observation_date: String(pending.observation_date).slice(0, 10),
      telegram_message_id: messageId,
      record_count: report.record_count
    };
  } catch (error) {
    await pool.query("UPDATE pending_reports SET status='failed' WHERE id=$1 AND status='sending'", [reportId]).catch(() => {});
    throw error;
  }
}

app.get("/api/reports/export/:date", requireAuth, async (req, res, next) => {
  try {
    const report = await buildOfficialReport(req.params.date);
    res.download(report.filePath, report.fileName);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    next(error);
  }
});

app.get("/api/realtime/token", requireAuth, async (req, res) => {
  const safetyIdentifier = createHash("sha256").update(String(req.user.sub)).digest("hex");
  const dateParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tashkent", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(new Date());
  const dateFields = Object.fromEntries(dateParts.map(part => [part.type, part.value]));
  const todayDate = dateFields.year + "-" + dateFields.month + "-" + dateFields.day;
  const instructions = AGENT_INSTRUCTIONS
    .replace("{{dispatcher_name}}", String(req.user.display_name || req.user.username))
    .replace("{{role}}", String(req.user.role))
    .replace("{{today_date}}", todayDate);

  const session = {
    type: "realtime",
    model: process.env.OPENAI_REALTIME_MODEL || "gpt-realtime-2.1",
    instructions,
    audio: {
      input: {
        noise_reduction: { type: "near_field" },
        transcription: { model: "gpt-4o-mini-transcribe", language: "uz" },
        turn_detection: {
          type: "server_vad",
          threshold: 0.55,
          prefix_padding_ms: 350,
          silence_duration_ms: 650,
          create_response: true,
          interrupt_response: true
        }
      },
      output: { voice: "marin" }
    },
    tools: toolDefinitions,
    tool_choice: "auto"
  };

  try {
    const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
        "OpenAI-Safety-Identifier": safetyIdentifier
      },
      body: JSON.stringify({
        expires_after: { anchor: "created_at", seconds: 600 },
        session
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("Realtime client secret creation failed:", response.status, payload);
      return res.status(502).json({ error: "Realtime sessiyasini ochib bo'lmadi. API sozlamalarini tekshiring." });
    }
    res.set("Cache-Control", "no-store, max-age=0");
    res.json({ value: payload.value, expires_at: payload.expires_at, session: payload.session });
  } catch (error) {
    console.error("Realtime token endpoint error:", error);
    res.status(502).json({ error: "OpenAI Realtime xizmatiga ulanib bo'lmadi." });
  }
});

async function prepareBatch(user, args) {
  const date = args?.observation_date;
  const hour = Number(args?.hour);
  const readings = args?.readings;
  if (!validDate(date) || !Number.isInteger(hour) || hour < 1 || hour > 24
      || !Array.isArray(readings) || readings.length < 1 || readings.length > 7) {
    throw Object.assign(new Error("Sana, soat yoki kuzatuvlar ro'yxati noto'g'ri."), { status: 400 });
  }
  const seen = new Set();
  const clean = [];
  for (const reading of readings) {
    const point = POINTS[reading?.point_key];
    const h = Number(reading?.h_value);
    const q = reading?.q_value === null ? null : Number(reading?.q_value);
    if (!point || seen.has(reading.point_key) || !Number.isFinite(h) || h < 0
        || (point.hasQ && (q === null || !Number.isFinite(q) || q < 0))
        || (!point.hasQ && q !== null)) {
      throw Object.assign(new Error("Punkt, H yoki Q qiymati noto'g'ri. H/Q ustunlari qoidalarini tekshiring."), { status: 400 });
    }
    seen.add(reading.point_key);
    clean.push({ point_key: reading.point_key, point_title: point.title, h_value: h, q_value: q });
  }

  const existing = await pool.query(
    "SELECT point_key, h_value, q_value, dispatcher_id FROM observations WHERE observation_date=$1 AND hour=$2 AND point_key=ANY($3::text[])",
    [date, hour, clean.map(x => x.point_key)]
  );
  if (existing.rowCount) {
    const details = existing.rows.map(row => ({
      point_key: row.point_key,
      existing_h: Number(row.h_value),
      existing_q: row.q_value === null ? null : Number(row.q_value),
      owned_by_current_dispatcher: row.dispatcher_id === user.sub
    }));
    throw Object.assign(new Error("Bu soat va punkt uchun yozuv mavjud. Ustiga avtomatik yozilmadi; correction workflow kerak."), {
      status: 409,
      details
    });
  }

  const id = randomUUID();
  await pool.query(
    "INSERT INTO pending_batches (id, dispatcher_id, observation_date, hour, readings, status) VALUES ($1,$2,$3,$4,$5::jsonb,'pending')",
    [id, user.sub, date, hour, JSON.stringify(clean)]
  );
  await pool.query(
    "INSERT INTO audit_events (dispatcher_id,event_type,entity_id,payload) VALUES ($1,'batch_prepared',$2,$3::jsonb)",
    [user.sub, id, JSON.stringify({ observation_date: date, hour, readings: clean })]
  );
  return {
    batch_id: id,
    status: "pending_confirmation",
    observation_date: date,
    hour,
    readings: clean,
    requires_explicit_confirmation: true,
    message: "Yozuv hali saqlanmadi. Dispetcher qiymatlarni eshitib aniq tasdiqlashi kerak."
  };
}

async function confirmBatch(user, args) {
  const batchId = String(args?.batch_id || "");
  if (!/^[0-9a-f-]{36}$/i.test(batchId)) {
    throw Object.assign(new Error("Batch identifikatori noto'g'ri."), { status: 400 });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const pending = await client.query(
      "SELECT id, observation_date, hour, readings, status FROM pending_batches WHERE id=$1 AND dispatcher_id=$2 FOR UPDATE",
      [batchId, user.sub]
    );
    const batch = pending.rows[0];
    if (!batch || batch.status !== "pending") {
      await client.query("ROLLBACK");
      throw Object.assign(new Error("Tasdiqlanadigan faol yozuv topilmadi yoki u allaqachon qayta ishlangan."), { status: 404 });
    }
    const readings = batch.readings;
    for (const reading of readings) {
      await client.query(
        "INSERT INTO observations (id, observation_date, hour, point_key, h_value, q_value, dispatcher_id) VALUES ($1,$2,$3,$4,$5,$6,$7)",
        [randomUUID(), batch.observation_date, batch.hour, reading.point_key, reading.h_value, reading.q_value, user.sub]
      );
    }
    await client.query("UPDATE pending_batches SET status='confirmed', confirmed_at=NOW() WHERE id=$1", [batchId]);
    await client.query(
      "INSERT INTO audit_events (dispatcher_id,event_type,entity_id,payload) VALUES ($1,'batch_confirmed',$2,$3::jsonb)",
      [user.sub, batchId, JSON.stringify({ observation_date: batch.observation_date, hour: batch.hour, readings })]
    );
    await client.query("COMMIT");
    return {
      status: "saved",
      saved_count: readings.length,
      observation_date: batch.observation_date,
      hour: batch.hour,
      readings
    };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    if (error.code === "23505") {
      throw Object.assign(new Error("Boshqa dispetcher shu punkt va soat uchun oldin yozib bo'lgan. Hech qanday ustiga yozish bajarilmadi."), { status: 409 });
    }
    throw error;
  } finally {
    client.release();
  }
}

async function getObservations(user, args) {
  const date = args?.observation_date;
  const hour = args?.hour === null ? null : Number(args.hour);
  const pointKey = args?.point_key === null ? null : args.point_key;
  if (!validDate(date) || (hour !== null && (!Number.isInteger(hour) || hour < 1 || hour > 24))
      || (pointKey !== null && !POINTS[pointKey])) {
    throw Object.assign(new Error("Kuzatuv qidirish parametrlari noto'g'ri."), { status: 400 });
  }
  const result = await pool.query(
    `SELECT o.observation_date, o.hour, o.point_key, o.h_value, o.q_value,
            d.display_name AS dispatcher_name, o.created_at, o.updated_at
       FROM observations o JOIN dispatchers d ON d.id=o.dispatcher_id
      WHERE o.observation_date=$1
        AND ($2::smallint IS NULL OR o.hour=$2)
        AND ($3::text IS NULL OR o.point_key=$3)
      ORDER BY o.hour, o.point_key`,
    [date, hour, pointKey]
  );
  return {
    observation_date: date,
    count: result.rowCount,
    observations: result.rows.map(row => ({
      ...row,
      hour: Number(row.hour),
      h_value: Number(row.h_value),
      q_value: row.q_value === null ? null : Number(row.q_value),
      point_title: POINTS[row.point_key].title
    }))
  };
}

app.post("/api/agent/execute", requireAuth, async (req, res, next) => {
  try {
    const name = String(req.body?.name || "");
    const args = req.body?.arguments || {};
    let result;
    if (name === "prepare_observation_batch") result = await prepareBatch(req.user, args);
    else if (name === "confirm_observation_batch") result = await confirmBatch(req.user, args);
    else if (name === "get_observations") result = await getObservations(req.user, args);
    else if (name === "prepare_telegram_report") result = await prepareTelegramReport(req.user, args);
    else if (name === "confirm_telegram_report") result = await confirmTelegramReport(req.user, args);
    else return res.status(400).json({ error: "Noma'lum AI amali." });
    res.json({ ok: true, result });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ ok: false, error: error.message, details: error.details || null });
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  console.error("Unhandled API error:", error);
  res.status(500).json({ error: "Server ichki xatosi." });
});

async function start() {
  await initializeDatabase();
  const server = app.listen(PORT, () => console.log(`KAMK Dispatcher API listening on ${PORT}`));

  if (process.env.REPORT_SCHEDULE_ENABLED === "true") {
    cron.schedule("0 */2 * * *", async () => {
      const now = new Date();
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Tashkent", year: "numeric", month: "2-digit", day: "2-digit"
      }).formatToParts(now);
      const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
      const date = value.year + "-" + value.month + "-" + value.day;
      const hour = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Tashkent", hour: "2-digit", hourCycle: "h23"
      }).format(now);
      const slotKey = date + "T" + hour + ":00";
      const claimed = await pool.query(
        "INSERT INTO scheduled_report_runs (slot_key,observation_date,status) VALUES ($1,$2,'started') ON CONFLICT (slot_key) DO NOTHING RETURNING slot_key",
        [slotKey, date]
      );
      if (!claimed.rowCount) return;
      try {
        const report = await buildOfficialReport(date);
        const messageId = await sendReportToTelegram(report.filePath, report.fileName, date);
        await pool.query(
          "UPDATE scheduled_report_runs SET status='sent',telegram_message_id=$2,completed_at=NOW() WHERE slot_key=$1",
          [slotKey, messageId]
        );
        console.log("Scheduled KAMK report sent:", slotKey, messageId);
      } catch (error) {
        console.error("Scheduled KAMK report failed:", slotKey, error);
        await pool.query(
          "UPDATE scheduled_report_runs SET status='failed',error_message=$2,completed_at=NOW() WHERE slot_key=$1",
          [slotKey, String(error.message || error).slice(0, 1000)]
        ).catch(() => {});
      }
    }, { timezone: "Asia/Tashkent" });
  }

  const shutdown = async () => {
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

start().catch((error) => {
  console.error("Backend startup failed:", error);
  process.exit(1);
});
