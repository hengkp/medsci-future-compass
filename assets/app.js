// web/assets/app.js
const { LIFF_ID, GAS_WEBAPP_URL, OA_URL, CERT_GOOGLE_FORM_URL } = window.APP_CONFIG;

let liffInfo = { os:"", lang:"", version:"", isInClient:false, isLoggedIn:false };
let lineProfile = null; // เก็บ getProfile "ทั้งหมด"วัตถุ

let currentQ = 0;
let scores = { SCIENTIST: 0, DATA: 0, HEALER: 0, CREATIVE: 0 };
let userAnswers = [];

let lastResultType = "";
let lastResultTH = "";
let lastResultEN = "";
let sentResultMessage = false; // กันส่งซ้ำ

const SESSION_KEY = "tfc_session_code";

function genSessionCode_() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // avoid confusing I/O/1/0
  let s = "";
  for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function getSessionCode_() {
  try {
    let code = sessionStorage.getItem(SESSION_KEY);
    if (!code) {
      code = genSessionCode_();
      sessionStorage.setItem(SESSION_KEY, code);
    }
    return code;
  } catch (_) {
    // fallback if sessionStorage blocked
    return genSessionCode_();
  }
}

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

function safeNowISO() {
  try { return new Date().toISOString(); } catch { return ""; }
}

function buildClientMeta() {
  return {
    tsClientISO: safeNowISO(),
    ua: navigator.userAgent || "",
    href: location.href || "",
    referrer: document.referrer || "",
  };
}

// =====================
// Questions = 5 ข้อเท่านั้น
// =====================
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
    thTitle: "ผู้เยียวยาสังคม",
    enName: "The Social Healer",
    icon: "❤️",
    desc: "หัวใจของคุณคือผู้ให้! มีความเห็นอกเห็นใจผู้อื่น และชอบทำงานที่ได้ช่วยเหลือผู้คนโดยตรง",
    tip: "ทักษะการสื่อสารและจิตวิทยาเป็นอาวุธสำคัญของคุณ พัฒนามันให้ดีเยี่ยม",
    jobs: ["บุคลากรทางการแพทย์", "นักสาธารณสุข", "เจ้าหน้าที่ควบคุมคุณภาพบริการ"],
    wow: false,
  },
  DATA: {
    thTitle: "พ่อมดแห่งข้อมูล",
    enName: "The Data Wizard",
    icon: "💻",
    desc: "คุณมองเห็นรูปแบบที่คนอื่นมองไม่เห็น! ชอบใช้ตรรกะและตัวเลขในการไขปัญหาซับซ้อน",
    tip: "ลองศึกษาเรื่อง AI หรือการเขียนโปรแกรมเบื้องต้น จะช่วยติดปีกให้ความฝันคุณ",
    jobs: ["นักวิเคราะห์ข้อมูลสุขภาพ (Health Data)", "นักสถิติการแพทย์", "ผู้เชี่ยวชาญเทคโนโลยีสุขภาพ"],
    wow: true,
  },
  CREATIVE: {
    thTitle: "นักนวัตกรรมสร้างสรรค์",
    enName: "The Creative Innovator",
    icon: "🎨",
    desc: "จินตนาการของคุณไม่มีที่สิ้นสุด! คุณสามารถเปลี่ยนเรื่องยากๆ ให้เข้าใจง่ายและสวยงาม",
    tip: "ลองนำศิลปะมาผสมกับวิทยาศาสตร์ดูสิ คุณอาจสร้างสื่อการแพทย์ที่ล้ำสุดๆ ได้",
    jobs: ["นักออกแบบผลิตภัณฑ์สุขภาพ", "Medical Illustrator", "นักสื่อสารวิทยาศาสตร์สุขภาพ"],
    wow: false,
  },
  SCIENTIST: {
    thTitle: "นักวิทยาศาสตร์ผู้พิทักษ์",
    enName: "The Guardian Scientist",
    icon: "🔬",
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

// =====================
// Landing validation
// =====================
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

// =====================
// LIFF init (ไม่ force login)
// - ถ้า logged in: เติมชื่อจาก LINE ให้ช่องชื่อ
// - ถ้า guest: ปล่อยชื่อว่าง
// =====================
window.addEventListener("load", async () => {
  $("inp-name").addEventListener("input", validateLanding_);
  $("inp-age").addEventListener("input", validateLanding_);
  $("inp-gender").addEventListener("change", validateLanding_);

  const fallbackTimer = setTimeout(() => {
    setStatus(false, "👤 โหมดบุคคลทั่วไป (กรอกข้อมูลแล้วเริ่มได้เลย)");
  }, 6000);

  if (typeof liff === "undefined") {
    clearTimeout(fallbackTimer);
    setStatus(false, "👤 โหมดบุคคลทั่วไป (กรอกข้อมูลแล้วเริ่มได้เลย)");
    validateLanding_();
    return;
  }

  try {
    await liff.init({ liffId: LIFF_ID, withLoginOnExternalBrowser: false });
    await liff.ready;
    clearTimeout(fallbackTimer);

    liffInfo.os = liff.getOS?.() || "";
    liffInfo.lang = liff.getLanguage?.() || "";
    liffInfo.version = liff.getVersion?.() || "";
    liffInfo.isInClient = !!(liff.isInClient && liff.isInClient());
    liffInfo.isLoggedIn = !!(liff.isLoggedIn && liff.isLoggedIn());

    if (liffInfo.isLoggedIn) {
      lineProfile = await liff.getProfile(); // เก็บ "ทั้งหมด"
      const displayName = lineProfile?.displayName || "";
      setStatus(true, `✅ สวัสดีคุณ ${displayName || "ครับ"} ✨`);

      // ✅ เติมชื่อให้ช่องชื่อ (ถ้ายังว่าง)
      if (displayName && !$("inp-name").value.trim()) $("inp-name").value = displayName;
    } else {
      setStatus(false, "👤 โหมดบุคคลทั่วไป (กรอกข้อมูลแล้วเริ่มได้เลย)");
    }
  } catch (e) {
    clearTimeout(fallbackTimer);
    setStatus(false, "👤 โหมดบุคคลทั่วไป (กรอกข้อมูลแล้วเริ่มได้เลย)");
  }

  validateLanding_();
});

// =====================
// Quiz flow
// =====================
function resetQuizState_() {
  currentQ = 0;
  scores = { SCIENTIST: 0, DATA: 0, HEALER: 0, CREATIVE: 0 };
  userAnswers = [];
  lastResultType = "";
  lastResultTH = "";
  lastResultEN = "";
  sentResultMessage = false;
}

window.startQuiz = function startQuiz() {
  resetQuizState_();
  switchView("view-landing", "view-quiz");
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
      if (currentQ < questions.length) {
        renderQuestion_();
      } else {
        await onQuizCompleted_(); // ✅ หลังตอบข้อ 5 แสดงผล + log + ส่งข้อความ 1 ครั้ง
      }
    };
    container.appendChild(btn);
  });
}

