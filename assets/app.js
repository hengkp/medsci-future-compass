const { LIFF_ID, GAS_WEBAPP_URL, OA_URL, CERT_GOOGLE_FORM_URL } = window.APP_CONFIG;

let liffInfo = { os:"", lang:"", version:"", isInClient:false, isLoggedIn:false };
let lineProfile = null;

let currentQ = 0;
let scores = { SCIENTIST: 0, DATA: 0, HEALER: 0, CREATIVE: 0 };
let userAnswers = [];

let lastResultType = "";
let lastResultTH = "";
let lastResultEN = "";

let lastAttempt = null;

const SESSION_KEY = "tfc_session_code";
const LAST_ATTEMPT_KEY_PREFIX = "tfc_last_attempt_"; // + userId
const LAST_ATTEMPT_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

function $(id){ return document.getElementById(id); }

/* ---------- UI helpers ---------- */
function setStatus(ok, html) {
  const statusDiv = $("liff-status");
  statusDiv.className = ok
    ? "text-green-700 font-extrabold bg-green-50 py-2 px-4 rounded-xl flex items-center justify-center gap-2 border border-green-200 shadow-sm"
    : "text-gray-600 font-extrabold bg-gray-50 py-2 px-4 rounded-xl flex items-center justify-center gap-2 border border-gray-200";
  statusDiv.innerHTML = html;
}
function switchView(fromId, toId) {
  $(fromId).classList.add("hidden");
  $(toId).classList.remove("hidden");
  $("main-scroll").scrollTop = 0;
}

function safeNowISO(){ try { return new Date().toISOString(); } catch { return ""; } }
function buildClientMeta() {
  return { tsClientISO: safeNowISO(), ua: navigator.userAgent || "", href: location.href || "", referrer: document.referrer || "" };
}

/* ---------- fast storage helpers ---------- */
function getSessionCodeLocal_(){ try { return sessionStorage.getItem(SESSION_KEY) || ""; } catch { return ""; } }
function setSessionCodeLocal_(code){ try { sessionStorage.setItem(SESSION_KEY, code); } catch {} }

function getCachedLastAttempt_(userId) {
  try {
    const raw = localStorage.getItem(LAST_ATTEMPT_KEY_PREFIX + userId);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || !obj.ts || !obj.record) return null;
    if (Date.now() - obj.ts > LAST_ATTEMPT_TTL_MS) return null;
    return obj.record;
  } catch (_) { return null; }
}
function setCachedLastAttempt_(userId, record) {
  try {
    localStorage.setItem(LAST_ATTEMPT_KEY_PREFIX + userId, JSON.stringify({ ts: Date.now(), record }));
  } catch (_) {}
}

/* ---------- Backend helper (timeout + retry) ---------- */
async function callBackend_(action, data, { retries = 1, timeoutMs = 6000 } = {}) {
  const payload = { action, data };
  let lastErr = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);

    try {
      const res = await fetch(GAS_WEBAPP_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
        cache: "no-store",
        signal: ctrl.signal
      });

      let out = null;
      try { out = await res.json(); } catch {}
      if (!out) throw new Error(`Backend non-JSON (HTTP ${res.status})`);
      if (out.status === "error") throw new Error(out.message || "Backend error");

      clearTimeout(t);
      return out;
    } catch (e) {
      clearTimeout(t);
      lastErr = e;
      await new Promise(r => setTimeout(r, 150));
    }
  }
  throw lastErr || new Error("Load failed");
}

/* ---------- Landing data + validation ---------- */
function getLandingData_() {
  const name = ($("inp-name")?.value || "").trim();
  const age = ($("inp-age")?.value || "").toString().trim();
  const gender = ($("inp-gender")?.value || "").trim();
  return { name, age, gender };
}
function validateLanding_() {
  const { name, age, gender } = getLandingData_();
  const ageNum = Number(age);
  const ok = !!name && !!gender && Number.isFinite(ageNum) && ageNum >= 1 && ageNum <= 120;
  $("btn-start").disabled = !ok;
}

