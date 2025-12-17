// web/assets/app.js
const { LIFF_ID, GAS_WEBAPP_URL, OA_URL, CERT_GOOGLE_FORM_URL } = window.APP_CONFIG;

let lineUserId = "";      
let lineDisplayName = ""; 
let linePictureUrl = "";
let liffInfo = { os:"", lang:"", version:"", isInClient:false, isLoggedIn:false };

let currentQ = 0;
let scores = { SCIENTIST: 0, DATA: 0, HEALER: 0, CREATIVE: 0 };
let userAnswers = [];        // เก็บ text
let userAnswerMeta = [];     // เก็บ meta (สำหรับ age/gender)

let lastResultType = "";
let lastResultTH = "";
let lastResultEN = "";
let impliedAge = "";
let impliedGender = "";

let quizRecorded = false;
let giftEligibility = { eligible:false, alreadyPlayed:false, todayRemaining:0, todayCap:100, existingStatus:"" };
let giftState = { drawn:false, status:"" };

function $(id) { return document.getElementById(id); }

function setStatus(ok, html) {
  const statusDiv = $("liff-status");
  statusDiv.className = ok
    ? "text-sm text-green-700 font-bold bg-green-50 py-2 px-4 rounded-xl flex items-center justify-center gap-2 border border-green-200 shadow-sm"
    : "text-sm text-gray-500 font-medium bg-gray-50 py-2 px-4 rounded-xl flex items-center justify-center gap-2 border border-gray-200";
  statusDiv.innerHTML = html;
}

function switchView(fromId, toId) {
  $(fromId).classList.add("hidden");
  $(toId).classList.remove("hidden");
  $("main-scroll").scrollTop = 0;
}

function safeNowISO() {
  try { return new Date().toISOString(); } catch { return ""; }
}

function buildClientMeta() {
  const meta = {
    tsClientISO: safeNowISO(),
    ua: navigator.userAgent || "",
    referrer: document.referrer || "",
  };
  return meta;
}

