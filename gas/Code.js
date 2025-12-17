function doGet() {
  return ContentService.createTextOutput("OK The Future Compass WebApp").setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  try {
    const body = JSON.parse((e.postData && e.postData.contents) || "{}");
    const action = body.action;
    const data = body.data || {};

    if (action === "health") {
      // test sheet access
      getSheet_();
      return json_({ status: "ok", now: new Date().toISOString() });
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

      // ส่งข้อความจาก OA (ไม่ทำให้บันทึกชีท fail)
      try { sendResultViaOA_(data, used); } catch (err) { console.log("OA send failed:", err); }

      return json_({ status: "ok", sessionCode: used });
    }

    if (action === "certificate_click") {
      const used = markCertificateClick_(data);
      // (optional) ส่งข้อความขอบคุณ/แนบลิงก์ฟอร์มได้ ถ้าต้องการ
      return json_({ status: "ok", sessionCode: used });
    }

    return json_({ status: "error", message: "Unknown action: " + action });
  } catch (err) {
    return json_({ status: "error", message: String(err && err.message ? err.message : err) });
  }
}

/* ====== CONFIG ====== */
const SHEET_ID = "1sDXwbmV10B-mFlxRsojwRshByOKfhhkpPwlK4twzGxU";
const SHEET_NAME = "Sheet1";

/* ====== SHEET ====== */
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
      "userId",
      "profileJson","liffJson","clientJson","answersJson"
    ]);
  }
  return sh;
}

/* ====== SESSION UNIQUE ====== */
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

  const rng = sh.getRange(2, 2, lastRow - 1, 1);
  const found = rng.createTextFinder(code).matchEntireCell(true).findNext();
  return !!found;
}

function reserveSessionCode_() {
  const lock = LockService.getScriptLock();
  lock.waitLock(8000);
  try {
    for (let i = 0; i < 50; i++) {
      const code = genSessionCode_();
      if (!sessionExists_(code)) return code;
    }
    return "X" + String(new Date().getTime()).slice(-4);
  } finally {
    lock.releaseLock();
  }
}

/* ====== APPEND QUIZ ====== */
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

    return code;
  } finally {
    lock.releaseLock();
  }
}

/* ====== CERT CLICK ====== */
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
      if (String(values[i][0]).trim() === code) { foundRow = i + 2; break; }
    }
    if (foundRow === -1) throw new Error("sessionCode not found: " + code);

    sh.getRange(foundRow, colCert).setValue(1);
    sh.getRange(foundRow, colCertAt).setValue(new Date());
    return code;
  } finally {
    lock.releaseLock();
  }
}

/* ====== OA PUSH MESSAGE (Channel Access Token) ====== */
function getLineToken_() {
  const token = PropertiesService.getScriptProperties().getProperty("LINE_CHANNEL_ACCESS_TOKEN");
  if (!token) throw new Error("Missing Script Property: LINE_CHANNEL_ACCESS_TOKEN");
  return token;
}

function sendResultViaOA_(d, sessionCode) {
  const userId = String(d.userId || "").trim();
  if (!userId) {
    // ถ้าไม่ได้มาจาก LIFF ที่ login จะไม่มี userId -> ส่งไม่ได้
    console.log("No userId; skip OA push");
    return;
  }

  const name = d.name || "เพื่อนใหม่";
  const resultTH = d.resultTH || "ผลลัพธ์ของคุณ";
  const resultEN = d.resultEN || "";
  const emoji = pickEmojiByType_(d.resultType);

  const msgFlex = buildResultFlex_(name, resultTH, resultEN, emoji, sessionCode);

  pushLine_(userId, [
    msgFlex,
    {
      type: "text",
      text:
        `ถ้าอยากรับเกียรติบัตร 🏆\n` +
        `กลับไปที่หน้าเกม แล้วกดปุ่ม “รับเกียรติบัตร” ได้เลยนะครับ 🙂`
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
          {
            type: "text",
            text: "The Future Compass 🧭",
            weight: "bold",
            size: "lg"
          },
          {
            type: "text",
            text: `สวัสดี ${name} 😊`,
            size: "md",
            wrap: true
          },
          {
            type: "box",
            layout: "baseline",
            spacing: "sm",
            contents: [
              { type: "text", text: emoji, size: "xl", flex: 0 },
              { type: "text", text: resultTH, weight: "bold", size: "xl", wrap: true }
            ]
          },
          resultEN ? {
            type: "text",
            text: resultEN,
            size: "sm",
            color: "#64748b",
            wrap: true
          } : { type: "spacer", size: "xs" },
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

function pushLine_(to, messages) {
  const token = getLineToken_();
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

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}