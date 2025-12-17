const SHEET_NAME = "Sheet1";

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

    if (action === "quiz_complete") {
      const rowNum = appendQuizRowFast_(data);
      try { sendResultViaOA_(data, rowNum); } catch (err) { console.log("OA send failed:", err); }
      return json_({ status: "ok", rowNum });
    }

    if (action === "certificate_click") {
      appendCertificateClickFast_(data);
      return json_({ status: "ok" });
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
  return String(v || "").trim();
}

/* =========================
 * Sheet helpers
 * ========================= */
function getSheet_() {
  const sheetId = getRequiredProp_("SHEET_ID");
  const ss = SpreadsheetApp.openById(sheetId);
  const sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  ensureHeaderFast_(sh);
  return sh;
}

function ensureHeaderFast_(sh) {
  if (sh.getLastRow() !== 0) return;

  sh.appendRow([
    "tsServer",
    "rowId",                // from client runId
    "eventType",            // "quiz_complete" or "certificate_click"
    "certificateClick",     // 0/1
    "certificateClickAt",

    "name","age","gender",

    "a1","a2","a3","a4","a5",

    "resultType","resultTH","resultEN",

    "userId",               // from client payload

    // extracted from profile
    "lineUserId","lineDisplayName","linePictureUrl",

    // extracted from liff
    "liffOs","liffLang","liffVersion","liffIsInClient","liffIsLoggedIn",

    // raw json (keep)
    "profileJson","liffJson","clientJson","answersJson"
  ]);
}

/* =========================
 * Parse helpers
 * ========================= */
function parseJsonSafe_(v) {
  try {
    if (v === null || v === undefined) return null;
    if (typeof v === "object") return v; // already object
    const s = String(v || "").trim();
    if (!s) return null;
    if (s[0] !== "{" && s[0] !== "[") return null;
    return JSON.parse(s);
  } catch (_) {
    return null;
  }
}
function boolCell_(v) {
  if (v === true) return true;
  if (v === false) return false;
  const s = String(v || "").toLowerCase().trim();
  if (s === "true") return true;
  if (s === "false") return false;
  return "";
}
function safeStr_(v) { return (v === null || v === undefined) ? "" : String(v); }

/* =========================
 * Actions (FAST)
 * ========================= */
function appendQuizRowFast_(d) {
  const sh = getSheet_();

  const profileObj = d.profile || parseJsonSafe_(d.profileJson);
  const liffObj = d.liffInfo || parseJsonSafe_(d.liffJson);

  const lineUserId = safeStr_(profileObj && profileObj.userId);
  const lineDisplayName = safeStr_(profileObj && profileObj.displayName);
  const linePictureUrl = safeStr_(profileObj && profileObj.pictureUrl);

  const liffOs = safeStr_(liffObj && liffObj.os);
  const liffLang = safeStr_(liffObj && liffObj.lang);
  const liffVersion = safeStr_(liffObj && liffObj.version);
  const liffIsInClient = boolCell_(liffObj && liffObj.isInClient);
  const liffIsLoggedIn = boolCell_(liffObj && liffObj.isLoggedIn);

  const answers = Array.isArray(d.answers) ? d.answers : [];

  sh.appendRow([
    new Date(),
    safeStr_(d.rowId),
    "quiz_complete",
    0,
    "",

    d.name || "",
    d.age || "",
    d.gender || "",

    answers[0] || "",
    answers[1] || "",
    answers[2] || "",
    answers[3] || "",
    answers[4] || "",

    d.resultType || "",
    d.resultTH || "",
    d.resultEN || "",

    safeStr_(d.userId),

    lineUserId, lineDisplayName, linePictureUrl,

    liffOs, liffLang, liffVersion, liffIsInClient, liffIsLoggedIn,

    JSON.stringify(profileObj || null),
    JSON.stringify(liffObj || {}),
    JSON.stringify(d.client || {}),
    JSON.stringify(answers || [])
  ]);

  return sh.getLastRow();
}

function appendCertificateClickFast_(d) {
  const sh = getSheet_();

  const profileObj = d.profile || parseJsonSafe_(d.profileJson);
  const liffObj = d.liffInfo || parseJsonSafe_(d.liffJson);

  const lineUserId = safeStr_(profileObj && profileObj.userId);
  const lineDisplayName = safeStr_(profileObj && profileObj.displayName);
  const linePictureUrl = safeStr_(profileObj && profileObj.pictureUrl);

  const liffOs = safeStr_(liffObj && liffObj.os);
  const liffLang = safeStr_(liffObj && liffObj.lang);
  const liffVersion = safeStr_(liffObj && liffObj.version);
  const liffIsInClient = boolCell_(liffObj && liffObj.isInClient);
  const liffIsLoggedIn = boolCell_(liffObj && liffObj.isLoggedIn);

  sh.appendRow([
    new Date(),
    safeStr_(d.rowId),
    "certificate_click",
    1,
    new Date(),

    d.name || "",
    d.age || "",
    d.gender || "",

    "", "", "", "", "",

    d.resultType || "",
    d.resultTH || "",
    d.resultEN || "",

    safeStr_(d.userId),

    lineUserId, lineDisplayName, linePictureUrl,

    liffOs, liffLang, liffVersion, liffIsInClient, liffIsLoggedIn,

    JSON.stringify(profileObj || null),
    JSON.stringify(liffObj || {}),
    JSON.stringify(d.client || {}),
    JSON.stringify(d.answers || [])
  ]);
}

/* =========================
 * OA push (optional)
 * ========================= */
function getLineToken_() {
  return getOptionalProp_("LINE_CHANNEL_ACCESS_TOKEN");
}