async function onQuizCompleted_() {
  const { name, age, gender } = getLandingData_();
  const sessionCode = getSessionCode_();

  const type = computeResultType();
  const r = archetypes[type];
  lastResultType = type;
  lastResultTH = r.thTitle;
  lastResultEN = r.enName;

  setResultUI(type);
  switchView("view-quiz", "view-result");

  try {
    await callBackend_("quiz_complete", {
      sessionCode,
      certificateClick: 0,

      name, age, gender,
      answers: userAnswers.slice(0),
      resultType: lastResultType,
      resultTH: lastResultTH,
      resultEN: lastResultEN,
      liffInfo: { ...liffInfo },
      profile: lineProfile || null,
      client: buildClientMeta(),
    });
  } catch (e) {
    console.error("quiz_complete failed:", e);
    alert("บันทึกลงชีทไม่สำเร็จ: " + (e?.message || e));
  }

  await sendResultMessageOnce_(name, lastResultTH);
}

// =====================
// Send LINE message once
// =====================
async function sendResultMessageOnce_(name, resultTH) {
  if (sentResultMessage) return;
  sentResultMessage = true;

  try {
    if (typeof liff === "undefined") return;
    if (!(liff.isInClient && liff.isInClient())) return;
    if (!(liff.isLoggedIn && liff.isLoggedIn())) return;
    if (!liff.sendMessages) return;

    const safeName = name || (lineProfile?.displayName || "เพื่อนใหม่");
    const text =
      `สวัสดี ${safeName} 👋\n` +
      `ขอบคุณที่ร่วมสนุกกับ "The Future Compass 🧭"\n` +
      `ผลลัพธ์ของคุณคือ: "${resultTH}" ✨`;

    await liff.sendMessages([{ type: "text", text }]);
  } catch (_) {
    // เงียบไว้ (บางกรณี LINE ไม่อนุญาตส่งจาก external)
  }
}

// =====================
// Backend helper
// =====================
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

// =====================
// Result buttons
// =====================
window.restartToLanding = function restartToLanding() {
  // กลับหน้าแรก (ไม่กลับไป q1)
  resetQuizState_();

  // เคลียร์อายุ/เพศเสมอ (ให้กรอกใหม่), ชื่อคงไว้ถ้ามาจาก LINE
  const hasLineName = !!(lineProfile?.displayName);
  if (!hasLineName) $("inp-name").value = "";
  $("inp-age").value = "";
  $("inp-gender").value = "";

  validateLanding_();
  switchView("view-result", "view-landing");
};

window.goOA = function goOA() {
  // กลับไป OA
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
  const sessionCode = getSessionCode_();

  try {
    await callBackend_("certificate_click", {
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
  } catch (e) {
    console.error("certificate_click failed:", e);
    // still open form even if logging fails
  }

  try {
    if (typeof liff !== "undefined" && liff.openWindow) {
      liff.openWindow({ url: CERT_GOOGLE_FORM_URL, external: true });
      return;
    }
  } catch (_) {}
  window.open(CERT_GOOGLE_FORM_URL, "_blank");
};