(function(){
  "use strict";

  const KEY = "agriqueue-demo-state-v1";
  let state = {
    farmer: null,
    booking: null,   // {centre, date, slot, token, queueLength}
    servingToken: null,
    procurement: null // {stage, quantity, rate, amount}
  };

  let queueTimer = null;

  // ---------- storage (browser localStorage) ----------
  async function loadState(){
    try{
      const raw = localStorage.getItem(KEY);
      if(raw){ state = JSON.parse(raw); }
    }catch(e){ console.error("Storage read error:", e); }
  }
  async function saveState(){
    try{
      localStorage.setItem(KEY, JSON.stringify(state));
    }catch(e){ console.error("Storage write error:", e); }
  }

  // ---------- toast ----------
  function toast(msg){
    const wrap = document.getElementById("toast-wrap");
    const el = document.createElement("div");
    el.className = "toast";
    el.innerHTML = '<div class="dot"></div><div>' + msg + '</div>';
    wrap.appendChild(el);
    setTimeout(()=>{ el.style.opacity = "0"; el.style.transition="opacity .3s"; setTimeout(()=>el.remove(),300); }, 4600);
  }

  // ---------- tabs ----------
  const tabButtons = Array.from(document.querySelectorAll("#tabs button"));
  function setTab(name){
    tabButtons.forEach(b=>b.classList.toggle("active", b.dataset.tab===name));
    document.querySelectorAll(".panel").forEach(p=>p.classList.toggle("active", p.id==="panel-"+name));
    if(name==="queue") renderQueue();
    if(name==="track") renderTrack();
  }
  tabButtons.forEach(b=>{
    b.addEventListener("click", ()=>{ if(!b.disabled) setTab(b.dataset.tab); });
  });
  function unlockTab(name){
    const b = tabButtons.find(x=>x.dataset.tab===name);
    if(b) b.disabled = false;
  }

  // ---------- register ----------
  document.getElementById("form-register").addEventListener("submit", async function(e){
    e.preventDefault();
    const farmerId = "AGQ-" + Math.floor(10000 + Math.random()*89999);
    state.farmer = {
      name: document.getElementById("reg-name").value.trim(),
      phone: document.getElementById("reg-phone").value.trim(),
      village: document.getElementById("reg-village").value.trim(),
      land: document.getElementById("reg-land").value,
      crop: document.getElementById("reg-crop").value,
      farmerId
    };
    await saveState();
    unlockTab("book");
    toast("Registration successful. Your Farmer ID is <strong>"+farmerId+"</strong>.");
    setTab("book");
  });

  // ---------- book slot ----------
  const dateInput = document.getElementById("book-date");
  const today = new Date();
  const minD = today.toISOString().slice(0,10);
  const maxDate = new Date(today.getTime() + 6*86400000);
  dateInput.min = minD;
  dateInput.max = maxDate.toISOString().slice(0,10);

  document.getElementById("form-book").addEventListener("submit", async function(e){
    e.preventDefault();
    const centre = document.getElementById("book-centre").value;
    const date = document.getElementById("book-date").value;
    const slot = document.getElementById("book-slot").value;
    const token = Math.floor(15 + Math.random()*40);
    const queueLength = Math.floor(6 + Math.random()*10); // how many ahead of you right now

    state.booking = { centre, date, slot, token, queueLength };
    state.servingToken = Math.max(1, token - queueLength);
    state.procurement = null;
    await saveState();

    unlockTab("queue");
    const dateLabel = new Date(date+"T00:00:00").toLocaleDateString(undefined,{ day:"numeric", month:"short" });
    toast("SMS: Slot confirmed at <strong>"+centre+"</strong> on "+dateLabel+", "+slot+". Your token is <strong>#"+token+"</strong>.");
    setTab("queue");
  });

  // ---------- queue ----------
  function renderQueue(){
    const el = document.getElementById("queue-content");
    if(!state.booking){
      el.innerHTML = emptyState("Book a slot first to see your live queue position.");
      return;
    }
    const b = state.booking;
    const serving = state.servingToken;
    const position = Math.max(0, b.token - serving);
    const pct = Math.min(100, Math.round((serving / b.token) * 100));
    const eta = position * 4; // ~4 min per farmer

    el.innerHTML = `
      <div class="queue-hero">
        <div class="label">CURRENTLY SERVING</div>
        <div class="big">${serving}</div>
        <div class="sub">Your token is <strong>#${b.token}</strong> — ${position === 0 ? "you're up next" : position + " farmer" + (position===1?"":"s") + " ahead of you"}</div>
        <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
      </div>
      <div class="queue-grid">
        <div class="stat-card"><div class="k">Estimated wait</div><div class="v">${position===0?"Now":"~"+eta+" min"}</div></div>
        <div class="stat-card"><div class="k">Centre</div><div class="v" style="font-size:17px;">${b.centre}</div></div>
      </div>
      <div class="card">
        <div class="summary-row"><span>Booked slot</span><span>${b.slot}</span></div>
        <div class="summary-row"><span>Date</span><span>${new Date(b.date+"T00:00:00").toLocaleDateString(undefined,{ weekday:"long", day:"numeric", month:"long" })}</span></div>
        <div class="summary-row"><span>Farmer</span><span>${state.farmer.name} (${state.farmer.farmerId})</span></div>
      </div>
      <div style="margin-top:20px; text-align:center;">
        <button class="btn btn-primary" id="arrive-btn" ${position>0 ? "" : ""}>I've arrived at the centre</button>
      </div>
    `;
    document.getElementById("arrive-btn").addEventListener("click", async ()=>{
      state.procurement = { stage: 1, quantity: null, rate: null, amount: null };
      stopQueueTimer();
      await saveState();
      unlockTab("track");
      toast("Checked in. Proceed to weighment counter.");
      setTab("track");
    });

    startQueueTimer();
  }

  function startQueueTimer(){
    stopQueueTimer();
    queueTimer = setInterval(async ()=>{
      if(!state.booking) return;
      if(state.servingToken < state.booking.token){
        state.servingToken += 1;
        await saveState();
        renderQueue();
      }
    }, 3500);
  }
  function stopQueueTimer(){
    if(queueTimer){ clearInterval(queueTimer); queueTimer = null; }
  }

  // ---------- track payment ----------
  const STAGES = ["Weighment", "Grading", "Payment Initiated", "Payment Credited"];
  const CROP_RATES = { "Wheat":2275, "Paddy (Rice)":2300, "Maize":2225, "Mustard":5650, "Sugarcane":340 };

  function renderTrack(){
    const el = document.getElementById("track-content");
    if(!state.procurement){
      el.innerHTML = emptyState("Check in from the Queue Status tab once your token is called.");
      return;
    }
    const p = state.procurement;

    if(p.quantity === null && p.stage >= 1){
      p.quantity = +(Math.random()*15 + 8).toFixed(1);
      p.rate = CROP_RATES[state.farmer.crop] || 2250;
      p.amount = Math.round(p.quantity * p.rate);
    }

    let stepsHtml = STAGES.map((label, i)=>{
      const idx = i+1;
      const cls = idx < p.stage ? "done" : idx===p.stage ? "current" : "";
      const mark = idx < p.stage ? "✓" : idx;
      return `<div class="step ${cls}"><div class="line"></div><div class="circle">${mark}</div><div class="label">${label}</div></div>`;
    }).join("");

    let bottom = "";
    if(p.stage < STAGES.length){
      bottom = `
        <div class="card" style="text-align:center;">
          <div class="summary-row"><span>Produce</span><span>${state.farmer.crop}</span></div>
          <div class="summary-row"><span>Quantity recorded</span><span>${p.quantity} quintals</span></div>
          <div class="summary-row"><span>MSP rate</span><span>₹${p.rate} / quintal</span></div>
          <div style="margin-top:18px;">
            <button class="btn btn-primary" id="advance-btn">Mark "${STAGES[p.stage-1]}" complete</button>
          </div>
        </div>`;
    } else {
      bottom = `
        <div class="payout-card">
          <div class="amount">₹${p.amount.toLocaleString("en-IN")}</div>
          <div class="note">Credited to bank account linked with ${state.farmer.farmerId}</div>
        </div>`;
    }

    el.innerHTML = `<div class="stepper">${stepsHtml}</div>${bottom}`;

    const btn = document.getElementById("advance-btn");
    if(btn){
      btn.addEventListener("click", async ()=>{
        p.stage += 1;
        await saveState();
        renderTrack();
        if(p.stage === STAGES.length){
          toast("SMS: Payment of ₹"+p.amount.toLocaleString("en-IN")+" credited to your account.");
        } else {
          toast("SMS: Status updated — "+STAGES[p.stage-1]+" in progress.");
        }
      });
    }
  }

  function emptyState(msg){
    return `<div class="empty">
      <svg width="46" height="46" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="#C9C2AE" stroke-width="1.5"/><path d="M8 12h8M12 8v8" stroke="#C9C2AE" stroke-width="1.5" stroke-linecap="round"/></svg>
      <div>${msg}</div>
    </div>`;
  }

  // ---------- reset ----------
  document.getElementById("reset-btn").addEventListener("click", async ()=>{
    stopQueueTimer();
    state = { farmer:null, booking:null, servingToken:null, procurement:null };
    await saveState();
    tabButtons.forEach(b=>{ if(b.dataset.tab!=="register") b.disabled = true; });
    document.getElementById("form-register").reset();
    document.getElementById("form-book").reset();
    setTab("register");
    toast("Demo reset.");
  });

  // ---------- init ----------
  (async function init(){
    await loadState();
    if(state.farmer){ unlockTab("book"); }
    if(state.booking){ unlockTab("queue"); }
    if(state.procurement){ unlockTab("track"); }

    if(state.procurement){ setTab("track"); }
    else if(state.booking){ setTab("queue"); }
    else if(state.farmer){ setTab("book"); }
    else { setTab("register"); }
  })();

})();