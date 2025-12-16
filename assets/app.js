// web/assets/app.js
const { LIFF_ID, GAS_WEBAPP_URL, OA_URL } = window.APP_CONFIG;

let lineUserId = "";
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
  SCIENTIST: { title: "นักวิทยาศาสตร์ผู้พิทักษ์", icon: "🔬", desc: "ช่างสังเกต ชอบค้นหาคำตอบด้วยเหตุผล" },
  DATA:      { title: "พ่อมดแห่งข้อมูล",         icon: "💻", desc: "ชอบใช้ตรรกะและตัวเลขในการไขปัญหา" },
  HEALER:    { title: "ผู้เยียวยาสังคม",         icon: "❤️", desc: "มีความเห็นอกเห็นใจผู้อื่น ชอบช่วยเหลือ" },
  CREATIVE:  { title: "นักนวัตกรรมสร้างสรรค์",    icon: "🎨", desc: "จินตนาการไม่มีที่สิ้นสุด สร้างสรรค์สิ่งใหม่" },
};

function $(id){ return document.getElementById(id); }

function setStatus(ok, html){
  const statusDiv = $("liff-status");
  statusDiv.className = ok
    ? "text-sm text-green-700 font-bold bg-green-50 py-2 px-4 rounded-xl flex items-center justify-center gap-2 border border-green-200 shadow-sm"
    : "text-sm text-gray-500 font-medium bg-gray-50 py-2 px-4 rounded-xl flex items-center justify-center gap-2 border border-gray-200";
  statusDiv.innerHTML = html;
}

function showDebug(obj){
  const d = $("debug-info");
  d.style.display = "block";
  d.textContent = typeof obj === "string" ? obj : JSON.stringify(obj, null, 2);
}

window.addEventListener("load", async () => {
  const startBtn = $("btn-start");
  const fallbackTimer = setTimeout(() => {
    if (startBtn.disabled) {
      setStatus(false, "👤 โหมดบุคคลทั่วไป (LIFF init timeout)");
      startBtn.disabled = false;
      showDebug({ reason:"timeout", href: location.href, ua: navigator.userAgent });
    }
  }, 8000);

  if (typeof liff === "undefined") {
    clearTimeout(fallbackTimer);
    setStatus(false, "👤 โหมดบุคคลทั่วไป (No LIFF SDK)");
    startBtn.disabled = false;
    showDebug({ reason:"liff undefined", href: location.href });
    return;
  }

  try {
    // init ต้องรันที่ endpoint URL หรือใต้ endpoint เท่านั้น  [oai_citation:1‡LINE Developers](https://developers.line.biz/en/docs/liff/developing-liff-apps/?utm_source=chatgpt.com)
    await liff.init({ liffId: LIFF_ID, withLoginOnExternalBrowser: true });
    await liff.ready;
    clearTimeout(fallbackTimer);

    if (!liff.isLoggedIn()) {
      setStatus(false, `<span class="loader !w-4 !h-4"></span> กำลังยืนยันตัวตน...`);
      // redirect กลับหน้าปัจจุบัน (ไม่มี #fragment)
      const cleanHref = location.origin + location.pathname + location.search;
      liff.login({ redirectUri: cleanHref });
      return;
    }

    const profile = await liff.getProfile();
    lineUserId = profile?.userId || "";

    setStatus(true, `✅ สวัสดี ${profile?.displayName || "ครับ"}`);
    startBtn.disabled = false;
    startBtn.classList.add("pulse-slow");

    // email จะได้เมื่อเปิด scope email ใน LIFF settings เท่านั้น
    const token = liff.getDecodedIDToken?.();
    const email = token?.email;
    if (email && $("inp-email") && !$("inp-email").value) $("inp-email").value = email;

    showDebug({ ok:true, isInClient:liff.isInClient(), os:liff.getOS?.(), href:location.href, userId: lineUserId });
  } catch (err) {
    clearTimeout(fallbackTimer);
    setStatus(false, "👤 โหมดบุคคลทั่วไป (LIFF init failed)");
    startBtn.disabled = false;
    showDebug({ ok:false, error:{ name:err?.name, message:err?.message, code:err?.code }, href:location.href });
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

function showResult() {
  const maxType = Object.keys(scores).reduce((a,b)=> scores[a] > scores[b] ? a : b);
  const r = archetypes[maxType];
  $("res-icon").innerText = r.icon;
  $("res-title").innerText = r.title;
  $("res-desc").innerText = r.desc;
  switchView("view-quiz", "view-result");
}

window.submitForm = async function submitForm() {
  const btn = $("btn-submit");
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="loader"></span>';

  const maxType = Object.keys(scores).reduce((a,b)=> scores[a] > scores[b] ? a : b);

  const payload = {
    action: "submit",
    data: {
      name: $("inp-name").value.trim(),
      grade: $("inp-grade").value,
      province: $("inp-province").value.trim(),
      school: $("inp-school").value.trim(),
      phone: $("inp-phone").value.trim(),
      email: $("inp-email").value.trim(),
      result: archetypes[maxType].title,
      lineUserId,
      q1: userAnswers[0] || "", q2: userAnswers[1] || "", q3: userAnswers[2] || "", q4: userAnswers[3] || "", q5: userAnswers[4] || ""
    }
  };

  try {
    // ส่งแบบ text/plain ลด preflight/CORS issues
    const res = await fetch(GAS_WEBAPP_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    });

    // ถ้าอ่าน JSON ไม่ได้ (บางสภาพแวดล้อม) ก็ถือว่าส่งสำเร็จหากไม่ throw
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