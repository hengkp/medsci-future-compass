// web/assets/app.js
const CFG = (window.APP_CONFIG && typeof window.APP_CONFIG === "object") ? window.APP_CONFIG : {};
const LIFF_ID = String(CFG.LIFF_ID || "");
const GAS_WEBAPP_URL = String(CFG.GAS_WEBAPP_URL || "");
const OA_URL = String(CFG.OA_URL || "");
const CERT_GOOGLE_FORM_URL = String(CFG.CERT_GOOGLE_FORM_URL || "");

let liffInfo = { os:"", lang:"", version:"", isInClient:false, isLoggedIn:false };
let lineProfile = null;

let currentQ = 0;
let scores = { SCIENTIST: 0, DATA: 0, HEALER: 0, CREATIVE: 0 };
let userAnswers = [];

let lastResultType = "";
let lastResultTH = "";
let lastResultEN = "";

// ใช้เป็น "rowId" ฝั่ง client (ไม่ต้อง unique ทั้งระบบ แค่ช่วย link เหตุการณ์)
let runId = "";

function $(id){ return document.getElementById(id); }

/* ---------- UI helpers ---------- */
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
  return {
    tsClientISO: safeNowISO(),
    ua: navigator.userAgent || "",
    href: location.href || "",
    referrer: document.referrer || ""
  };
}

function genRunId_() {
  // เร็ว + ไม่ต้องเช็คซ้ำ: timestamp + random
  const r = Math.random().toString(16).slice(2, 8);
  return `R${Date.now()}_${r}`;
}

/* ---------- Backend helper (fast, non-blocking) ---------- */
async function callBackend_(action, data, { timeoutMs = 6000 } = {}) {
  if (!GAS_WEBAPP_URL) return null;

  const payload = { action, data };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch(GAS_WEBAPP_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" }, // no-preflight
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: ctrl.signal
    });

    let out = null;
    try { out = await res.json(); } catch {}
    clearTimeout(timer);

    // ไม่ throw เพื่อไม่ให้เกมสะดุด
    return out;
  } catch (e) {
    clearTimeout(timer);
    return null;
  }
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

