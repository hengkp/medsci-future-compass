function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, message: "Future Compass API is running" }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const body = e && e.postData && e.postData.contents ? e.postData.contents : "";
    const payload = body ? JSON.parse(body) : {};
    const action = payload.action || "";
    const data = payload.data || {};

    const props = PropertiesService.getScriptProperties();
    const SHEET_ID = props.getProperty("SHEET_ID");
    const LINE_CHANNEL_ACCESS_TOKEN = props.getProperty("LINE_CHANNEL_ACCESS_TOKEN"); // optional

    if (!SHEET_ID) return json_({ status: "error", message: "Missing SHEET_ID in Script Properties" });

    const ss = SpreadsheetApp.openById(SHEET_ID);
    const plays = getOrCreateSheet_(ss, "Plays", playsHeaders_());
    const gifts = getOrCreateSheet_(ss, "Gifts", giftsHeaders_());

    if (action === "quiz_complete") {
      // Save play + push greeting/result message first
      const ts = new Date();

      const row = [
        ts,
        toDateKey_(ts),
        data.lineUserId || "",
        data.lineDisplayName || "",
        data.linePictureUrl || "",
        (data.liff && data.liff.os) || "",
        (data.liff && data.liff.lang) || "",
        (data.liff && data.liff.version) || "",
        (data.liff && data.liff.isInClient) ? "Y" : "N",
        (data.liff && data.liff.isLoggedIn) ? "Y" : "N",

        data.resultType || "",
        data.resultTH || "",
        data.resultEN || "",

        data.impliedAge || "",
        data.impliedGender || "",

        // answers (up to 7)
        (data.answers && data.answers[0]) || "",
        (data.answers && data.answers[1]) || "",
        (data.answers && data.answers[2]) || "",
        (data.answers && data.answers[3]) || "",
        (data.answers && data.answers[4]) || "",
        (data.answers && data.answers[5]) || "",
        (data.answers && data.answers[6]) || "",

        // gift/cert status fields (initial)
        "",
        "",
        "",
        "ไม่ต้องการ",
        "",
        ""
      ];
      plays.appendRow(row);

      // push message: greet + result
      if (LINE_CHANNEL_ACCESS_TOKEN && data.lineUserId) {
        pushResultMessage_(LINE_CHANNEL_ACCESS_TOKEN, data.lineUserId, data.lineDisplayName || "", data.resultTH || "");
      }

      return json_({ status: "success" });
    }

    if (action === "certificate_click") {
      // mark certificate status in Plays: latest row for userId
      const uid = data.lineUserId || "";
      const status = data.certificateStatus || "ต้องการ";
      if (uid) {
        markCertificateClick_(plays, uid, status);
      }
      return json_({ status: "success" });
    }

    if (action === "gift_status") {
      const uid = data.lineUserId || "";
      if (!uid) return json_({ status: "success", eligible: false, alreadyPlayed: false, todayRemaining: 0, todayCap: 100 });

      const todayKey = toDateKey_(new Date());
      const cap = 100;

      // already played ever? (one-time)
      const existing = findGiftByUser_(gifts, uid);
      if (existing) {
        return json_({
          status: "success",
          eligible: false,
          alreadyPlayed: true,
          existingStatus: existing.giftStatus || "",
          todayRemaining: Math.max(0, cap - countGiftSuccessByDate_(gifts, todayKey)),
          todayCap: cap
        });
      }

      const successCount = countGiftSuccessByDate_(gifts, todayKey);
      const remaining = Math.max(0, cap - successCount);

      return json_({
        status: "success",
        eligible: true,
        alreadyPlayed: false,
        todayRemaining: remaining,
        todayCap: cap
      });
    }

    if (action === "draw_gift") {
      const uid = data.lineUserId || "";
      if (!uid) return json_({ status: "error", message: "Missing lineUserId" });

      const todayKey = toDateKey_(new Date());
      const cap = 100;

      // Prevent replay
      const existing = findGiftByUser_(gifts, uid);
      if (existing) {
        return json_({ status: "success", giftStatus: existing.giftStatus || "FAIL", reused: true });
      }

      // daily quota check
      const successCount = countGiftSuccessByDate_(gifts, todayKey);
      const remaining = Math.max(0, cap - successCount);

      // If quota done => 0% chance
      let chance = 0;
      let giftStatus = "FAIL";

      if (remaining > 0) {
        // Reasonable chance, not too hard: clamp 15%–25% by remaining
        // remaining=100 -> 25%, remaining=50 -> 15%, remaining small -> 15% until quota ends
        chance = Math.max(0.15, Math.min(0.25, remaining / 400));
        const r = Math.random();
        giftStatus = (r < chance) ? "SUCCESS" : "FAIL";

        // hard stop if someone wins but quota was exhausted concurrently
        const successCountNow = countGiftSuccessByDate_(gifts, todayKey);
        if (giftStatus === "SUCCESS" && successCountNow >= cap) giftStatus = "FAIL";
      }

      // Record gift draw
      const ts = new Date();
      gifts.appendRow([
        ts,
        todayKey,
        uid,
        data.lineDisplayName || "",
        data.resultTH || "",
        data.impliedAge || "",
        data.impliedGender || "",
        giftStatus,
        chance,
        cap,
        remaining
      ]);

      // Update Plays latest row: gift status
      updateLatestPlayGift_(plays, uid, giftStatus, ts);

      // Push message after gift result
      if (LINE_CHANNEL_ACCESS_TOKEN && uid) {
        pushGiftMessage_(LINE_CHANNEL_ACCESS_TOKEN, uid, data.lineDisplayName || "", giftStatus);
      }

      return json_({ status: "success", giftStatus, chance, todayRemaining: Math.max(0, cap - countGiftSuccessByDate_(gifts, todayKey)) });
    }

    return json_({ status: "error", message: "Unknown action" });

  } catch (err) {
    return json_({ status: "error", message: String(err) });
  }
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ===========================
   ✅ Sheets helpers
   =========================== */
