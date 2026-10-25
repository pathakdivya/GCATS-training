/* =====================================================================
   GCATS data export page

   Lists every session recorded in this browser (one per participant run).
   For the chosen session you can set the participant ID and download ONE
   CSV file with every stage in it (like a PsychoPy data file). The ticks only
   leave stages out of that file, if you want to.
   ===================================================================== */

import {
    deleteSession, downloadParticipantCSV, getCurrentSessionId, getSession, getSessions,
    setParticipantId, STAGES, stageRows
} from "./datalog.js";
import { initThemeToggle } from "./theme.js";


/* ---------------------------------------------------------------------
   1. PAGE ELEMENTS AND STATE
   --------------------------------------------------------------------- */

const $ = (id) => document.getElementById(id);
const sessionList = $("session-list");
const stageList = $("stage-list");
const stagePanel = $("stage-panel");
const emptyNotice = $("data-empty");
const sessionTitle = $("session-title");
const participantInput = $("participant-input");
const messageEl = $("data-message");

let selectedId = getCurrentSessionId();   // the session shown on the right
const checked = new Set(STAGES.map((stage) => stage.key));   // stages ticked for download


/* ---------------------------------------------------------------------
   2. SESSIONS (left panel)
   --------------------------------------------------------------------- */

const totalRows = (session) => STAGES.reduce((sum, stage) => sum + stageRows(session, stage.key).length, 0);

function renderSessions() {
    const sessions = getSessions();
    emptyNotice.hidden = sessions.length > 0;
    stagePanel.hidden = sessions.length === 0;
    if (!sessions.some((s) => s.id === selectedId)) selectedId = sessions[0]?.id ?? null;

    sessionList.innerHTML = sessions.map((session) => {
        const who = session.participantId || "(no participant ID)";
        const state = session.submittedAt ? "questionnaire submitted" : "not finished";
        return `<li><button type="button" class="session-item${session.id === selectedId ? " is-selected" : ""}" data-id="${session.id}">
            <b>${who}</b><span>${session.id} · ${totalRows(session)} rows · ${state}</span></button></li>`;
    }).join("");
    sessionList.querySelectorAll(".session-item").forEach((button) =>
        button.addEventListener("click", () => {
            selectedId = button.dataset.id;
            messageEl.textContent = "";
            render();
        }));
}


/* ---------------------------------------------------------------------
   3. STAGES OF THE CHOSEN SESSION (right panel)
   --------------------------------------------------------------------- */

function renderStages() {
    const session = getSession(selectedId);
    if (!session) return;
    sessionTitle.textContent = `Session ${session.id}`;
    participantInput.value = session.participantId;

    stageList.innerHTML = STAGES.map((stage) => {
        const rows = stageRows(session, stage.key).length;
        const on = rows > 0 && checked.has(stage.key);
        return `<li><label class="stage-item${rows ? "" : " is-empty"}">
            <input type="checkbox" data-stage="${stage.key}" ${on ? "checked" : ""} ${rows ? "" : "disabled"}>
            <span class="stage-name">${stage.label}</span><span class="stage-rows">${rows} rows</span></label></li>`;
    }).join("");
    stageList.querySelectorAll("input[type=checkbox]").forEach((box) =>
        box.addEventListener("change", () => (box.checked ? checked.add(box.dataset.stage) : checked.delete(box.dataset.stage))));
}


/* ---------------------------------------------------------------------
   4. BUTTONS
   --------------------------------------------------------------------- */

participantInput.addEventListener("change", () => {
    if (!selectedId) return;
    setParticipantId(participantInput.value, selectedId);
    messageEl.textContent = "Participant ID saved. It is written on every row of the file you download.";
    render();
});

$("download-file").addEventListener("click", () => {
    const session = getSession(selectedId);
    const keys = STAGES.map((stage) => stage.key).filter((key) => checked.has(key) && stageRows(session, key).length);
    if (!keys.length) {
        messageEl.textContent = "Tick at least one stage that has data.";
        return;
    }
    downloadParticipantCSV(session, keys);
    messageEl.textContent = `Downloaded one file with ${keys.length} stage${keys.length > 1 ? "s" : ""}.`;
});

$("delete-session").addEventListener("click", () => {
    if (!selectedId || !confirm("Delete this session from this browser? Download it first if you need it.")) return;
    deleteSession(selectedId);
    selectedId = null;
    render();
});


/* ---------------------------------------------------------------------
   5. START-UP
   --------------------------------------------------------------------- */

function render() {
    renderSessions();
    renderStages();
}

initThemeToggle();
render();