/* ---------- Session (ONLY reserve when needed) ---------- */
async function ensureUniqueSessionCode_() {
  const local = getSessionCodeLocal_().trim();
  if (local) return local; // ไม่ต้องเช็ค server ทุกครั้ง (เร็วสุด) — server จะกันซ้ำเองตอน append

  const out = await callBackend_("reserve_session", { hint: "need_session" }, { retries: 1, timeoutMs: 7000 });
  const code = String(out.sessionCode || "").trim();
  if (!code) throw new Error("reserve_session returned empty code");
  setSessionCodeLocal_(code);
  return code;
}

/* ---------- LIFF init (safe timeout) ---------- */
function withTimeout_(p, ms, msg) {
  return Promise.race([p, new Promise((_,rej)=>setTimeout(()=>rej(new Error(msg||"timeout")), ms))]);
}
async function initLiffSafe_() {
  setStatus(false, "👤 กำลังเชื่อมต่อ LINE...");

  if (typeof liff === "undefined") {
    setStatus(false, "👤 โหมดบุคคลทั่วไป");
    return;
  }

  try {
    await withTimeout_(liff.init({ liffId: LIFF_ID, withLoginOnExternalBrowser: false }), 4500, "LIFF init timeout");
    await withTimeout_(liff.ready, 4500, "LIFF ready timeout");

    liffInfo.os = liff.getOS?.() || "";
    liffInfo.lang = liff.getLanguage?.() || "";
    liffInfo.version = liff.getVersion?.() || "";
    liffInfo.isInClient = !!(liff.isInClient && liff.isInClient());
    liffInfo.isLoggedIn = !!(liff.isLoggedIn && liff.isLoggedIn());

    if (liffInfo.isLoggedIn) {
      lineProfile = await withTimeout_(liff.getProfile(), 4500, "getProfile timeout");
      const displayName = lineProfile?.displayName || "";
      setStatus(true, `✅ สวัสดีคุณ ${displayName || "ครับ"} ✨`);
      if (displayName && !$("inp-name").value.trim()) $("inp-name").value = displayName;
    } else {
      setStatus(false, "👤 โหมดบุคคลทั่วไป");
    }
  } catch (e) {
    console.error("LIFF init failed:", e);
    setStatus(false, "👤 โหมดบุคคลทั่วไป");
  }
}

/* ---------- FAST: hydrate from local cache immediately, then refresh from server ---------- */
function applyLastAttemptToLanding_(rec) {
  if (!rec) return;

  lastAttempt = rec;

  if (rec.sessionCode) setSessionCodeLocal_(String(rec.sessionCode).trim());

  if (rec.name && !$("inp-name").value.trim()) $("inp-name").value = rec.name;
  if (rec.age && !$("inp-age").value.trim()) $("inp-age").value = String(rec.age);
  if (rec.gender && !$("inp-gender").value.trim()) $("inp-gender").value = rec.gender;

  const wrap = $("landing-cert-wrap");
  if (wrap) wrap.classList.remove("hidden");

  validateLanding_();
}

async function loadLastAttemptForLine_({ refresh = true } = {}) {
  const userId = String(lineProfile?.userId || "").trim();
  if (!userId) return;

  // 1) instant from local cache (no network)
  const cached = getCachedLastAttempt_(userId);
  if (cached) applyLastAttemptToLanding_(cached);

  if (!refresh) return;

  // 2) refresh from server (fast now due to index sheet)
  try {
    const out = await callBackend_("get_last_attempt", { userId }, { retries: 0, timeoutMs: 5000 });
    if (out?.found && out?.record) {
      applyLastAttemptToLanding_(out.record);
      setCachedLastAttempt_(userId, out.record);
    }
  } catch (e) {
    console.warn("get_last_attempt failed:", e);
  }
}

/* ---------- Boot (non-blocking) ---------- */
window.addEventListener("DOMContentLoaded", () => {
  $("inp-name").addEventListener("input", validateLanding_);
  $("inp-age").addEventListener("input", validateLanding_);
  $("inp-gender").addEventListener("change", validateLanding_);
  validateLanding_();

  // ทำให้ UI มาไว: ไม่ await งาน backend หนัก ๆ
  (async () => {
    await initLiffSafe_();

    // background tasks: health + lastAttempt (ไม่บล็อก UI)
    setTimeout(async () => {
      // health แบบเงียบ ๆ (ถ้าพัง ค่อยแจ้ง)
      try { await callBackend_("health", {}, { retries: 0, timeoutMs: 5000 }); }
      catch (_) { setStatus(false, "⚠️ เชื่อมต่อชีทไม่สำเร็จ (ตรวจ Deploy/Permission)"); }

      // โหลดประวัติ (LINE เท่านั้น) — ตอนนี้เร็วเพราะใช้ Index sheet
      await loadLastAttemptForLine_({ refresh: true });
    }, 0);
  })();
});