function sendResultViaOA_(d, rowNum) {
  const token = getLineToken_();
  if (!token) return;

  const userId = String(d.userId || "").trim();
  if (!userId) return;

  const name = d.name || "เพื่อนใหม่";
  const resultTH = d.resultTH || "ผลลัพธ์ของคุณ";
  const resultEN = d.resultEN || "";
  const emoji = pickEmojiByType_(d.resultType);

  const desc = (d && d.desc) ? String(d.desc) : "";
  const tip  = (d && d.tip)  ? String(d.tip)  : "";
  const jobs = (d && d.jobs) ? d.jobs : [];
  const idText = String(d.rowId || "");

  const msgFlex = buildResultFlex_(name, resultTH, resultEN, emoji, desc, tip, jobs, idText);

  pushLine_(token, userId, [
    msgFlex,
    { type: "text", text: `ขอบคุณที่ร่วมสนุกนะครับ 😊` }
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

function buildResultFlex_(name, resultTH, resultEN, emoji, desc, tip, jobs, idText) {
  const alt = `The Future Compass บอกว่า คุณคือ ${resultTH}`;
  const jobList = Array.isArray(jobs) ? jobs : [];
  const safeName = name || "เพื่อนใหม่";
  const safeEmoji = emoji || "✨";
  const safeTH = resultTH || "-";
  const safeEN = resultEN || "";
  const safeDesc = desc || "";
  const safeTip = tip || "";
  const safeId = idText ? String(idText) : "";

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
        paddingAll: "20px",
        backgroundColor: "#FFFFFF",
        contents: [
          // Header
          {
            type: "box",
            layout: "vertical",
            spacing: "sm",
            contents: [
              { type: "text", text: "The Future Compass 🧭", weight: "bold", size: "lg", color: "#0f172a" },
              { type: "text", text: `สวัสดี ${safeName} 😊`, size: "sm", color: "#475569", wrap: true }
            ]
          },

          { type: "separator", margin: "md", color: "#E2E8F0" },

          // Title
          {
            type: "text",
            text: "The Future Compass บอกว่า คุณคือ",
            size: "md",
            weight: "bold",
            color: "#0f766e",
            wrap: true
          },

          // Result card
          {
            type: "box",
            layout: "vertical",
            spacing: "sm",
            paddingAll: "16px",
            cornerRadius: "16px",
            backgroundColor: "#F0FDFA",
            borderWidth: "1px",
            borderColor: "#99F6E4",
            contents: [
              {
                type: "box",
                layout: "baseline",
                spacing: "md",
                contents: [
                  { type: "text", text: safeEmoji, size: "xxl", flex: 0 },
                  { type: "text", text: safeTH, weight: "bold", size: "xl", color: "#0f172a", wrap: true }
                ]
              },
              safeEN
                ? { type: "text", text: safeEN, size: "sm", color: "#0f766e", wrap: true }
                : { type: "spacer", size: "xs" }
            ]
          },

          // Desc card
          safeDesc
            ? {
                type: "box",
                layout: "vertical",
                spacing: "xs",
                paddingAll: "14px",
                cornerRadius: "16px",
                backgroundColor: "#FFFFFF",
                borderWidth: "1px",
                borderColor: "#E2E8F0",
                contents: [
                  { type: "text", text: "คำอธิบาย", weight: "bold", size: "sm", color: "#0f172a" },
                  { type: "text", text: safeDesc, size: "sm", color: "#334155", wrap: true }
                ]
              }
            : { type: "spacer", size: "xs" },

          // Tip card (gold)
          safeTip
            ? {
                type: "box",
                layout: "vertical",
                spacing: "xs",
                paddingAll: "14px",
                cornerRadius: "16px",
                backgroundColor: "#FFFBEB",
                borderWidth: "1px",
                borderColor: "#FDE68A",
                contents: [
                  { type: "text", text: "คำแนะนำพัฒนาตนเอง ✨", weight: "bold", size: "sm", color: "#92400E" },
                  { type: "text", text: safeTip, size: "sm", color: "#334155", wrap: true }
                ]
              }
            : { type: "spacer", size: "xs" },

          // Jobs card
          {
            type: "box",
            layout: "vertical",
            spacing: "xs",
            paddingAll: "14px",
            cornerRadius: "16px",
            backgroundColor: "#EFF6FF",
            borderWidth: "1px",
            borderColor: "#BFDBFE",
            contents: [
              { type: "text", text: "อาชีพที่เหมาะกับคุณ 🎯", weight: "bold", size: "sm", color: "#1D4ED8" },
              ...(jobList.length
                ? jobList.slice(0, 8).map(j => ({
                    type: "text",
                    text: `• ${j}`,
                    size: "sm",
                    color: "#334155",
                    wrap: true
                  }))
                : [{ type: "text", text: "• -", size: "sm", color: "#334155", wrap: true }])
            ]
          },

          // Footer ID
          safeId
            ? {
                type: "box",
                layout: "vertical",
                margin: "md",
                paddingAll: "10px",
                cornerRadius: "12px",
                backgroundColor: "#F8FAFC",
                borderWidth: "1px",
                borderColor: "#E2E8F0",
                contents: [
                  { type: "text", text: `ID: ${safeId}`, size: "xs", color: "#64748B", wrap: true }
                ]
              }
            : { type: "spacer", size: "xs" }
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
 * Health + utils
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

  try {
    const sheetId = getRequiredProp_("SHEET_ID");
    report.sheetIdPresent = true;

    const ss = SpreadsheetApp.openById(sheetId);
    report.sheetOpenOk = true;

    const sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
    ensureHeaderFast_(sh);
    report.headerOk = true;
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