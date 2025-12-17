function doPost(e) {
  try {
    const body = JSON.parse((e.postData && e.postData.contents) || "{}");
    const action = body.action;
    const data = body.data || {};

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
      return json_({ status: "ok", sessionCode: used });
    }

    if (action === "certificate_click") {
      const used = markCertificateClick_(data);
      return json_({ status: "ok", sessionCode: used });
    }

    return json_({ status: "error", message: "Unknown action: " + action });
  } catch (err) {
    return json_({ status: "error", message: String(err && err.message ? err.message : err) });
  }
}

/* ===== Config ===== */
const SHEET_ID = "1sDXwbmV10B-mFlxRsojwRshByOKfhhkpPwlK4twzGxU";
const SHEET_NAME = "Sheet1";

/* ===== Sheet ===== */
function getSheet_() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);

  if (sh.getLastRow() === 0) {
    sh.appendRow([
      "tsServer",
      "sessionCode",
      "certificateClick",
      "certificateClickAt",
      "name","age","gender",
      "a1","a2","a3","a4","a5",
      "resultType","resultTH","resultEN",
      "profileJson","liffJson","clientJson","answersJson"
    ]);
  }
  return sh;
}

/* ===== Session code (unique against Sheet) ===== */
function genSessionCode_() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function sessionExists_(code) {
  const sh = getSheet_();
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return false;

  const rng = sh.getRange(2, 2, lastRow - 1, 1); // sessionCode column
  const found = rng.createTextFinder(code).matchEntireCell(true).findNext();
  return !!found;
}

function reserveSessionCode_() {
  const lock = LockService.getScriptLock();
  lock.waitLock(8000);
  try {
    // Try several times until unique
    for (let i = 0; i < 50; i++) {
      const code = genSessionCode_();
      if (!sessionExists_(code)) return code;
    }
    // Extremely unlikely; fall back to timestamp-based
    return "X" + String(new Date().getTime()).slice(-4);
  } finally {
    lock.releaseLock();
  }
}

/* ===== Append Quiz Row (server guarantees unique sessionCode) ===== */
function appendQuizRow_(d) {
  const lock = LockService.getScriptLock();
  lock.waitLock(8000);
  try {
    const sh = getSheet_();

    let code = String(d.sessionCode || "").trim();
    if (!code || sessionExists_(code)) {
      // if missing or collision -> issue new code
      code = reserveSessionCode_();
    }

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

      JSON.stringify(d.profile || null),
      JSON.stringify(d.liffInfo || {}),
      JSON.stringify(d.client || {}),
      JSON.stringify(d.answers || [])
    ]);

    return code;
  } finally {
    lock.releaseLock();
  }
}

/* ===== Mark certificate click on the row by sessionCode ===== */
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

    // Find from bottom (latest)
    const values = sh.getRange(2, colSession, lastRow - 1, 1).getValues();
    let foundRow = -1;
    for (let i = values.length - 1; i >= 0; i--) {
      if (String(values[i][0]).trim() === code) {
        foundRow = i + 2;
        break;
      }
    }

    if (foundRow === -1) {
      // If not found, do NOT create new row (avoids mismatch)
      throw new Error("sessionCode not found: " + code);
    }

    sh.getRange(foundRow, colCert).setValue(1);
    sh.getRange(foundRow, colCertAt).setValue(new Date());
    return code;
  } finally {
    lock.releaseLock();
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}