/* ---------- Questions + Archetypes ---------- */
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
  HEALER: { thTitle:"ผู้เยียวยาสังคม", enName:"The Social Healer", icon:"❤️",
    desc:"หัวใจของคุณคือผู้ให้! มีความเห็นอกเห็นใจผู้อื่น และชอบทำงานที่ได้ช่วยเหลือผู้คนโดยตรง",
    tip:"ทักษะการสื่อสารและจิตวิทยาเป็นอาวุธสำคัญของคุณ พัฒนามันให้ดีเยี่ยม",
    jobs:["บุคลากรทางการแพทย์","นักสาธารณสุข","เจ้าหน้าที่ควบคุมคุณภาพบริการ"], wow:false
  },
  DATA: { thTitle:"พ่อมดแห่งข้อมูล", enName:"The Data Wizard", icon:"💻",
    desc:"คุณมองเห็นรูปแบบที่คนอื่นมองไม่เห็น! ชอบใช้ตรรกะและตัวเลขในการไขปัญหาซับซ้อน",
    tip:"ลองศึกษาเรื่อง AI หรือการเขียนโปรแกรมเบื้องต้น จะช่วยติดปีกให้ความฝันคุณ",
    jobs:["นักวิเคราะห์ข้อมูลสุขภาพ (Health Data)","นักสถิติการแพทย์","ผู้เชี่ยวชาญเทคโนโลยีสุขภาพ"], wow:true
  },
  CREATIVE: { thTitle:"นักนวัตกรรมสร้างสรรค์", enName:"The Creative Innovator", icon:"🎨",
    desc:"จินตนาการของคุณไม่มีที่สิ้นสุด! คุณสามารถเปลี่ยนเรื่องยากๆ ให้เข้าใจง่ายและสวยงาม",
    tip:"ลองนำศิลปะมาผสมกับวิทยาศาสตร์ดูสิ คุณอาจสร้างสื่อการแพทย์ที่ล้ำสุดๆ ได้",
    jobs:["นักออกแบบผลิตภัณฑ์สุขภาพ","Medical Illustrator","นักสื่อสารวิทยาศาสตร์สุขภาพ"], wow:false
  },
  SCIENTIST: { thTitle:"นักวิทยาศาสตร์ผู้พิทักษ์", enName:"The Guardian Scientist", icon:"🔬",
    desc:"คุณคือยอดนักสืบแห่งโลกจุลทรรศน์! ช่างสังเกต ชอบค้นหาคำตอบด้วยเหตุผล และไม่ยอมแพ้ต่อปริศนา",
    tip:"ฝึกฝนทักษะการสังเกตและการตั้งคำถาม 'ทำไม' บ่อยๆ คือกุญแจสู่ความสำเร็จของคุณ",
    jobs:["นักวิทยาศาสตร์การแพทย์","เจ้าหน้าที่ห้องปฏิบัติการ","นักวิจัย/นักนิติวิทยาศาสตร์"], wow:true
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

/* ---------- LIFF init (fast) ---------- */
function withTimeout_(p, ms, msg) {
  return Promise.race([p, new Promise((_,rej)=>setTimeout(()=>rej(new Error(msg||"timeout")), ms))]);
}

async function initLiffFast_() {
  setStatus(false, "👤 กำลังเตรียมระบบ...");

  if (typeof liff === "undefined" || !LIFF_ID) {
    setStatus(false, "👤 โหมดบุคคลทั่วไป");
    return;
  }

  try {
    await withTimeout_(liff.init({ liffId: LIFF_ID, withLoginOnExternalBrowser: false }), 5000, "LIFF init timeout");
    await withTimeout_(liff.ready, 5000, "LIFF ready timeout");

    liffInfo.os = liff.getOS?.() || "";
    liffInfo.lang = liff.getLanguage?.() || "";
    liffInfo.version = liff.getVersion?.() || "";
    liffInfo.isInClient = !!(liff.isInClient && liff.isInClient());
    liffInfo.isLoggedIn = !!(liff.isLoggedIn && liff.isLoggedIn());

    if (liffInfo.isLoggedIn) {
      lineProfile = await withTimeout_(liff.getProfile(), 5000, "getProfile timeout");
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

/* ---------- Boot (NO backend calls) ---------- */
window.addEventListener("DOMContentLoaded", async () => {
  runId = genRunId_();

  $("inp-name").addEventListener("input", validateLanding_);
  $("inp-age").addEventListener("input", validateLanding_);
  $("inp-gender").addEventListener("change", validateLanding_);

  validateLanding_();
  await initLiffFast_();
  validateLanding_();
});

/* ---------- Quiz flow ---------- */
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
  runId = genRunId_();
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
    btn.onclick = () => {
      userAnswers.push(ans.text);
      scores[ans.type] = (scores[ans.type] || 0) + 1;

      currentQ++;
      if (currentQ < questions.length) renderQuestion_();
      else onQuizCompleted_();
    };
    container.appendChild(btn);
  });
}

function onQuizCompleted_() {
  const { name, age, gender } = getLandingData_();

  const type = computeResultType();
  const r = archetypes[type];
  lastResultType = type;
  lastResultTH = r.thTitle;
  lastResultEN = r.enName;

  setResultUI(type);
  switchView("view-quiz","view-result");

  // ✅ log แบบไม่บล็อก UI
  callBackend_("quiz_complete", {
    rowId: runId,
    certificateClick: 0,
    name, age, gender,
    answers: userAnswers.slice(0),
    resultType: lastResultType,
    resultTH: lastResultTH,
    resultEN: lastResultEN,
    userId: String(lineProfile?.userId || ""),
    profile: lineProfile || null,
    liffInfo: { ...liffInfo },
    client: buildClientMeta(),
  }, { timeoutMs: 6000 });
}

/* ---------- Certificate ---------- */
function openFormExternal_() {
  try {
    if (typeof liff !== "undefined" && liff.openWindow) {
      liff.openWindow({ url: CERT_GOOGLE_FORM_URL, external: true });
      return;
    }
  } catch (_) {}
  window.open(CERT_GOOGLE_FORM_URL, "_blank");
}

window.openCertificateFormExternal = function openCertificateFormExternal() {
  const { name, age, gender } = getLandingData_();

  // ✅ log click แบบไม่บล็อก UI
  callBackend_("certificate_click", {
    rowId: runId,
    certificateClick: 1,
    name, age, gender,
    resultType: lastResultType,
    resultTH: lastResultTH,
    resultEN: lastResultEN,
    userId: String(lineProfile?.userId || ""),
    profile: lineProfile || null,
    liffInfo: { ...liffInfo },
    client: buildClientMeta(),
  }, { timeoutMs: 6000 });

  openFormExternal_();
};

/* ---------- Other buttons ---------- */
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