// gas/Code.js

function doGet() {
  // health check
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, message: "Future Compass API is running" }))
    .setMimeType(ContentService.MimeType.JSON);
}

// รับ POST จาก frontend (GitHub Pages)
// อ้างอิง: Web Apps ต้องมี doGet/doPost  [oai_citation:2‡Google for Developers](https://developers.google.com/apps-script/guides/web?utm_source=chatgpt.com) และส่ง JSON ผ่าน ContentService ได้  [oai_citation:3‡Google for Developers](https://developers.google.com/apps-script/guides/content?utm_source=chatgpt.com)
function doPost(e) {
  try {
    const body = e && e.postData && e.postData.contents ? e.postData.contents : "";
    const payload = body ? JSON.parse(body) : {};
    const action = payload.action || "";

    if (action !== "submit") {
      return json_({ status: "error", message: "Unknown action" });
    }

    const data = payload.data || {};

    // อ่านค่า secret จาก Script Properties
    const props = PropertiesService.getScriptProperties();
    const SHEET_ID = props.getProperty("SHEET_ID");
    const LINE_CHANNEL_ACCESS_TOKEN = props.getProperty("LINE_CHANNEL_ACCESS_TOKEN"); // optional

    if (!SHEET_ID) return json_({ status: "error", message: "Missing SHEET_ID in Script Properties" });

    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheets()[0];

    sheet.appendRow([
      new Date(),
      data.name || "",
      data.grade || "",
      data.school || "",
      data.province || "",
      data.phone || "",
      data.email || "",
      data.result || "",
      data.lineUserId || "",
      data.q1 || "", data.q2 || "", data.q3 || "", data.q4 || "", data.q5 || ""
    ]);

    // ส่งข้อความขอบคุณ (ถ้ามี token + userId)
    if (LINE_CHANNEL_ACCESS_TOKEN && data.lineUserId) {
      sendLineThankYouMessage_(LINE_CHANNEL_ACCESS_TOKEN, data.lineUserId, data.name || "", data.result || "");
    }

    return json_({ status: "success" });

  } catch (err) {
    return json_({ status: "error", message: String(err) });
  }
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ส่ง push message ผ่าน Messaging API  [oai_citation:4‡LINE Developers](https://developers.line.biz/en/docs/messaging-api/sending-messages/?utm_source=chatgpt.com)
function sendLineThankYouMessage_(token, userId, name, result) {
  const url = "https://api.line.me/v2/bot/message/push";

  const payload = {
    to: userId,
    messages: [
      { type: "text", text: `ขอบคุณ ${name} ที่ร่วมสนุกกับ "The Future Compass" ครับ! 🧭\n\nผลลัพธ์ของคุณคือ: "${result}"` },
      { type: "text", text: "✅ ระบบได้รับข้อมูลเรียบร้อยแล้ว\n\n📧 ทางเจ้าหน้าที่จะจัดส่งเกียรติบัตรให้ทางอีเมลที่คุณระบุ ภายใน 7 วันทำการครับ" }
    ]
  };

  UrlFetchApp.fetch(url, {
    method: "post",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + token
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
}