/* ===========================
   ✅ Questions (เพิ่ม 2 ข้อ: age + gender)
   =========================== */

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

  // ✅ NEW Q6 (implied age)
  { q: "6. เข็มทิศอนาคตบอกว่า...ช่วงอายุโดยประมาณของน้องคือ?", answers: [
    { text: "ต่ำกว่า 13", type: "META", meta: { impliedAge: "<13" } },
    { text: "13–15", type: "META", meta: { impliedAge: "13-15" } },
    { text: "16–18", type: "META", meta: { impliedAge: "16-18" } },
    { text: "19+", type: "META", meta: { impliedAge: "19+" } },
  ]},

  // ✅ NEW Q7 (implied gender)
  { q: "7. น้องอยากให้เรียกด้วยสรรพนาม/ตัวตนแบบไหน?", answers: [
    { text: "เขา/ผม", type: "META", meta: { impliedGender: "male_or_he" } },
    { text: "เธอ/ฉัน", type: "META", meta: { impliedGender: "female_or_she" } },
    { text: "เขา/เธอได้หมด", type: "META", meta: { impliedGender: "any_pronoun" } },
    { text: "ไม่อยากระบุ", type: "META", meta: { impliedGender: "no_answer" } },
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
  // META answers do not affect score
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

/* ===========================
   ✅ LIFF init (ยังไม่ force login)
   =========================== */
window.addEventListener("load", async () => {
  const startBtn = $("btn-start");

  $("q-total").innerText = String(questions.length);

  const fallbackTimer = setTimeout(() => {
    if (startBtn.disabled) {
      setStatus(false, "👤 โหมดบุคคลทั่วไป (ทำแบบทดสอบได้)");
      startBtn.disabled = false;
    }
  }, 8000);

  if (typeof liff === "undefined") {
    clearTimeout(fallbackTimer);
    setStatus(false, "👤 โหมดบุคคลทั่วไป (ทำแบบทดสอบได้)");
    startBtn.disabled = false;
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
      const profile = await liff.getProfile();
      lineUserId = profile?.userId || "";
      lineDisplayName = profile?.displayName || "";
      linePictureUrl = profile?.pictureUrl || "";
      setStatus(true, `✅ ยินดีต้อนรับคุณ ${lineDisplayName || "ครับ"} ✨`);
    } else {
      setStatus(false, "👤 โหมดบุคคลทั่วไป (ทำแบบทดสอบได้)");
    }

    startBtn.disabled = false;
    startBtn.classList.add("pulse-slow");
  } catch (err) {
    clearTimeout(fallbackTimer);
    setStatus(false, "👤 โหมดบุคคลทั่วไป (ทำแบบทดสอบได้)");
    startBtn.disabled = false;
  }
});

/* ===========================
   ✅ Quiz flow
   =========================== */
function resetQuizState() {
  currentQ = 0;
  scores = { SCIENTIST: 0, DATA: 0, HEALER: 0, CREATIVE: 0 };
  userAnswers = [];
  userAnswerMeta = [];
  impliedAge = "";
  impliedGender = "";
  lastResultType = "";
  lastResultTH = "";
  lastResultEN = "";
  quizRecorded = false;

  giftEligibility = { eligible:false, alreadyPlayed:false, todayRemaining:0, todayCap:100, existingStatus:"" };
  giftState = { drawn:false, status:"" };
}

window.startQuiz = function startQuiz() {
  resetQuizState();
  switchView("view-landing", "view-quiz");
  renderQuestion();
};

function renderQuestion() {
  const qData = questions[currentQ];
  $("q-num").innerText = currentQ + 1;
  $("progress-bar").style.width = `${((currentQ + 1) / questions.length) * 100}%`;
  $("q-text").innerText = qData.q;

  const container = $("q-answers");
  container.innerHTML = "";

  qData.answers.forEach(ans => {
    const btn = document.createElement("button");
    btn.className = "choice-btn";
    btn.innerHTML = `<span>${ans.text}</span> <span class="text-gray-300 text-xl">➜</span>`;
    btn.onclick = async () => {
      // Record answer
      userAnswers.push(ans.text);
      userAnswerMeta.push(ans.meta || {});

      // Score only non-META
      if (ans.type && ans.type !== "META") {
        scores[ans.type] = (scores[ans.type] || 0) + 1;
      }

      // Apply implied meta
      if (ans.meta?.impliedAge) impliedAge = ans.meta.impliedAge;
      if (ans.meta?.impliedGender) impliedGender = ans.meta.impliedGender;

      currentQ++;

      if (currentQ < questions.length) {
        renderQuestion();
      } else {
        await showResultAndRecord(); // ✅ requirement: record + send message first
      }
    };
    container.appendChild(btn);
  });
}

async function showResultAndRecord() {
  const type = computeResultType();
  const r = archetypes[type];
  lastResultType = type;
  lastResultTH = r.thTitle;
  lastResultEN = r.enName;

  setResultUI(type);

  // Show result UI first (fast) but we will lock gift until record ok
  switchView("view-quiz", "view-result");

  // ✅ Disable gift until we finish record step
  const btnGift = $("btn-gift");
  if (btnGift) {
    btnGift.disabled = true;
    btnGift.innerHTML = '⏳ กำลังบันทึกผล...';
  }

  try {
    await postQuizComplete_();     // record + push greeting/result message
    quizRecorded = true;
  } catch (e) {
    // still allow user to see result, but gift should be blocked if not recorded
    quizRecorded = false;
    alert("บันทึกผลไม่สำเร็จ (ยังดูผลได้) : " + (e?.message || e));
  } finally {
    if (btnGift) {
      btnGift.disabled = false;
      btnGift.innerHTML = "🎁 ลุ้นรางวัล";
    }
  }
}

/* ===========================
   ✅ Backend calls
   =========================== */
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

function buildCommonData_() {
  return {
    lineUserId,
    lineDisplayName,
    linePictureUrl,
    liff: { ...liffInfo },
    client: buildClientMeta(),
  };
}

async function postQuizComplete_() {
  const common = buildCommonData_();
  const payload = {
    ...common,

    resultType: lastResultType,
    resultTH: lastResultTH,
    resultEN: lastResultEN,

    impliedAge: impliedAge || "",
    impliedGender: impliedGender || "",

    answers: userAnswers.slice(0),
  };

  // ✅ ส่งข้อความทักทาย + ผลลัพธ์ + บันทึกชีท
  return await callBackend_("quiz_complete", payload);
}

/* ===========================
   ✅ Result page actions
   =========================== */
window.restartQuiz = function restartQuiz() {
  resetQuizState();
  switchView("view-result", "view-landing");
};

window.goOA = function goOA() {
  window.location.href = OA_URL;
};

window.openCertificateFormExternal = async function openCertificateFormExternal() {
  // log click -> certificate_status = ต้องการ
  try {
    await callBackend_("certificate_click", {
      ...buildCommonData_(),
      certificateStatus: "ต้องการ",
      resultType: lastResultType,
      resultTH: lastResultTH,
      impliedAge: impliedAge || "",
      impliedGender: impliedGender || "",
    });
  } catch (_) {
    // allow open anyway
  }
  window.open(CERT_GOOGLE_FORM_URL, "_blank");
};

/* ===========================
   ✅ Gift flow (Line account only)
   =========================== */
function setStickerMode_(mode) {
  // mode: idle | checking | flashing | success | fail
  const L = $("sticker-left");
  const R = $("sticker-right");
  if (!L || !R) return;

  L.classList.remove("flash", "active");
  R.classList.remove("flash", "active");

  if (mode === "flashing") {
    L.classList.add("flash");
    R.classList.add("flash");
  } else if (mode === "success") {
    L.classList.add("active");
  } else if (mode === "fail") {
    R.classList.add("active");
  }
}

function setGiftMessage_(html) {
  const box = $("gift-message");
  if (box) box.innerHTML = html;
}

function disableGiftButton_(disabled, labelHTML) {
  const btn = $("gift-btn");
  if (!btn) return;
  if (disabled) btn.classList.add("disabled");
  else btn.classList.remove("disabled");
  if (labelHTML) btn.innerHTML = labelHTML;
}

window.backToResult = function backToResult() {
  switchView("view-gift", "view-result");
};

window.openGift = async function openGift() {
  // show gift view
  switchView("view-result", "view-gift");

  const name = lineDisplayName ? lineDisplayName : "เพื่อนใหม่";
  $("gift-title").innerText = `สวัสดี ${name}!`;
  $("gift-sub").innerText = `ผลของคุณคือ: “${lastResultTH || "—"}”`;

  setStickerMode_("checking");
  disableGiftButton_(true, "กำลัง<br>ตรวจสิทธิ์");
  setGiftMessage_('⏳ กำลังตรวจสอบสิทธิ์และโควต้า...');

  // ✅ Gift privileged to LINE account only
  const canUseLiff = (typeof liff !== "undefined");
  const isLoggedIn = !!(canUseLiff && liff.isLoggedIn && liff.isLoggedIn());

  if (!isLoggedIn) {
    setStickerMode_("idle");
    disableGiftButton_(true, "ล็อกอิน<br>ก่อนนะ");
    setGiftMessage_(
      `🚫 “ลุ้นรางวัล” สำหรับผู้ที่ล็อกอิน LINE เท่านั้น<br><br>` +
      `👉 กรุณาเปิดผ่าน LINE หรือกดล็อกอินเพื่อยืนยันตัวตน`
    );

    // Offer direct login if possible (no guest)
    if (canUseLiff && liff.login) {
      // show a helper button by reusing hint area
      const hint = $("gift-hint");
      if (hint) {
        hint.innerHTML = `<button class="btn-secondary !py-3 !text-base" onclick="forceLineLogin()">🔐 ล็อกอินด้วย LINE</button>`;
      }
    }
    return;
  }

  // must have userId
  if (!lineUserId) {
    setStickerMode_("idle");
    disableGiftButton_(true, "ไม่พบ<br>User");
    setGiftMessage_("⚠️ ระบบไม่พบ LINE userId กรุณาเปิดใน LINE Client แล้วลองใหม่อีกครั้ง");
    return;
  }

  // require quiz recorded (fairness)
  if (!quizRecorded) {
    setStickerMode_("idle");
    disableGiftButton_(true, "บันทึก<br>ไม่สำเร็จ");
    setGiftMessage_("⚠️ ยังไม่สามารถลุ้นรางวัลได้ เพราะบันทึกผลแบบทดสอบไม่สำเร็จ กรุณากดเล่นใหม่อีกครั้ง");
    return;
  }

  // check eligibility from sheets
  try {
    const out = await callBackend_("gift_status", {
      ...buildCommonData_(),
      resultType: lastResultType,
      resultTH: lastResultTH,
      impliedAge: impliedAge || "",
      impliedGender: impliedGender || "",
    });

    giftEligibility = {
      eligible: !!out.eligible,
      alreadyPlayed: !!out.alreadyPlayed,
      todayRemaining: Number(out.todayRemaining || 0),
      todayCap: Number(out.todayCap || 100),
      existingStatus: out.existingStatus || "",
    };

    if (giftEligibility.alreadyPlayed) {
      setStickerMode_(giftEligibility.existingStatus === "SUCCESS" ? "success" : "fail");
      disableGiftButton_(true, "เล่นแล้ว<br>วันนี้");
      setGiftMessage_(
        `🎉 คุณได้เล่นลุ้นรางวัลไปแล้วครับ<br>` +
        `ผลล่าสุด: <b>${giftEligibility.existingStatus || "—"}</b><br><br>` +
        `ชวนเพื่อนมาเล่นต่อได้เลย! 🧭`
      );
      return;
    }

    if (!giftEligibility.eligible) {
      setStickerMode_("idle");
      disableGiftButton_(true, "ยังไม่<br>พร้อม");
      setGiftMessage_("⚠️ ยังไม่สามารถเล่นได้ในขณะนี้");
      return;
    }

    if (giftEligibility.todayRemaining <= 0) {
      setStickerMode_("idle");
      disableGiftButton_(true, "โควต้า<br>เต็ม");
      setGiftMessage_(
        `😢 วันนี้มีผู้ได้รางวัลครบ <b>${giftEligibility.todayCap}</b> คนแล้ว<br>` +
        `ตอนนี้โอกาสเป็น <b>0%</b> แล้วครับ แต่ยังรับเกียรติบัตรได้ 🏆`
      );
      return;
    }

    // eligible
    setStickerMode_("idle");
    disableGiftButton_(false, "กดลุ้น<br>ตอนนี้!");
    setGiftMessage_(
      `✅ พร้อมลุ้นแล้ว! วันนี้ยังเหลือสิทธิ์ของรางวัลอีกประมาณ <b>${giftEligibility.todayRemaining}</b> จาก ${giftEligibility.todayCap}<br>` +
      `กดปุ่มวงกลมเพื่อสุ่มผลลุ้นรางวัล`
    );
  } catch (e) {
    setStickerMode_("idle");
    disableGiftButton_(true, "ผิดพลาด");
    setGiftMessage_("❌ ตรวจสอบสิทธิ์ไม่สำเร็จ: " + (e?.message || e));
  }
};

window.forceLineLogin = function forceLineLogin() {
  if (typeof liff !== "undefined" && liff.login) liff.login();
};

window.drawGift = async function drawGift() {
  // pre-check
  if (!lineUserId) return;

  // Start animation
  setStickerMode_("flashing");
  disableGiftButton_(true, "กำลัง<br>สุ่ม...");
  setGiftMessage_('🎲 กำลังสุ่มผล... ขอให้โชคดี!');

  try {
    const out = await callBackend_("draw_gift", {
      ...buildCommonData_(),
      resultType: lastResultType,
      resultTH: lastResultTH,
      resultEN: lastResultEN,
      impliedAge: impliedAge || "",
      impliedGender: impliedGender || "",
    });

    const status = out.giftStatus || "FAIL";
    giftState.drawn = true;
    giftState.status = status;

    // Stop flashing -> show result sticker
    setStickerMode_(status === "SUCCESS" ? "success" : "fail");

    if (status === "SUCCESS") {
      setGiftMessage_(
        `🎉 <b>ยินดีด้วย!</b> คุณได้รับของรางวัลวันนี้<br><br>` +
        `👉 กรุณา <b>หยิบฉลาก 1 ชิ้น จากต้นคริสมาสต์</b> ที่บูทครับ 🎄`
      );
    } else {
      setGiftMessage_(
        `😢 <b>เสียใจด้วย</b> รอบนี้ยังไม่ถูกรางวัล<br><br>` +
        `🎁 แต่คุณสามารถ <b>รับรางวัลปลอบใจที่บูท</b> ได้เลยครับ`
      );
    }

    disableGiftButton_(true, "รับผลแล้ว<br>✓");
  } catch (e) {
    setStickerMode_("idle");
    disableGiftButton_(false, "ลองอีก<br>ครั้ง");
    setGiftMessage_("❌ สุ่มไม่สำเร็จ: " + (e?.message || e));
  }
};

