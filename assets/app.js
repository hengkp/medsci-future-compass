// web/assets/app.js
const { LIFF_ID, GAS_WEBAPP_URL, OA_URL } = window.APP_CONFIG;

let lineUserId = "";     // will stay "" in guest mode
let lineDisplayName = ""; // optional
let currentQ = 0;
let scores = { SCIENTIST: 0, DATA: 0, HEALER: 0, CREATIVE: 0 };
let userAnswers = [];

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

function $(id) { return document.getElementById(id); }

function setStatus(ok, html) {
  const statusDiv = $("liff-status");
  statusDiv.className = ok
    ? "text-sm text-green-700 font-bold bg-green-50 py-2 px-4 rounded-xl flex items-center justify-center gap-2 border border-green-200 shadow-sm"
    : "text-sm text-gray-500 font-medium bg-gray-50 py-2 px-4 rounded-xl flex items-center justify-center gap-2 border border-gray-200";
  statusDiv.innerHTML = html;
}

/**
 * ✅ KEY CHANGE:
 * - init LIFF if possible
 * - DO NOT call liff.login() at all
 * - If logged in, use profile; else guest mode
 */
window.addEventListener("load", async () => {
  const startBtn = $("btn-start");

  const fallbackTimer = setTimeout(() => {
    if (startBtn.disabled) {
      setStatus(false, "👤 โหมดบุคคลทั่วไป (เข้าเล่นได้เลย)");
      startBtn.disabled = false;
    }
  }, 8000);

  // If LIFF SDK not loaded -> guest mode
  if (typeof liff === "undefined") {
    clearTimeout(fallbackTimer);
    setStatus(false, "👤 โหมดบุคคลทั่วไป (เข้าเล่นได้เลย)");
    startBtn.disabled = false;
    return;
  }

  try {
    await liff.init({ liffId: LIFF_ID, withLoginOnExternalBrowser: false });
    await liff.ready;
    clearTimeout(fallbackTimer);

    // If user is already logged in -> get profile (no forcing)
    if (liff.isLoggedIn && liff.isLoggedIn()) {
      const profile = await liff.getProfile();
      lineUserId = profile?.userId || "";
      lineDisplayName = profile?.displayName || "";

      setStatus(true, `✅ ยินดีต้อนรับคุณ ${lineDisplayName || "ครับ"} ✨`);

      // email only if scope email enabled AND user is logged in
      const token = liff.getDecodedIDToken?.();
      const email = token?.email;
      if (email && $("inp-email") && !$("inp-email").value) $("inp-email").value = email;
    } else {
      // Not logged in -> guest mode
      setStatus(false, "👤 โหมดบุคคลทั่วไป (เข้าเล่นได้เลย)");
    }

    startBtn.disabled = false;
    startBtn.classList.add("pulse-slow");
  } catch (err) {
    // Any LIFF error -> guest mode
    clearTimeout(fallbackTimer);
    setStatus(false, "👤 โหมดบุคคลทั่วไป (เข้าเล่นได้เลย)");
    startBtn.disabled = false;
  }
});

// --- UI flow ---
function switchView(fromId, toId) {
  $(fromId).classList.add("hidden");
  $(toId).classList.remove("hidden");
  $("main-scroll").scrollTop = 0;
}

window.startQuiz = function startQuiz() {
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
    btn.onclick = () => {
      scores[ans.type]++;
      userAnswers.push(ans.text);
      currentQ++;
      if (currentQ < questions.length) renderQuestion();
      else showResult();
    };
    container.appendChild(btn);
  });
}

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

function showResult() {
  const type = computeResultType();
  setResultUI(type);
  switchView("view-quiz", "view-result");
}

window.submitForm = async function submitForm() {
  const btn = $("btn-submit");
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="loader"></span>';

  const type = computeResultType();
  const r = archetypes[type];

  const payload = {
    action: "submit",
    data: {
      name: $("inp-name").value.trim(),
      grade: $("inp-grade").value,
      province: $("inp-province").value.trim(),
      school: $("inp-school").value.trim(),
      phone: $("inp-phone").value.trim(),
      email: $("inp-email").value.trim(),

      resultType: type,
      resultTH: r.thTitle,
      resultEN: r.enName,

      // ✅ will be "" in guest mode
      lineUserId,

      q1: userAnswers[0] || "",
      q2: userAnswers[1] || "",
      q3: userAnswers[2] || "",
      q4: userAnswers[3] || "",
      q5: userAnswers[4] || ""
    }
  };

  try {
    const res = await fetch(GAS_WEBAPP_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
    });

    let out = null;
    try { out = await res.json(); } catch (_) {}

    if (out && out.status === "error") throw new Error(out.message || "Unknown backend error");

    switchView("view-result", "view-success");
  } catch (e) {
    alert("บันทึกไม่สำเร็จ: " + (e?.message || e));
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
};

window.closeApp = function closeApp() {
  if (typeof liff !== "undefined" && liff.isInClient && liff.isInClient()) liff.closeWindow();
  else window.location.href = OA_URL;
};