const { LIFF_ID, GAS_WEBAPP_URL, OA_URL, CERT_GOOGLE_FORM_URL } = window.APP_CONFIG;

let liffInfo = { os:"", lang:"", version:"", isInClient:false, isLoggedIn:false };
let lineProfile = null;

let currentQ = 0;
let scores = { SCIENTIST: 0, DATA: 0, HEALER: 0, CREATIVE: 0 };
let userAnswers = [];

let lastResultType = "";
let lastResultTH = "";
let lastResultEN = "";

const SESSION_KEY = "tfc_session_code";
function $(id){ return document.getElementById(id); }

function switchView(fromId, toId) {
  $(fromId).classList.add("hidden");
  $(toId).classList.remove("hidden");
  $("main-scroll").scrollTop = 0;
}

function setStatus(ok, html) {
  const statusDiv = $("liff-status");
  statusDiv.className = ok
    ? "text-green-700 font-extrabold bg-green-50 py-2 px-4 rounded-xl flex items-center justify-center gap-2 border border-green-200 shadow-sm"
    : "text-gray-600 font-extrabold bg-gray-50 py-2 px-4 rounded-xl flex items-center justify-center gap-2 border border-gray-200";
  statusDiv.innerHTML = html;
}

function safeNowISO(){ try { return new Date().toISOString(); } catch { return ""; } }
function buildClientMeta() {
  return { tsClientISO: safeNowISO(), ua: navigator.userAgent || "", href: location.href || "", referrer: document.referrer || "" };
}

async function callBackend_(action, data, { retries = 2 } = {}) {
  const payload = { action, data };

  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(GAS_WEBAPP_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" }, // no-preflight
        body: JSON.stringify(payload),
        cache: "no-store",
      });

      // ถ้าโดน redirect/login จะไม่ใช่ JSON
      let out = null;
      try { out = await res.json(); } catch {}

      if (!out) throw new Error(`Backend non-JSON (HTTP ${res.status})`);
      if (out.status === "error") throw new Error(out.message || "Backend error");
      return out;
    } catch (e) {
      lastErr = e;
      // wait small before retry
      await new Promise(r => setTimeout(r, 250));
    }
  }
  throw lastErr || new Error("Load failed");
}

// ---- session storage ----
function getSessionCodeLocal_(){ try { return sessionStorage.getItem(SESSION_KEY) || ""; } catch { return ""; } }
function setSessionCodeLocal_(code){ try { sessionStorage.setItem(SESSION_KEY, code); } catch {} }

async function ensureUniqueSessionCode_() {
  const local = getSessionCodeLocal_().trim();
  if (local) {
    try {
      const chk = await callBackend_("session_exists", { sessionCode: local });
      if (chk.exists === false) return local;
    } catch (_) {}
  }
  const out = await callBackend_("reserve_session", {});
  const code = String(out.sessionCode || "").trim();
  if (!code) throw new Error("reserve_session returned empty");
  setSessionCodeLocal_(code);
  return code;
}

// ---- landing validation ----
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

/* =====================
   Questions (5 only)
   ===================== */
const questions = [
  { q: "1. ถ้าโลกถูกไวรัสปริศนาโจมตี น้องจะรับบทบาทไหน?", answers: [
    { text: "วิจัยหาวัคซีนในห้องแล็บ", type: "SCIENTIST" },
    { text: "วิเคราะห์ข้อมูลการระบาด", type: "DATA" },
    { text: "ออกไปรักษาผู้ป่วย", type: "HEALER" },
    { text: "ทำสื่อประชาสัมพันธ์", type: "CREATIVE" },
  ]},
  { q: "2. เวลาว่าง น้องมักจะชอบทำอะไร?", answers: [
    { text: "เล่นเกมวางแผน / แก้ปริศนา", type: "DATA" },
    { text: "อ่านการ์ตูน / วาดรูป", type: "CREATIVE" },
    { text: "ดูสารคดี / ทดลอง", type: "SCIENTIST" },
    { text: "คุยกับเพื่อน / จิตอาสา", type: "HEALER" },
  ]},
  { q: "3. ในวิชาชีววิทยา น้องชอบหัวข้อไหนที่สุด?", answers: [
    { text: "ระบบร่างกายมนุษย์", type: "HEALER" },
    { text: "พันธุกรรมและการทดลอง", type: "SCIENTIST" },
    { text: "โครงสร้างเซลล์ (วาดรูป)", type: "CREATIVE" },
    { text: "สถิติประชากร", type: "DATA" },
  ]},
  { q: "4. ถ้าได้เป็นยอดมนุษย์ อยากมีพลังอะไร?", answers: [
    { text: "เนตรทิพย์ มองเห็นเชื้อโรค", type: "SCIENTIST" },
    { text: "พลังรักษา เยียวยาบาดแผล", type: "HEALER" },
    { text: "สมองคอมพิวเตอร์", type: "DATA" },
    { text: "เสกภาพในหัวให้เป็นจริง", type: "CREATIVE" },
  ]},
  { q: "5. เป้าหมายสูงสุดในชีวิตคือ?", answers: [
    { text: "ค้นพบสิ่งใหม่ที่เปลี่ยนโลก", type: "SCIENTIST" },
    { text: "สร้างผลงานที่คนจดจำ", type: "CREATIVE" },
    { text: "ทำให้สังคมมีความสุข", type: "HEALER" },
    { text: "แก้ปัญหาด้วยเทคโนโลยี", type: "DATA" },
  ]},
];

