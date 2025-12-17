function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || "{}");
    const action = body.action;
    const data = body.data || {};

    if (action === "quiz_complete") {
      appendQuizRow_(data);
      return json_({ status: "ok" });
    }

    if (action === "certificate_submit") {
      appendCertRow_(data);
      return json_({ status: "ok" });
    }

    return json_({ status: "error", message: "Unknown action: " + action });
  } catch (err) {
    return json_({ status: "error", message: String(err && err.message ? err.message : err) });
  }
}

function appendQuizRow_(d) {
  const ss = SpreadsheetApp.openById("PUT_YOUR_SHEET_ID_HERE");
  const sh = ss.getSheetByName("QuizLog") || ss.insertSheet("QuizLog");

  // เก็บ "ทั้งหมด" เป็น JSON string
  const profileJson = JSON.stringify(d.profile || null);
  const liffJson = JSON.stringify(d.liffInfo || {});
  const clientJson = JSON.stringify(d.client || {});
  const answersJson = JSON.stringify(d.answers || []);

  sh.appendRow([
    new Date(),                 // วันที่เวลา (server)
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
    profileJson,                // ✅ getProfile ทั้งหมด
    liffJson,                   // ✅ liff info
    clientJson,                 // ✅ client meta
    answersJson                 // สำรอง (รวม)
  ]);
}

function appendCertRow_(d) {
  const ss = SpreadsheetApp.openById("PUT_YOUR_SHEET_ID_HERE");
  const sh = ss.getSheetByName("Certificate") || ss.insertSheet("Certificate");

  const profileJson = JSON.stringify(d.profile || null);
  const liffJson = JSON.stringify(d.liffInfo || {});
  const clientJson = JSON.stringify(d.client || {});
  const answersJson = JSON.stringify(d.answers || []);

  sh.appendRow([
    new Date(),
    d.name || "",
    d.age || "",
    d.gender || "",
    d.email || "",
    d.resultType || "",
    d.resultTH || "",
    d.resultEN || "",
    answersJson,
    profileJson,
    liffJson,
    clientJson
  ]);
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}