/**
 * The Future Compass - Backend (Google Apps Script Web App)
 * Requires Script Properties:
 * - SHEET_ID (required)
 * - LINE_CHANNEL_ACCESS_TOKEN (optional; required only if you want OA push)
 */

const SHEET_NAME = "Sheet1";

/* =========================
 * Entry points
 * ========================= */
function doGet(e) {
  // Quick verify the webapp is alive
  return ContentService
    .createTextOutput("OK The Future Compass WebApp")
    .setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  try {
    const body = JSON.parse((e.postData && e.postData.contents) || "{}");
    const action = String(body.action || "").trim();
    const data = body.data || {};

    if (!action) return json_({ status: "error", message: "Missing action" });

    if (action === "health") {
      const report = healthCheck_();
      return json_({ status: "ok", report, now: new Date().toISOString() });
    }

    if (action === "reserve_session") {
      const code = reserveSessionCode_();
      return json_({ status: "ok", sessionCode: code });
    }

    if (action === "session_exists") {
      const code = String(data.sessionCode || "").trim();
      const exists = code ? sessionExists_(code) : false;
      return json_({ status: "ok", exists });
    }

    if (action === "quiz_complete") {
      const used = appendQuizRow_(data);

      // OA push: do NOT break sheet logging
      try {
        sendResultViaOA_(data, used);
      } catch (err) {
        console.log("OA send failed:", err);
      }

      return json_({ status: "ok", sessionCode: used });
    }

    if (action === "certificate_click") {
      const used = markCertificateClick_(data);
      return json_({ status: "ok", sessionCode: used });
    }

    if (action === "get_last_attempt") {
      const userId = String(data.userId || "").trim();
      const rec = userId ? getLastAttemptByUserId_(userId) : null;
      return json_({ status: "ok", found: !!rec, record: rec });
    }

    return json_({ status: "error", message: "Unknown action: " + action });
  } catch (err) {
    return json_({ status: "error", message: asErrMsg_(err) });
  }
}

/* =========================
 * Properties helpers
 * ========================= */
function getRequiredProp_(key) {
  const v = PropertiesService.getScriptProperties().getProperty(key);
  const s = String(v || "").trim();
  if (!s) throw new Error(`Missing Script Property: ${key}`);
  return s;
}

function getOptionalProp_(key) {
  const v = PropertiesService.getScriptProperties().getProperty(key);
  const s = String(v || "").trim();
  return s || "";
}

/* =========================
 * Health check / Setup
 * ========================= */
function healthCheck_() {
  const report = {
    sheetIdPresent: false,
    sheetOpenOk: false,
    sheetName: SHEET_NAME,
    headerOk: false,
    lineTokenPresent: false,
    errors: []
  };

  // Check sheet property
  try {
    const sheetId = getRequiredProp_("SHEET_ID");
    report.sheetIdPresent = true;

    const ss = SpreadsheetApp.openById(sheetId);
    report.sheetOpenOk = true;

    const sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
    ensureHeader_(sh);
    report.headerOk = true;
  } catch (e) {
    report.errors.push("Sheet error: " + asErrMsg_(e));
  }

  // Token is optional
  try {
    const token = getOptionalProp_("LINE_CHANNEL_ACCESS_TOKEN");
    report.lineTokenPresent = !!token;
  } catch (e) {
    report.errors.push("Token error: " + asErrMsg_(e));
  }

  return report;
}

/**
 * Run manually once if you want:
 * - creates header
 * - prints a health report in logs
 */
function setUp_() {
  const r = healthCheck_();
  console.log(JSON.stringify(r, null, 2));
}

/* =========================
 * Sheet helpers
 * ========================= */
function getSheet_() {
  const sheetId = getRequiredProp_("SHEET_ID"); // required
  const ss = SpreadsheetApp.openById(sheetId);
  const sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  ensureHeader_(sh);
  return sh;
}

function ensureHeader_(sh) {
  if (sh.getLastRow() === 0) {
    sh.appendRow([
      "tsServer",
      "sessionCode",
      "certificateClick",
      "certificateClickAt",
      "name", "age", "gender",
      "a1", "a2", "a3", "a4", "a5",
      "resultType", "resultTH", "resultEN",
      "userId",
      "profileJson", "liffJson", "clientJson", "answersJson"
    ]);
  }
}

