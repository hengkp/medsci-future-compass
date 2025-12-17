function doPost(e) {
  try {
    const body = JSON.parse((e.postData && e.postData.contents) || "{}");
    const action = body.action;
    const data = body.data || {};

    if (action === "quiz_complete") {
      appendQuizRow_(data);
      return json_({ status: "ok" });
    }

    if (action === "certificate_click") {
      markCertificateClick_(data);
      return json_({ status: "ok" });
    }

    return json_({ status: "error", message: "Unknown action: " + action });
  } catch (err) {
    return json_({ status: "error", message: String(err && err.message ? err.message : err) });
  }
}

function getSheet_() {
  const SHEET_ID = "1sDXwbmV10B-mFlxRsojwRshByOKfhhkpPwlK4twzGxU";
  const SHEET_NAME = "Sheet1"
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);

  // Header (create once)
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

function appendQuizRow_(d) {
  const lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    const sh = getSheet_();

    sh.appendRow([
      new Date(),
      d.sessionCode || "",
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
  } finally {
    lock.releaseLock();
  }
}

function markCertificateClick_(d) {
  const code = (d.sessionCode || "").trim();
  if (!code) throw new Error("Missing sessionCode");

  const lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    const sh = getSheet_();
    const lastRow = sh.getLastRow();
    if (lastRow < 2) throw new Error("QuizLog is empty");

    // Find the latest matching sessionCode (search from bottom)
    const colSession = 2; // sessionCode column index (1-based)
    const colCert = 3;    // certificateClick
    const colCertAt = 4;  // certificateClickAt

    const values = sh.getRange(2, colSession, lastRow - 1, 1).getValues(); // session codes
    let foundRow = -1;
    for (let i = values.length - 1; i >= 0; i--) {
      if (String(values[i][0]).trim() === code) {
        foundRow = i + 2; // offset header
        break;
      }
    }
    if (foundRow === -1) throw new Error("sessionCode not found: " + code);

    sh.getRange(foundRow, colCert).setValue(1);
    sh.getRange(foundRow, colCertAt).setValue(new Date());
  } finally {
    lock.releaseLock();
  }
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}