/* ---------- quiz logic: เหมือนเดิม (ตัดมาเฉพาะส่วนที่กระทบ session) ---------- */
function resetQuizState_() {
  currentQ = 0;
  scores = { SCIENTIST: 0, DATA: 0, HEALER: 0, CREATIVE: 0 };
  userAnswers = [];
  lastResultType = "";
  lastResultTH = "";
  lastResultEN = "";
}

/* IMPORTANT: เวลาต้องใช้ sessionCode ค่อย reserve */
async function getBestSessionCode_() {
  const fromLast = String(lastAttempt?.sessionCode || "").trim();
  if (fromLast) return fromLast;

  const local = getSessionCodeLocal_().trim();
  if (local) return local;

  return await ensureUniqueSessionCode_();
}

/* --- on quiz completed (แค่ส่วน session) --- */
async function onQuizCompleted_() {
  const { name, age, gender } = getLandingData_();
  const sessionCode = await getBestSessionCode_().catch(() => "");

  const type = computeResultType();
  const r = archetypes[type];
  lastResultType = type;
  lastResultTH = r.thTitle;
  lastResultEN = r.enName;

  setResultUI(type);
  switchView("view-quiz","view-result");

  try {
    const out = await callBackend_("quiz_complete", {
      sessionCode,
      certificateClick: 0,
      name, age, gender,
      answers: userAnswers.slice(0),
      resultType: lastResultType,
      resultTH: lastResultTH,
      resultEN: lastResultEN,
      userId: String(lineProfile?.userId || ""),
      liffInfo: { ...liffInfo },
      profile: lineProfile || null,
      client: buildClientMeta(),
    }, { retries: 1, timeoutMs: 9000 });

    if (out?.sessionCode) setSessionCodeLocal_(out.sessionCode);

    // ทำให้หน้าแรก “รับเกียรติบัตร” ได้ทันที (ไม่ต้องรอ sheet)
    lastAttempt = {
      sessionCode: out?.sessionCode || sessionCode,
      name, age, gender,
      resultType: lastResultType,
      resultTH: lastResultTH,
      resultEN: lastResultEN,
      userId: String(lineProfile?.userId || "")
    };
    if (lastAttempt.userId) setCachedLastAttempt_(lastAttempt.userId, lastAttempt);

  } catch (e) {
    console.error("quiz_complete failed:", e);
    alert("บันทึกลงชีทไม่สำเร็จ: " + (e?.message || e));
  }
}

/* --- certificate click --- */
async function logCertificateClick_() {
  const { name, age, gender } = getLandingData_();
  const sessionCode = await getBestSessionCode_().catch(() => "");

  const payload = {
    sessionCode,
    certificateClick: 1,
    name, age, gender,
    resultType: lastResultType || lastAttempt?.resultType || "",
    resultTH:   lastResultTH   || lastAttempt?.resultTH   || "",
    resultEN:   lastResultEN   || lastAttempt?.resultEN   || "",
    userId: String(lineProfile?.userId || ""),
    liffInfo: { ...liffInfo },
    profile: lineProfile || null,
    client: buildClientMeta(),
  };

  try {
    const out = await callBackend_("certificate_click", payload, { retries: 0, timeoutMs: 7000 });
    if (out?.sessionCode) setSessionCodeLocal_(out.sessionCode);
  } catch (e) {
    console.warn("certificate_click failed:", e);
  }
}

function openFormExternal_() {
  try {
    if (typeof liff !== "undefined" && liff.openWindow) {
      liff.openWindow({ url: CERT_GOOGLE_FORM_URL, external: true });
      return;
    }
  } catch (_) {}
  window.open(CERT_GOOGLE_FORM_URL, "_blank");
}

window.openCertificateFormExternal = async function openCertificateFormExternal() {
  await logCertificateClick_();
  openFormExternal_();
};