/* =========================
 * Session unique
 * ========================= */
function genSessionCode_() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function sessionExists_(code) {
  const key = ("tfc_sess_" + code).toLowerCase();
  const cache = CacheService.getScriptCache();
  const cached = cache.get(key);
  if (cached === "1") return true;

  const sh = getSheet_();
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return false;

  // sessionCode is column 2
  const rng = sh.getRange(2, 2, lastRow - 1, 1);
  const found = rng.createTextFinder(code).matchEntireCell(true).findNext();
  const exists = !!found;

  if (exists) cache.put(key, "1", 60 * 60); // 1 hour cache
  return exists;
}

function reserveSessionCode_() {
  const lock = LockService.getScriptLock();
  lock.waitLock(8000);
  try {
    for (let i = 0; i < 60; i++) {
      const code = genSessionCode_();
      if (!sessionExists_(code)) {
        // cache it to reduce repeated scans
        CacheService.getScriptCache().put(("tfc_sess_" + code).toLowerCase(), "1", 60 * 60);
        return code;
      }
    }
    // fallback very low collision
    const fallback = "X" + String(Date.now()).slice(-4);
    CacheService.getScriptCache().put(("tfc_sess_" + fallback).toLowerCase(), "1", 60 * 60);
    return fallback;
  } finally {
    lock.releaseLock();
  }
}

/* =========================
 * Append quiz
 * ========================= */
function appendQuizRow_(d) {
  const lock = LockService.getScriptLock();
  lock.waitLock(8000);
  try {
    const sh = getSheet_();

    let code = String(d.sessionCode || "").trim();
    if (!code || sessionExists_(code)) code = reserveSessionCode_();

    sh.appendRow([
      new Date(),
      code,
      Number(d.certificateClick || 0),
      "",

      d.name || "",
      d.age || "",
      d.gender || "",

      (d.answers && d.answers[0]) || "",
      (d.answers && d.answers[1]) || "",
      (d.answers && d.answers[2]) || "",
      (d.answers && d.answers[3]) || "",
      (d.answers && d.answers[4]) || "",

      d.resultType || "",
      d.resultTH || "",
      d.resultEN || "",

      String(d.userId || ""),

      JSON.stringify(d.profile || null),
      JSON.stringify(d.liffInfo || {}),
      JSON.stringify(d.client || {}),
      JSON.stringify(d.answers || [])
    ]);

    // cache as existing
    CacheService.getScriptCache().put(("tfc_sess_" + code).toLowerCase(), "1", 60 * 60);
    return code;
  } finally {
    lock.releaseLock();
  }
}

/* =========================
 * Certificate click mark
 * ========================= */
function markCertificateClick_(d) {
  const code = String(d.sessionCode || "").trim();
  if (!code) throw new Error("Missing sessionCode");

  const lock = LockService.getScriptLock();
  lock.waitLock(8000);
  try {
    const sh = getSheet_();
    const lastRow = sh.getLastRow();
    if (lastRow < 2) throw new Error("Sheet is empty");

    const colSession = 2;
    const colCert = 3;
    const colCertAt = 4;

    const values = sh.getRange(2, colSession, lastRow - 1, 1).getValues();
    let foundRow = -1;
    for (let i = values.length - 1; i >= 0; i--) {
      if (String(values[i][0]).trim() === code) {
        foundRow = i + 2;
        break;
      }
    }
    if (foundRow === -1) throw new Error("sessionCode not found: " + code);

    sh.getRange(foundRow, colCert).setValue(1);
    sh.getRange(foundRow, colCertAt).setValue(new Date());
    return code;
  } finally {
    lock.releaseLock();
  }
}

/* =========================
 * OA Push Message (Channel Access Token)
 * ========================= */
function getLineToken_() {
  const token = getOptionalProp_("LINE_CHANNEL_ACCESS_TOKEN"); // optional
  if (!token) return ""; // allow sheet logging even without token
  return token;
}

