/**
 * The Future Compass - Backend (Google Apps Script Web App)
 * Script Properties required:
 * - SHEET_ID
 * Optional:
 * - LINE_CHANNEL_ACCESS_TOKEN
 */

const SHEET_NAME = "Sheet1";
const INDEX_SHEET_LAST = "LastAttemptIndex";
const INDEX_SHEET_SESS = "SessionIndex";

let _ss = null, _shMain = null, _shLast = null, _shSess = null;

/* =========================
 * Entry points
 * ========================= */
function doGet() {
  return ContentService.createTextOutput("OK The Future Compass WebApp")
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

      // OA push (do NOT break logging)
      try { sendResultViaOA_(data, used); } catch (err) { console.log("OA send failed:", err); }

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
 * Properties
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
 * Health check
 * ========================= */
function healthCheck_() {
  const report = {
    sheetIdPresent: false,
    sheetOpenOk: false,
    sheetName: SHEET_NAME,
    headerOk: false,
    indexLastOk: false,
    indexSessOk: false,
    lineTokenPresent: false,
    errors: []
  };

  try {
    const sheetId = getRequiredProp_("SHEET_ID");
    report.sheetIdPresent = true;

    const ss = SpreadsheetApp.openById(sheetId);
    report.sheetOpenOk = true;

    const sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
    ensureHeaderMain_(sh);
    report.headerOk = true;

    const shLast = ss.getSheetByName(INDEX_SHEET_LAST) || ss.insertSheet(INDEX_SHEET_LAST);
    ensureHeaderLast_(shLast);
    report.indexLastOk = true;

    const shSess = ss.getSheetByName(INDEX_SHEET_SESS) || ss.insertSheet(INDEX_SHEET_SESS);
    ensureHeaderSess_(shSess);
    report.indexSessOk = true;
  } catch (e) {
    report.errors.push("Sheet error: " + asErrMsg_(e));
  }

  try {
    const token = getOptionalProp_("LINE_CHANNEL_ACCESS_TOKEN");
    report.lineTokenPresent = !!token;
  } catch (e) {
    report.errors.push("Token error: " + asErrMsg_(e));
  }

  return report;
}

/* =========================
 * Sheet getters (cached per execution)
 * ========================= */
function getSpreadsheet_() {
  if (_ss) return _ss;
  const sheetId = getRequiredProp_("SHEET_ID");
  _ss = SpreadsheetApp.openById(sheetId);
  return _ss;
}

function getMainSheet_() {
  if (_shMain) return _shMain;
  const ss = getSpreadsheet_();
  _shMain = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  ensureHeaderMain_(_shMain);
  return _shMain;
}

function getLastIndexSheet_() {
  if (_shLast) return _shLast;
  const ss = getSpreadsheet_();
  _shLast = ss.getSheetByName(INDEX_SHEET_LAST) || ss.insertSheet(INDEX_SHEET_LAST);
  ensureHeaderLast_(_shLast);
  return _shLast;
}

function getSessIndexSheet_() {
  if (_shSess) return _shSess;
  const ss = getSpreadsheet_();
  _shSess = ss.getSheetByName(INDEX_SHEET_SESS) || ss.insertSheet(INDEX_SHEET_SESS);
  ensureHeaderSess_(_shSess);
  return _shSess;
}

/* =========================
 * Headers
 * ========================= */
function ensureHeaderMain_(sh) {
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

function ensureHeaderLast_(sh) {
  if (sh.getLastRow() === 0) {
    sh.appendRow([
      "userId",
      "mainRowNum",
      "tsServer",
      "sessionCode",
      "certificateClick",
      "certificateClickAt",
      "name", "age", "gender",
      "resultType", "resultTH", "resultEN"
    ]);
  }
}

function ensureHeaderSess_(sh) {
  if (sh.getLastRow() === 0) {
    sh.appendRow([
      "sessionCode",
      "mainRowNum",
      "tsServer"
    ]);
  }
}

/* =========================
 * Session unique (fast via SessionIndex + cache, fallback to main scan)
 * ========================= */
function genSessionCode_() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function sessionExists_(code) {
  const norm = String(code || "").trim();
  if (!norm) return false;

  const cache = CacheService.getScriptCache();
  const key = ("tfc_sess_" + norm).toLowerCase();

  const cached = cache.get(key);
  if (cached === "1") return true;

  // 1) Fast lookup from SessionIndex
  const shSess = getSessIndexSheet_();
  const last = shSess.getLastRow();
  if (last >= 2) {
    const found = shSess.getRange(2, 1, last - 1, 1)
      .createTextFinder(norm).matchEntireCell(true).findNext();
    if (found) {
      cache.put(key, "1", 60 * 60);
      return true;
    }
  }

  // 2) Fallback: scan main sheet (only if SessionIndex doesn't have old data)
  const sh = getMainSheet_();
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return false;

  const foundMain = sh.getRange(2, 2, lastRow - 1, 1)
    .createTextFinder(norm).matchEntireCell(true).findNext();

  const exists = !!foundMain;
  if (exists) {
    cache.put(key, "1", 60 * 60);
    // backfill SessionIndex (best effort)
    try {
      const rowNum = foundMain.getRow();
      shSess.appendRow([norm, rowNum, new Date()]);
    } catch (_) {}
  }
  return exists;
}

function reserveSessionCode_() {
  const lock = LockService.getScriptLock();
  lock.waitLock(8000);
  try {
    for (let i = 0; i < 80; i++) {
      const code = genSessionCode_();
      if (!sessionExists_(code)) {
        CacheService.getScriptCache().put(("tfc_sess_" + code).toLowerCase(), "1", 60 * 60);
        return code;
      }
    }
    const fallback = "X" + String(Date.now()).slice(-4);
    CacheService.getScriptCache().put(("tfc_sess_" + fallback).toLowerCase(), "1", 60 * 60);
    return fallback;
  } finally {
    lock.releaseLock();
  }
}

/* =========================
 * Append quiz (also update indexes)
 * ========================= */
function appendQuizRow_(d) {
  const lock = LockService.getScriptLock();
  lock.waitLock(8000);
  try {
    const sh = getMainSheet_();
    const shSess = getSessIndexSheet_();

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

    const mainRowNum = sh.getLastRow();

    // Update SessionIndex (append-only)
    try { shSess.appendRow([code, mainRowNum, new Date()]); } catch (_) {}

    // Cache session exists
    CacheService.getScriptCache().put(("tfc_sess_" + code).toLowerCase(), "1", 60 * 60);

    // Update LastAttemptIndex (upsert)
    try { upsertLastAttemptIndex_(d, code, mainRowNum); } catch (e) { console.log("upsertLastAttemptIndex failed:", e); }

    return code;
  } finally {
    lock.releaseLock();
  }
}

/* =========================
 * Certificate click mark (fast path using userId->rowNum index)
 * ========================= */
function markCertificateClick_(d) {
  const code = String(d.sessionCode || "").trim();
  if (!code) throw new Error("Missing sessionCode");

  const lock = LockService.getScriptLock();
  lock.waitLock(8000);
  try {
    const sh = getMainSheet_();

    // 1) Fast path: if userId exists and index has rowNum, update directly
    const userId = String(d.userId || "").trim();
    if (userId) {
      const idx = getLastAttemptByUserId_(userId);
      const rowNum = Number(idx && idx.mainRowNum);
      if (rowNum && rowNum >= 2) {
        // ensure it matches sessionCode to be safe
        const sessCell = String(sh.getRange(rowNum, 2).getValue() || "").trim();
        if (sessCell === code) {
          sh.getRange(rowNum, 3).setValue(1);
          sh.getRange(rowNum, 4).setValue(new Date());
          // also update index + cache
          try { upsertLastAttemptIndex_(d, code, rowNum, { cert: true }); } catch (_) {}
          return code;
        }
      }
    }

    // 2) Fallback: scan by sessionCode (old behavior)
    const lastRow = sh.getLastRow();
    if (lastRow < 2) throw new Error("Sheet is empty");

    const values = sh.getRange(2, 2, lastRow - 1, 1).getValues();
    let foundRow = -1;
    for (let i = values.length - 1; i >= 0; i--) {
      if (String(values[i][0]).trim() === code) { foundRow = i + 2; break; }
    }
    if (foundRow === -1) throw new Error("sessionCode not found: " + code);

    sh.getRange(foundRow, 3).setValue(1);
    sh.getRange(foundRow, 4).setValue(new Date());

    // best-effort update index by userId
    try { if (userId) upsertLastAttemptIndex_(d, code, foundRow, { cert: true }); } catch (_) {}

    return code;
  } finally {
    lock.releaseLock();
  }
}

/* =========================
 * Last attempt index (FAST)
 * ========================= */
function getLastAttemptByUserId_(userId) {
  const uid = String(userId || "").trim();
  if (!uid) return null;

  // cache
  const cache = CacheService.getScriptCache();
  const key = ("tfc_last_" + uid).toLowerCase();
  const cached = cache.get(key);
  if (cached) {
    try { return JSON.parse(cached); } catch (_) {}
  }

  const shLast = getLastIndexSheet_();
  const last = shLast.getLastRow();
  if (last < 2) return null;

  const found = shLast.getRange(2, 1, last - 1, 1)
    .createTextFinder(uid).matchEntireCell(true).findNext();
  if (!found) return null;

  const r = found.getRow();
  const row = shLast.getRange(r, 1, 1, 12).getValues()[0];

  const rec = {
    userId: row[0],
    mainRowNum: row[1],
    tsServer: row[2],
    sessionCode: row[3],
    certificateClick: row[4],
    certificateClickAt: row[5],
    name: row[6],
    age: row[7],
    gender: row[8],
    resultType: row[9],
    resultTH: row[10],
    resultEN: row[11],
  };

  cache.put(key, JSON.stringify(rec), 10 * 60); // 10 minutes
  return rec;
}

function upsertLastAttemptIndex_(d, sessionCode, mainRowNum, opts) {
  const o = opts || {};
  const userId = String(d.userId || "").trim();
  if (!userId) return;

  const shLast = getLastIndexSheet_();
  const last = shLast.getLastRow();

  const now = new Date();
  const rec = [
    userId,
    Number(mainRowNum || 0) || "",
    now,
    String(sessionCode || "").trim(),
    o.cert ? 1 : Number(d.certificateClick || 0),
    o.cert ? now : "",
    d.name || "",
    d.age || "",
    d.gender || "",
    d.resultType || "",
    d.resultTH || "",
    d.resultEN || "",
  ];

  let foundRow = -1;
  if (last >= 2) {
    const found = shLast.getRange(2, 1, last - 1, 1)
      .createTextFinder(userId).matchEntireCell(true).findNext();
    if (found) foundRow = found.getRow();
  }

  if (foundRow === -1) shLast.appendRow(rec);
  else shLast.getRange(foundRow, 1, 1, 12).setValues([rec]);

  // update cache
  CacheService.getScriptCache().put(("tfc_last_" + userId).toLowerCase(), JSON.stringify({
    userId,
    mainRowNum: rec[1],
    tsServer: rec[2],
    sessionCode: rec[3],
    certificateClick: rec[4],
    certificateClickAt: rec[5],
    name: rec[6],
    age: rec[7],
    gender: rec[8],
    resultType: rec[9],
    resultTH: rec[10],
    resultEN: rec[11],
  }), 10 * 60);
}

/* =========================
 * OA Push (unchanged, just safer)
 * ========================= */
function getLineToken_() {
  return getOptionalProp_("LINE_CHANNEL_ACCESS_TOKEN");
}

function sendResultViaOA_(d, sessionCode) {
  const token = getLineToken_();
  if (!token) return;

  const userId = String(d.userId || "").trim();
  if (!userId) return;

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
        `อยากรับเกียรติบัตร 🏆 กลับไปที่หน้าเกม แล้วกด “รับเกียรติบัตร” ได้เลยครับ`
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
          resultEN ? { type: "text", text: resultEN, size: "sm", color: "#64748b", wrap: true } : { type: "spacer", size: "xs" },
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
  if (code < 200 || code >= 300) throw new Error("LINE push failed: HTTP " + code + " " + res.getContentText());
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
  } catch (_) {
    return "Unknown error";
  }
}