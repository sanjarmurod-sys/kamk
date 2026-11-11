(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const native = window.KAMKNative || null;
  const state = {
    backendUrl: "",
    token: "",
    user: null,
    pc: null,
    channel: null,
    localStream: null,
    active: false,
    starting: false,
    assistantText: "",
    pendingBatch: null,
    timer: null,
    startedAt: 0,
    processedCalls: new Set()
  };

  function nativeGet(method, fallback = "") {
    try { return native && typeof native[method] === "function" ? native[method]() : fallback; }
    catch (_) { return fallback; }
  }
  function nativeSet(method, value) {
    try { if (native && typeof native[method] === "function") native[method](value); } catch (_) {}
  }
  function showScreen(name) {
    ["loginScreen", "agentScreen", "settingsScreen"].forEach(id => $(id).classList.add("hidden"));
    $(name).classList.remove("hidden");
  }
  function setConnection(label, mode = "") {
    const pill = $("connectionPill");
    pill.className = "connection-pill " + mode;
    pill.innerHTML = "<i></i> " + escapeHtml(label);
  }
  function setVoiceState(status, hint, mode = "") {
    $("voiceStatus").textContent = status;
    $("voiceHint").textContent = hint;
    $("voiceOrb").className = "voice-orb " + mode;
  }
  function setLoginMessage(message, isError = true) {
    $("loginMessage").textContent = message || "";
    $("loginMessage").style.color = isError ? "var(--red)" : "var(--green)";
  }
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, c => ({
      "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
    }[c]));
  }
  async function api(path, options = {}) {
    if (!state.backendUrl) throw new Error("Avval server manzilini kiriting.");
    const headers = Object.assign({ "Content-Type": "application/json" }, options.headers || {});
    if (state.token) headers.Authorization = "Bearer " + state.token;
    const response = await fetch(state.backendUrl + path, Object.assign({}, options, { headers }));
    const text = await response.text();
    let payload = {};
    try { payload = text ? JSON.parse(text) : {}; } catch (_) { payload = { error: text || "Server javobi noto'g'ri." }; }
    if (!response.ok) throw new Error(payload.error || ("Server xatosi: " + response.status));
    return payload;
  }

  function appendMessage(role, text) {
    const box = $("conversation");
    const empty = box.querySelector(".empty-conversation");
    if (empty) empty.remove();
    const wrapper = document.createElement("div");
    wrapper.className = "message " + (role === "user" ? "user" : "assistant");
    const label = document.createElement("div");
    label.className = "message-label";
    label.textContent = role === "user" ? "DISPETCHER" : "KAMK AI";
    const bubble = document.createElement("div");
    bubble.className = "message-bubble";
    bubble.textContent = text;
    wrapper.append(label, bubble);
    box.appendChild(wrapper);
    box.scrollTop = box.scrollHeight;
  }

  function showPending(batch) {
    state.pendingBatch = batch;
    $("pendingCard").classList.remove("hidden");
    const lines = [
      "Sana: " + batch.observation_date,
      "Soat: " + String(batch.hour).padStart(2, "0") + ":00"
    ];
    (batch.readings || []).forEach(item => {
      lines.push(item.point_title + " · H " + item.h_value +
        (item.q_value === null ? "" : " · Q " + item.q_value));
    });
    $("pendingDetails").textContent = lines.join("\n");
  }

  function hidePending() {
    state.pendingBatch = null;
    $("pendingCard").classList.add("hidden");
    $("pendingDetails").textContent = "";
  }

  function updateTimer() {
    if (!state.active || !state.startedAt) return;
    const seconds = Math.floor((Date.now() - state.startedAt) / 1000);
    const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
    const ss = String(seconds % 60).padStart(2, "0");
    $("sessionTimer").textContent = "JONLI SESSIYA · " + mm + ":" + ss;
  }

  async function login(event) {
    event.preventDefault();
    const url = $("backendUrl").value.trim().replace(/\/+$/, "");
    const username = $("username").value.trim();
    const password = $("password").value;
    if (!/^https:\/\//i.test(url) && !/^http:\/\/(10\.0\.2\.2|localhost)(:\d+)?$/i.test(url)) {
      setLoginMessage("Server manzili HTTPS bo'lishi kerak.");
      return;
    }
    state.backendUrl = url;
    nativeSet("setBackendUrl", url);
    setLoginMessage("Serverga ulanmoqda…", false);
    try {
      const result = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password })
      });
      state.token = result.token;
      state.user = result.user;
      nativeSet("setAccessToken", state.token);
      $("password").value = "";
      renderUser();
      appendMessage("assistant", "Assalomu alaykum, " + (state.user.display_name || state.user.username) +
        ". Men KAMK AI dispetcher agentiman. Jonli suhbatni boshlashingiz mumkin.");
      showScreen("agentScreen");
      setLoginMessage("", false);
    } catch (error) {
      setLoginMessage(error.message);
    }
  }

  async function restoreSession() {
    state.backendUrl = nativeGet("getBackendUrl");
    state.token = nativeGet("getAccessToken");
    $("backendUrl").value = state.backendUrl;
    $("settingsBackendUrl").value = state.backendUrl;
    if (!state.backendUrl || !state.token) {
      showScreen("loginScreen");
      return;
    }
    try {
      const result = await api("/api/auth/me");
      state.user = result.user;
      renderUser();
      showScreen("agentScreen");
    } catch (_) {
      state.token = "";
      nativeSet("clearAccessToken");
      showScreen("loginScreen");
    }
  }

  function renderUser() {
    $("dispatcherName").textContent = state.user?.display_name || state.user?.username || "Dispetcher";
    $("rolePill").textContent = String(state.user?.role || "dispatcher").toUpperCase();
  }

  async function startLiveSession() {
    if (state.active || state.starting) return;
    state.starting = true;
    $("liveButton").disabled = true;
    $("liveButtonText").textContent = "ULANMOQDA…";
    setConnection("ULANMOQDA");
    setVoiceState("AI bilan ulanmoqda", "Mikrofon ruxsatini tasdiqlang va internetni tekshiring", "active");
    let pc;
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) {
        throw new Error("Ushbu Android WebView WebRTC audio funksiyasini qo'llamaydi. Chrome/WebView yangilanishini tekshiring.");
      }
      const tokenPayload = await api("/api/realtime/token");
      if (!tokenPayload.value) throw new Error("Realtime client token qaytmadi.");

      pc = new RTCPeerConnection();
      state.pc = pc;
      const remoteAudio = $("remoteAudio");
      pc.ontrack = event => {
        if (event.streams && event.streams[0]) remoteAudio.srcObject = event.streams[0];
        remoteAudio.play().catch(() => {});
      };
      pc.onconnectionstatechange = () => {
        if (!state.active && pc.connectionState === "connected") {
          state.active = true;
          state.starting = false;
          state.startedAt = Date.now();
          $("liveButton").disabled = false;
          $("liveButton").classList.add("active");
          $("liveButtonText").textContent = "JONLI SUHBATNI YAKUNLASH";
          setConnection("JONLI", "live");
          setVoiceState("Sizni tinglayapman", "Tabiiy gapiring. AI suhbat kontekstini kuzatadi.", "active");
          $("sessionTimer").textContent = "JONLI SESSIYA · 00:00";
          state.timer = window.setInterval(updateTimer, 1000);
        }
        if (["failed", "disconnected", "closed"].includes(pc.connectionState) && state.active) {
          setConnection("ALOQA UZILDI", "error");
          setVoiceState("Aloqa uzildi", "Qayta ulanish uchun jonli sessiyani yangidan boshlang", "");
          stopLiveSession(false);
        }
      };

      state.localStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false
      });
      state.localStream.getAudioTracks().forEach(track => pc.addTrack(track, state.localStream));

      const channel = pc.createDataChannel("oai-events");
      state.channel = channel;
      channel.onopen = () => {
        state.active = true;
        state.starting = false;
        state.startedAt = Date.now();
        $("liveButton").disabled = false;
        $("liveButton").classList.add("active");
        $("liveButtonText").textContent = "JONLI SUHBATNI YAKUNLASH";
        setConnection("JONLI", "live");
        setVoiceState("Sizni tinglayapman", "Gapirishingiz mumkin. Javobni istalgan payt bo'lishingiz mumkin.", "active");
        state.timer = window.setInterval(updateTimer, 1000);
        sendEvent({
          type: "conversation.item.create",
          item: { type: "message", role: "user", content: [{ type: "input_text", text:
            "Jonli sessiya boshlandi. Dispetcherga tabiiy o'zbek tilida qisqa salom bering va qaysi soatlik kuzatuvni yuritishni boshlashini so'rang." }] }
        });
        sendEvent({ type: "response.create" });
      };
      channel.onmessage = event => handleRealtimeEvent(event.data);
      channel.onclose = () => {
        if (state.active) setVoiceState("Suhbat yakunlandi", "Yangi suhbatni boshlashingiz mumkin.", "");
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const response = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + tokenPayload.value,
          "Content-Type": "application/sdp"
        },
        body: offer.sdp
      });
      const answerSdp = await response.text();
      if (!response.ok) throw new Error("Realtime ulanish xatosi (" + response.status + "): " + answerSdp.slice(0, 220));
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
    } catch (error) {
      console.error(error);
      stopLiveSession(false);
      setConnection("XATO", "error");
      setVoiceState("Ulanish amalga oshmadi", error.message || "Server va internet aloqasini tekshiring.", "");
      nativeSet("notifyUser", error.message || "Realtime ulanish xatosi");
    } finally {
      state.starting = false;
      $("liveButton").disabled = false;
      if (!state.active) $("liveButtonText").textContent = "JONLI SUHBATNI BOSHLASH";
    }
  }

  function sendEvent(event) {
    if (state.channel?.readyState === "open") state.channel.send(JSON.stringify(event));
  }

  async function handleRealtimeEvent(raw) {
    let event;
    try { event = JSON.parse(raw); } catch (_) { return; }
    switch (event.type) {
      case "input_audio_buffer.speech_started":
        setVoiceState("Siz gapiryapsiz", "AI Sizni tinglayapti…", "active");
        break;
      case "input_audio_buffer.speech_stopped":
        setVoiceState("AI o'ylayapti", "Buyrug'ingizni tushunyapman…", "active");
        break;
      case "conversation.item.input_audio_transcription.completed":
        if (event.transcript) appendMessage("user", event.transcript);
        break;
      case "response.output_audio_transcript.done":
        if (event.transcript) appendMessage("assistant", event.transcript);
        setVoiceState("Sizni tinglayapman", "Davom etishingiz mumkin.", "active");
        break;
      case "response.output_audio.delta":
        setVoiceState("AI gapiryapti", "Istalgan payt suhbatga aralashishingiz mumkin.", "active speaking");
        break;
      case "response.done":
        await processFunctionCalls(event.response?.output || []);
        if (state.active) {
          setVoiceState("Sizni tinglayapman", "Sizni eshityapman. Davom eting.", "active");
        }
        break;
      case "error":
        console.error("Realtime API error", event);
        appendMessage("assistant", "Ulanish xabari: " + (event.error?.message || "Noma'lum realtime xatosi."));
        break;
      case "session.created":
        console.info("Realtime session created", event.session?.id);
        break;
      default:
        break;
    }
  }

  async function processFunctionCalls(items) {
    for (const item of items) {
      if (item.type !== "function_call" || !item.call_id || state.processedCalls.has(item.call_id)) continue;
      state.processedCalls.add(item.call_id);
      let output;
      try {
        const args = JSON.parse(item.arguments || "{}");
        const result = await api("/api/agent/execute", {
          method: "POST",
          body: JSON.stringify({ name: item.name, arguments: args })
        });
        output = result;
        if (item.name === "prepare_observation_batch" && result.ok) {
          showPending(result.result);
        } else if (item.name === "confirm_observation_batch" && result.ok) {
          hidePending();
          appendMessage("assistant", "Ma'lumotlar bazaga saqlandi: " + result.result.saved_count + " ta kuzatuv yozuvi.");
        }
      } catch (error) {
        output = { ok: false, error: error.message };
      }
      sendEvent({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: item.call_id,
          output: JSON.stringify(output)
        }
      });
      sendEvent({ type: "response.create" });
    }
  }

  function stopLiveSession(updateUi = true) {
    state.active = false;
    state.starting = false;
    if (state.timer) window.clearInterval(state.timer);
    state.timer = null;
    if (state.channel) {
      try { state.channel.close(); } catch (_) {}
    }
    if (state.pc) {
      try { state.pc.getSenders().forEach(sender => sender.track?.stop()); } catch (_) {}
      try { state.pc.close(); } catch (_) {}
    }
    if (state.localStream) state.localStream.getTracks().forEach(track => track.stop());
    $("remoteAudio").srcObject = null;
    state.channel = null;
    state.pc = null;
    state.localStream = null;
    state.assistantText = "";
    state.processedCalls.clear();
    $("liveButton").disabled = false;
    $("liveButton").classList.remove("active");
    $("liveButtonText").textContent = "JONLI SUHBATNI BOSHLASH";
    $("sessionTimer").textContent = "SESSIYA YAKUNLANDI";
    $("voiceOrb").className = "voice-orb";
    if (updateUi) {
      setConnection("YAKUNLANDI");
      setVoiceState("Suhbat yakunlandi", "Yangi jonli sessiyani boshlashingiz mumkin.", "");
    }
  }

  function openSettings() {
    $("settingsBackendUrl").value = state.backendUrl || "";
    $("templateSettings").classList.toggle("hidden", state.user?.role !== "admin");
    showScreen("settingsScreen");
  }

  async function uploadOfficialTemplate() {
    const file = $("templateFile").files?.[0];
    if (!file) {
      $("templateMessage").textContent = "Avval asl Excel .xlsx faylini tanlang.";
      return;
    }
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      $("templateMessage").textContent = "Faqat .xlsx fayli qabul qilinadi.";
      return;
    }
    $("templateMessage").style.color = "var(--muted)";
    $("templateMessage").textContent = "Shablon tekshirilmoqda va serverga yuklanmoqda…";
    $("uploadTemplateButton").disabled = true;
    try {
      const form = new FormData();
      form.append("workbook", file, file.name);
      const response = await fetch(state.backendUrl + "/api/admin/workbook-template", {
        method: "POST",
        headers: { Authorization: "Bearer " + state.token },
        body: form
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || ("Server xatosi: " + response.status));
      $("templateMessage").style.color = "var(--green)";
      $("templateMessage").textContent =
        "Shablon saqlandi. Varaqlar: " + payload.sheets_imported +
        ", tarixiy kuzatuvlar import qilindi: " + payload.observations_imported + ".";
      $("templateFile").value = "";
    } catch (error) {
      $("templateMessage").style.color = "var(--red)";
      $("templateMessage").textContent = error.message;
    } finally {
      $("uploadTemplateButton").disabled = false;
    }
  }

  function saveSettings() {
    const url = $("settingsBackendUrl").value.trim().replace(/\/+$/, "");
    if (!/^https:\/\//i.test(url) && !/^http:\/\/(10\.0\.2\.2|localhost)(:\d+)?$/i.test(url)) {
      $("settingsMessage").textContent = "HTTPS server manzilini kiriting.";
      return;
    }
    state.backendUrl = url;
    nativeSet("setBackendUrl", url);
    $("backendUrl").value = url;
    $("settingsMessage").style.color = "var(--green)";
    $("settingsMessage").textContent = "Server manzili saqlandi.";
    showScreen(state.token ? "agentScreen" : "loginScreen");
  }

  function logout() {
    stopLiveSession(false);
    state.token = "";
    state.user = null;
    nativeSet("clearAccessToken");
    $("conversation").innerHTML = '<div class="empty-conversation"><div class="empty-icon">◌</div><strong>Suhbat hali boshlanmadi</strong><span>Jonli sessiyani oching. AI Sizni tinglaydi va ovoz bilan javob beradi.</span></div>';
    hidePending();
    showScreen("loginScreen");
  }

  $("loginForm").addEventListener("submit", login);
  $("liveButton").addEventListener("click", () => state.active || state.starting ? stopLiveSession() : startLiveSession());
  $("settingsButton").addEventListener("click", openSettings);
  $("saveBackendButton").addEventListener("click", saveSettings);
  $("uploadTemplateButton").addEventListener("click", uploadOfficialTemplate);
  $("backFromSettings").addEventListener("click", () => showScreen(state.token ? "agentScreen" : "loginScreen"));
  $("logoutButton").addEventListener("click", logout);
  $("clearChatButton").addEventListener("click", () => {
    $("conversation").innerHTML = '<div class="empty-conversation"><div class="empty-icon">◌</div><strong>Suhbat tarixi tozalandi</strong><span>Jonli sessiya davom etmoqda.</span></div>';
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state.active) {
      // The live mic session is deliberately stopped when the app leaves the foreground.
      stopLiveSession();
      appendMessage("assistant", "Maxfiylik uchun ilova fonda qolganda mikrofon sessiyasi yopildi.");
    }
  });

  restoreSession();
})();