const archetypes = {
  HEALER: {
    thTitle: "ผู้เยียวยาสังคม", enName: "The Social Healer", icon: "❤️",
    desc: "หัวใจของคุณคือผู้ให้! มีความเห็นอกเห็นใจผู้อื่น และชอบทำงานที่ได้ช่วยเหลือผู้คนโดยตรง",
    tip: "ทักษะการสื่อสารและจิตวิทยาเป็นอาวุธสำคัญของคุณ พัฒนามันให้ดีเยี่ยม",
    jobs: ["บุคลากรทางการแพทย์", "นักสาธารณสุข", "เจ้าหน้าที่ควบคุมคุณภาพบริการ"],
    wow: false,
  },
  DATA: {
    thTitle: "พ่อมดแห่งข้อมูล", enName: "The Data Wizard", icon: "💻",
    desc: "คุณมองเห็นรูปแบบที่คนอื่นมองไม่เห็น! ชอบใช้ตรรกะและตัวเลขในการไขปัญหาซับซ้อน",
    tip: "ลองศึกษาเรื่อง AI หรือการเขียนโปรแกรมเบื้องต้น จะช่วยติดปีกให้ความฝันคุณ",
    jobs: ["นักวิเคราะห์ข้อมูลสุขภาพ (Health Data)", "นักสถิติการแพทย์", "ผู้เชี่ยวชาญเทคโนโลยีสุขภาพ"],
    wow: true,
  },
  CREATIVE: {
    thTitle: "นักนวัตกรรมสร้างสรรค์", enName: "The Creative Innovator", icon: "🎨",
    desc: "จินตนาการของคุณไม่มีที่สิ้นสุด! คุณสามารถเปลี่ยนเรื่องยากๆ ให้เข้าใจง่ายและสวยงาม",
    tip: "ลองนำศิลปะมาผสมกับวิทยาศาสตร์ดูสิ คุณอาจสร้างสื่อการแพทย์ที่ล้ำสุดๆ ได้",
    jobs: ["นักออกแบบผลิตภัณฑ์สุขภาพ", "Medical Illustrator", "นักสื่อสารวิทยาศาสตร์สุขภาพ"],
    wow: false,
  },
  SCIENTIST: {
    thTitle: "นักวิทยาศาสตร์ผู้พิทักษ์", enName: "The Guardian Scientist", icon: "🔬",
    desc: "คุณคือยอดนักสืบแห่งโลกจุลทรรศน์! ช่างสังเกต ชอบค้นหาคำตอบด้วยเหตุผล และไม่ยอมแพ้ต่อปริศนา",
    tip: "ฝึกฝนทักษะการสังเกตและการตั้งคำถาม 'ทำไม' บ่อยๆ คือกุญแจสู่ความสำเร็จของคุณ",
    jobs: ["นักวิทยาศาสตร์การแพทย์", "เจ้าหน้าที่ห้องปฏิบัติการ", "นักวิจัย/นักนิติวิทยาศาสตร์"],
    wow: true,
  },
};

function computeResultType() {
  return Object.keys(scores).reduce((a, b) => (scores[a] > scores[b] ? a : b));
}

