/* =====================================================================
   GCATS data log: everything the participant does, saved stage by stage.

   The layout follows PsychoPy's data files: one row per event or trial
   ("long format"), with the participant, session and date repeated on every
   row. Rows are kept in the browser (localStorage) per stage and exported
   from data.html as ONE csv file per participant (the "stage" column says
   which stage each row belongs to).

     sessions -> one per participant run, started on the welcome page
       stages -> welcome, about, stage1, stage2, stage3
         rows -> { stage, timestamp, elapsed_s, ...fields of that event }

   Pages call logRow("stage1", { event: "static_trial", ... }). Common
   columns (session, thumbstick, controller brand) are added automatically.
   ===================================================================== */

import { LAYOUT_KEY } from "./controller.js";
import { getStickPreference, resetParticipantState } from "./storage.js";

const DATA_KEY = "controllercheck_data_v1";
const EXP_NAME = "GCATS_training";

// The stages that can be exported, in the order a participant meets them.
export const STAGES = [
    { key: "welcome", label: "Welcome: controller detection and navigation practice" },
    { key: "about", label: "About the device: pages viewed and thumbstick choice" },
    { key: "stage1", label: "Stage 1: thumbstick familiarisation" },
    { key: "stage2", label: "Stage 2: random dot motion and follow the target" },
    { key: "stage3", label: "Stage 3: questionnaire" }
];


/* ---------------------------------------------------------------------
   1. STORAGE
   --------------------------------------------------------------------- */

function load() {
    try {
        const parsed = JSON.parse(localStorage.getItem(DATA_KEY) ?? "null");
        if (parsed && parsed.sessions) return parsed;
    } catch (error) {
        console.error("Could not read the data log", error);
    }
    return { currentSessionId: null, sessions: {} };
}

function save(db) {
    try {
        localStorage.setItem(DATA_KEY, JSON.stringify(db));
    } catch (error) {
        console.error("Could not save the data log (is the storage full?)", error);
    }
}

// 2026-10-25 18:30:12 -> "20261025-183012"
function stamp(date) {
    const pad = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}


/* ---------------------------------------------------------------------
   2. SESSIONS
   --------------------------------------------------------------------- */

function newSession(db) {
    const now = new Date();
    const session = {
        id: `S${stamp(now)}`,
        startedAt: now.toISOString(),
        participantId: "",
        submittedAt: null,
        stages: {}
    };
    db.sessions[session.id] = session;
    db.currentSessionId = session.id;
    resetParticipantState();
    return session;
}

// Returns the session this browser is currently recording. Pass startNew on
// the welcome page: a finished (submitted) session is then left alone and a
// fresh one begins for the next participant.
export function ensureSession({ startNew = false } = {}) {
    const db = load();
    let session = db.sessions[db.currentSessionId];
    if (!session || (startNew && session.submittedAt)) {
        session = newSession(db);
        save(db);
    }
    return session;
}

export function getSessions() {
    return Object.values(load().sessions).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export function getSession(id) {
    return load().sessions[id] ?? null;
}

export function getCurrentSessionId() {
    return load().currentSessionId;
}

// The participant ID can be set by the questionnaire or typed on data.html.
export function setParticipantId(id, sessionId = null) {
    const db = load();
    const session = db.sessions[sessionId ?? db.currentSessionId];
    if (!session) return;
    session.participantId = id.trim();
    save(db);
}

// How many rows of one kind this session has (for example attempts started so far).
export function countRows(stage, event) {
    const db = load();
    return (db.sessions[db.currentSessionId]?.stages[stage] ?? []).filter((row) => row.event === event).length;
}

// Marks the current session as finished (questionnaire submitted).
export function closeCurrentSession() {
    const db = load();
    const session = db.sessions[db.currentSessionId];
    if (!session) return;
    session.submittedAt = new Date().toISOString();
    save(db);
}

export function deleteSession(id) {
    const db = load();
    delete db.sessions[id];
    if (db.currentSessionId === id) db.currentSessionId = null;
    save(db);
}


/* ---------------------------------------------------------------------
   3. LOGGING
   --------------------------------------------------------------------- */

// Adds one row to a stage's table. "fields" are the columns of this event.
export function logRow(stage, fields) {
    logRows(stage, [fields]);
}

// Adds multiple rows in one localStorage write. This is used for frame samples
// so high-frequency input logging does not block the animation loop.
export function logRows(stage, fieldsList) {
    const db = load();
    let session = db.sessions[db.currentSessionId];
    if (!session) session = newSession(db);
    const rows = session.stages[stage] ??= [];
    const startedAt = new Date(session.startedAt);
    const controllerBrand = localStorage.getItem(LAYOUT_KEY) ?? "";
    const thumbstick = getStickPreference() ?? "";
    for (const fields of fieldsList) {
        const now = fields.timestamp ? new Date(fields.timestamp) : new Date();
        rows.push({
            stage,
            timestamp: now.toISOString(),
            elapsed_s: Math.round((now - startedAt) / 10) / 100,
            controller_brand: controllerBrand,
            thumbstick,
            ...fields
        });
    }
    save(db);
}


/* ---------------------------------------------------------------------
   4. EXPORT
   --------------------------------------------------------------------- */

// A stage's rows in time order (pages can be revisited, so insertion order is not always time order).
export function stageRows(session, stageKey) {
    return [...(session.stages[stageKey] ?? [])].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

function csvEscape(value) {
    const text = value === null || value === undefined ? "" : String(value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// One CSV file for the whole participant. Like a PsychoPy file it is in long
// format: one row per event or trial, in time order, with the stage in the
// "stage" column (filter on it to get one stage). The first columns say who
// and when; the rest are every field used by any stage (empty where a row
// does not use it). Pass stageKeys to leave some stages out.
function participantToCSV(session, stageKeys = STAGES.map((stage) => stage.key)) {
    const rows = stageKeys
        .flatMap((key) => stageRows(session, key))
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const lead = ["participant", "session_id", "exp_name", "date"];
    const fixed = ["stage", "timestamp", "elapsed_s"];
    const others = [];
    for (const row of rows)
        for (const key of Object.keys(row))
            if (!fixed.includes(key) && !others.includes(key)) others.push(key);
    const columns = [...lead, ...fixed, ...others];
    const common = {
        participant: session.participantId,
        session_id: session.id,
        exp_name: EXP_NAME,
        date: session.startedAt.slice(0, 10)
    };
    const lines = rows.map((row) => columns.map((column) => csvEscape(column in common ? common[column] : row[column])).join(","));
    return [columns.join(","), ...lines].join("\n");
}

function fileName(session) {
    const who = (session.participantId || session.id).replace(/[^a-z0-9_-]/gi, "_");
    return `${who}_${EXP_NAME}_${session.id}.csv`;
}

export function downloadParticipantCSV(session, stageKeys) {
    const blob = new Blob([participantToCSV(session, stageKeys)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName(session);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000); /* page will wait for 1 second before downloading */ 
}