function sendResultViaOA_(d, sessionCode) {
  const token = getLineToken_();
  if (!token) {
    console.log("No LINE_CHANNEL_ACCESS_TOKEN; skip OA push");
    return;
  }

  const userId = String(d.userId || "").trim();
  if (!userId) {
    console.log("No userId; skip OA push");
    return;
  }

  const name = d.name || "เพื่อนใหม่";
  const resultTH = d.resultTH || "ผลลัพธ์ของคุณ";
  const resultEN = d.resultEN || "";
  const emoji = pickEmojiByType_(d.resultType);

  const msgFlex = buildResultFlex_(name, resultTH, resultEN, emoji, sessionCode);

  pushLine_(token, userId, [
    msgFlex,
    {
      type: "text",
      text:
        `ขอบคุณที่ร่วมสนุกนะครับ 😊\n` +
        `ถ้าอยากรับเกียรติบัตร 🏆 ให้กลับไปที่หน้าเกม แล้วกดปุ่ม “รับเกียรติบัตร” ได้เลยครับ`
    }
  ]);
}

function pickEmojiByType_(type) {
  const t = String(type || "");
  if (t === "SCIENTIST") return "🔬";
  if (t === "DATA") return "💻";
  if (t === "HEALER") return "❤️";
  if (t === "CREATIVE") return "🎨";
  return "✨";
}

function buildResultFlex_(name, resultTH, resultEN, emoji, sessionCode) {
  const alt = `ผลลัพธ์ของคุณคือ: ${resultTH}`;

  return {
    type: "flex",
    altText: alt,
    contents: {
      type: "bubble",
      size: "mega",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          { type: "text", text: "The Future Compass 🧭", weight: "bold", size: "lg" },
          { type: "text", text: `สวัสดี ${name} 😊`, size: "md", wrap: true },

          { type: "text", text: "คุณคือ", size: "sm", weight: "bold", color: "#0f766e", wrap: true },

          {
            type: "box",
            layout: "baseline",
            spacing: "sm",
            contents: [
              { type: "text", text: emoji, size: "xl", flex: 0 },
              { type: "text", text: resultTH, weight: "bold", size: "xl", wrap: true }
            ]
          },
          resultEN
            ? { type: "text", text: resultEN, size: "sm", color: "#64748b", wrap: true }
            : { type: "spacer", size: "xs" },
          {
            type: "box",
            layout: "vertical",
            spacing: "xs",
            contents: [
              { type: "text", text: "ขอบคุณที่ร่วมสนุกนะครับ ✨", size: "sm", color: "#334155", wrap: true },
              { type: "text", text: `Session: ${sessionCode}`, size: "xs", color: "#94a3b8", wrap: true }
            ]
          }
        ]
      }
    }
  };
}

function pushLine_(token, to, messages) {
  const url = "https://api.line.me/v2/bot/message/push";
  const payload = JSON.stringify({ to, messages });

  const res = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    payload,
    muteHttpExceptions: true,
    headers: { Authorization: "Bearer " + token }
  });

  const code = res.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error("LINE push failed: HTTP " + code + " " + res.getContentText());
  }
}

/* =========================
 * Utils
 * ========================= */
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function asErrMsg_(err) {
  try {
    if (!err) return "Unknown error";
    if (typeof err === "string") return err;
    if (err.message) return err.message;
    return JSON.stringify(err);
  } catch (e) {
    return "Unknown error";
  }
}

function getLastAttemptByUserId_(userId) {
  const sh = getSheet_();
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return null;

  const COL_USERID = 16; // ตาม header: userId อยู่คอลัมน์ที่ 16
  const userVals = sh.getRange(2, COL_USERID, lastRow - 1, 1).getValues();

  // หาแถวล่าสุดจากล่างขึ้นบน
  let foundRow = -1;
  for (let i = userVals.length - 1; i >= 0; i--) {
    if (String(userVals[i][0] || "").trim() === userId) {
      foundRow = i + 2;
      break;
    }
  }
  if (foundRow === -1) return null;

  // อ่านเฉพาะคอลัมน์สำคัญ (1..16 พอ)
  const row = sh.getRange(foundRow, 1, 1, 16).getValues()[0];

  return {
    tsServer: row[0],
    sessionCode: row[1],
    certificateClick: row[2],
    certificateClickAt: row[3],
    name: row[4],
    age: row[5],
    gender: row[6],
    resultType: row[12],
    resultTH: row[13],
    resultEN: row[14],
    userId: row[15],
  };
}