function setResultUI(type) {
  const r = archetypes[type];
  $("res-icon").innerText = r.icon;
  $("res-title").innerText = r.thTitle;
  $("res-en").innerText = r.enName;
  $("res-desc").innerText = r.desc;
  $("res-tip").innerText = r.tip;

  const jobsUl = $("res-jobs");
  jobsUl.innerHTML = "";
  r.jobs.forEach(j => {
    const li = document.createElement("li");
    li.textContent = j;
    jobsUl.appendChild(li);
  });

  const wow = $("res-wow");
  if (r.wow) wow.classList.remove("hidden");
  else wow.classList.add("hidden");
}

/* =====================
   Landing validation
   ===================== */
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

/* =====================
   Backend helper
   ===================== */
async function callBackend_(action, data) {
  const payload = { action, data };
  const res = await fetch(GAS_WEBAPP_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
  });

  let out = null;
  try { out = await res.json(); } catch {}
  if (!out) throw new Error("Backend returned non-JSON");
  if (out.status === "error") throw new Error(out.message || "Backend error");
  return out;
}

/* =====================
   Session: reserve unique code via Google Sheet
   ===================== */
function getSessionCodeLocal_() {
  try { return sessionStorage.getItem(SESSION_KEY) || ""; } catch { return ""; }
}
function setSessionCodeLocal_(code) {
  try { sessionStorage.setItem(SESSION_KEY, code); } catch {}
}

async function ensureUniqueSessionCode_() {
  // 1) If already have local code -> verify with server
  const local = getSessionCodeLocal_().trim();
  if (local) {
    try {
      const chk = await callBackend_("session_exists", { sessionCode: local });
      // if NOT exists in sheet -> safe to keep
      if (chk && chk.exists === false) return local;
      // else already used -> reserve a new one
    } catch (_) {
      // if cannot check -> still reserve new (safer)
    }
  }

  // 2) Reserve from server (server guarantees uniqueness)
  const out = await callBackend_("reserve_session", { hint: "client_init" });
  const code = (out.sessionCode || "").trim();
  if (!code) throw new Error("reserve_session returned empty code");
  setSessionCodeLocal_(code);
  return code;
}

/* =====================
   LIFF init with timeout (fix stuck)
   ===================== */
function withTimeout_(p, ms, msg) {
  return Promise.race([p, new Promise((_,rej)=>setTimeout(()=>rej(new Error(msg||"timeout")), ms))]);
}

async function initLiffSafe_() {
  setStatus(false, "👤 กำลังเตรียมระบบ...");

  if (typeof liff === "undefined") {
    setStatus(false, "👤 โหมดบุคคลทั่วไป");
    return;
  }

  try {
    await withTimeout_(liff.init({ liffId: LIFF_ID, withLoginOnExternalBrowser: false }), 6000, "LIFF init timeout");
    await withTimeout_(liff.ready, 6000, "LIFF ready timeout");

    liffInfo.os = liff.getOS?.() || "";
    liffInfo.lang = liff.getLanguage?.() || "";
    liffInfo.version = liff.getVersion?.() || "";
    liffInfo.isInClient = !!(liff.isInClient && liff.isInClient());
    liffInfo.isLoggedIn = !!(liff.isLoggedIn && liff.isLoggedIn());

    if (liffInfo.isLoggedIn) {
      lineProfile = await withTimeout_(liff.getProfile(), 6000, "getProfile timeout");
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

// ---- boot ----
window.addEventListener("DOMContentLoaded", async () => {
  $("inp-name").addEventListener("input", validateLanding_);
  $("inp-age").addEventListener("input", validateLanding_);
  $("inp-gender").addEventListener("change", validateLanding_);

  await initLiffSafe_();

  // health check (ช่วย diagnose “Load failed” ได้ทันที)
  try {
    await callBackend_("health", {});
  } catch (e) {
    console.error("health failed:", e);
    setStatus(false, "⚠️ เชื่อมต่อชีทไม่สำเร็จ (ตรวจ Deploy/URL ของ GAS)");
  }

  try { await ensureUniqueSessionCode_(); } catch (e) { console.warn("reserve session failed:", e); }

  validateLanding_();
});

// ---- quiz flow ----
function resetQuizState_() {
  currentQ = 0;
  scores = { SCIENTIST: 0, DATA: 0, HEALER: 0, CREATIVE: 0 };
  userAnswers = [];
  lastResultType = "";
  lastResultTH = "";
  lastResultEN = "";
}

window.startQuiz = function startQuiz() {
  resetQuizState_();
  switchView("view-landing","view-quiz");
  renderQuestion_();
};

function renderQuestion_() {
  const qData = questions[currentQ];
  $("q-num").innerText = String(currentQ + 1);
  $("progress-bar").style.width = `${((currentQ + 1) / questions.length) * 100}%`;
  $("q-text").innerText = qData.q;

  const container = $("q-answers");
  container.innerHTML = "";

  qData.answers.forEach(ans => {
    const btn = document.createElement("button");
    btn.className = "choice-btn";
    btn.innerHTML = `<span>${ans.text}</span> <span class="text-gray-300 text-xl">➜</span>`;
    btn.onclick = async () => {
      userAnswers.push(ans.text);
      scores[ans.type] = (scores[ans.type] || 0) + 1;

      currentQ++;
      if (currentQ < questions.length) renderQuestion_();
      else await onQuizCompleted_();
    };
    container.appendChild(btn);
  });
}

async function onQuizCompleted_() {
  const { name, age, gender } = getLandingData_();
  let sessionCode = getSessionCodeLocal_().trim();
  if (!sessionCode) sessionCode = await ensureUniqueSessionCode_().catch(()=>"");

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

      // IMPORTANT: userId for OA push
      userId: lineProfile?.userId || "",

      liffInfo: { ...liffInfo },
      profile: lineProfile || null,
      client: buildClientMeta(),
    });

    if (out?.sessionCode && out.sessionCode !== sessionCode) setSessionCodeLocal_(out.sessionCode);
  } catch (e) {
    console.error("quiz_complete failed:", e);
    alert("บันทึกลงชีทไม่สำเร็จ: " + (e?.message || e));
  }
}