function getOrCreateSheet_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) sh.appendRow(headers);
  return sh;
}

function playsHeaders_() {
  return [
    "ts",
    "dateKey",
    "lineUserId",
    "displayName",
    "pictureUrl",
    "liff_os",
    "liff_lang",
    "liff_version",
    "liff_inClient",
    "liff_loggedIn",
    "resultType",
    "resultTH",
    "resultEN",
    "impliedAge",
    "impliedGender",
    "q1","q2","q3","q4","q5","q6","q7",
    "giftStatus",
    "giftTS",
    "giftNote",
    "certificateStatus",
    "certificateClickTS",
    "note"
  ];
}

function giftsHeaders_() {
  return [
    "ts",
    "dateKey",
    "lineUserId",
    "displayName",
    "resultTH",
    "impliedAge",
    "impliedGender",
    "giftStatus",
    "chanceUsed",
    "dailyCap",
    "remainingAtDraw"
  ];
}

function toDateKey_(d) {
  const tz = Session.getScriptTimeZone() || "Asia/Bangkok";
  return Utilities.formatDate(d, tz, "yyyy-MM-dd");
}

function findGiftByUser_(giftsSheet, userId) {
  const lastRow = giftsSheet.getLastRow();
  if (lastRow < 2) return null;
  const values = giftsSheet.getRange(2, 1, lastRow - 1, giftsSheet.getLastColumn()).getValues();
  for (let i = values.length - 1; i >= 0; i--) {
    const row = values[i];
    if (String(row[2] || "") === String(userId)) {
      return {
        ts: row[0],
        dateKey: row[1],
        userId: row[2],
        giftStatus: row[7]
      };
    }
  }
  return null;
}

function countGiftSuccessByDate_(giftsSheet, dateKey) {
  const lastRow = giftsSheet.getLastRow();
  if (lastRow < 2) return 0;
  const values = giftsSheet.getRange(2, 1, lastRow - 1, giftsSheet.getLastColumn()).getValues();
  let n = 0;
  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    if (String(row[1] || "") === String(dateKey) && String(row[7] || "") === "SUCCESS") n++;
  }
  return n;
}

function updateLatestPlayGift_(playsSheet, userId, giftStatus, ts) {
  const lastRow = playsSheet.getLastRow();
  if (lastRow < 2) return;

  const values = playsSheet.getRange(2, 1, lastRow - 1, playsSheet.getLastColumn()).getValues();
  for (let i = values.length - 1; i >= 0; i--) {
    const row = values[i];
    if (String(row[2] || "") === String(userId)) {
      const rowIndex = i + 2;
      // giftStatus (col 23), giftTS (col 24)
      playsSheet.getRange(rowIndex, 23).setValue(giftStatus);
      playsSheet.getRange(rowIndex, 24).setValue(ts);
      playsSheet.getRange(rowIndex, 25).setValue(giftStatus === "SUCCESS"
        ? "บอกให้หยิบฉลาก 1 ชิ้นจากต้นคริสมาสต์"
        : "บอกรับรางวัลปลอบใจที่บูท");
      break;
    }
  }
}

function markCertificateClick_(playsSheet, userId, status) {
  const lastRow = playsSheet.getLastRow();
  if (lastRow < 2) return;

  const values = playsSheet.getRange(2, 1, lastRow - 1, playsSheet.getLastColumn()).getValues();
  for (let i = values.length - 1; i >= 0; i--) {
    const row = values[i];
    if (String(row[2] || "") === String(userId)) {
      const rowIndex = i + 2;
      // certificateStatus col 26, clickTS col 27
      playsSheet.getRange(rowIndex, 26).setValue(status);
      playsSheet.getRange(rowIndex, 27).setValue(new Date());
      break;
    }
  }
}

/* ===========================
   ✅ LINE push messages
   =========================== */
function pushResultMessage_(token, userId, displayName, resultTH) {
  const url = "https://api.line.me/v2/bot/message/push";
  const name = displayName ? displayName : "คุณ";

  const payload = {
    to: userId,
    messages: [
      { type: "text", text: `สวัสดี ${name} 👋\nขอบคุณที่ร่วมสนุกกับ "The Future Compass" 🧭` },
      { type: "text", text: `ผลลัพธ์ของคุณคือ: "${resultTH}" ✨\n\nกด “ลุ้นรางวัล” ในหน้าแอปได้เลยครับ 🎁` }
    ]
  };

  UrlFetchApp.fetch(url, {
    method: "post",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
}

function pushGiftMessage_(token, userId, displayName, giftStatus) {
  const url = "https://api.line.me/v2/bot/message/push";
  const name = displayName ? displayName : "คุณ";

  const msg = (giftStatus === "SUCCESS")
    ? `🎉 ยินดีด้วย ${name}!\nคุณได้รับของรางวัลวันนี้ ✅\n\n👉 กรุณา “หยิบฉลาก 1 ชิ้น จากต้นคริสมาสต์” ที่บูทครับ 🎄`
    : `😢 ${name} รอบนี้ยังไม่ถูกรางวัล\n\n🎁 แต่คุณสามารถ “รับรางวัลปลอบใจที่บูท” ได้เลยครับ`;

  const payload = {
    to: userId,
    messages: [
      { type: "text", text: msg }
    ]
  };

  UrlFetchApp.fetch(url, {
    method: "post",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
}