window.openCertificateFormExternal = async function openCertificateFormExternal() {
  const { name, age, gender } = getLandingData_();
  let sessionCode = getSessionCodeLocal_().trim();
  if (!sessionCode) sessionCode = await ensureUniqueSessionCode_().catch(()=>"");

  try {
    const out = await callBackend_("certificate_click", {
      sessionCode,
      certificateClick: 1,
      name, age, gender,
      resultType: lastResultType,
      resultTH: lastResultTH,
      resultEN: lastResultEN,
      userId: lineProfile?.userId || "",
      liffInfo: { ...liffInfo },
      profile: lineProfile || null,
      client: buildClientMeta(),
    });
    if (out?.sessionCode && out.sessionCode !== sessionCode) setSessionCodeLocal_(out.sessionCode);
  } catch (e) {
    console.warn("certificate_click failed:", e);
  }

  try {
    if (typeof liff !== "undefined" && liff.openWindow) {
      liff.openWindow({ url: CERT_GOOGLE_FORM_URL, external: true });
      return;
    }
  } catch (_) {}
  window.open(CERT_GOOGLE_FORM_URL, "_blank");
};

/* =====================
   Result buttons
   ===================== */
window.restartToLanding = function restartToLanding() {
  resetQuizState_();
  const hasLineName = !!(lineProfile?.displayName);
  if (!hasLineName) $("inp-name").value = "";
  $("inp-age").value = "";
  $("inp-gender").value = "";
  validateLanding_();
  switchView("view-result", "view-landing");
};

window.goOA = function goOA() {
  try {
    if (typeof liff !== "undefined" && liff.openWindow && liffInfo.isInClient) {
      liff.openWindow({ url: OA_URL, external: false });
      return;
    }
  } catch (_) {}
  window.location.href = OA_URL;
};

window.openCertificateFormExternal = async function openCertificateFormExternal() {
  const { name, age, gender } = getLandingData_();
  const sessionCode = getSessionCodeLocal_().trim() || (await ensureUniqueSessionCode_().catch(() => ""));

  try {
    const out = await callBackend_("certificate_click", {
      sessionCode,
      certificateClick: 1,
      name, age, gender,
      resultType: lastResultType,
      resultTH: lastResultTH,
      resultEN: lastResultEN,
      liffInfo: { ...liffInfo },
      profile: lineProfile || null,
      client: buildClientMeta(),
    });
    if (out && out.sessionCode && out.sessionCode !== sessionCode) {
      setSessionCodeLocal_(out.sessionCode);
    }
  } catch (e) {
    console.error("certificate_click failed:", e);
  }

  try {
    if (typeof liff !== "undefined" && liff.openWindow) {
      liff.openWindow({ url: CERT_GOOGLE_FORM_URL, external: true });
      return;
    }
  } catch (_) {}
  window.open(CERT_GOOGLE_FORM_URL, "_blank");
};