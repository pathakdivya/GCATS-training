const STICK_KEY = "controllercheck_stick_preference"
const STAGE2_ATTEMPTS_KEY = "controllercheck_stage2_attempts"

export const STAGE2_PASS_THRESHOLD = 75

// ---------------------------------------------------------------
// Thumbstick preference (set on the About page, read by Stage 1 & 2)
// ---------------------------------------------------------------

export function setStickPreference(stick) {
  localStorage.setItem(STICK_KEY, stick)
}

export function getStickPreference() {
  const v = localStorage.getItem(STICK_KEY)
  return v === "left" || v === "right" ? v : null
}

// Called when a new participant session starts
export function resetParticipantState() {
  localStorage.removeItem(STICK_KEY)
  localStorage.removeItem(STAGE2_ATTEMPTS_KEY)
}
// ---------------------------------------------------------------
// Stage 2: Random Dot Motion task. Only the summary of each attempt is kept
// here (it decides whether the questionnaire unlocks); every trial is in the
// data log (datalog.js).
// ---------------------------------------------------------------

export function getStage2Attempts() {
  try {
    const raw = localStorage.getItem(STAGE2_ATTEMPTS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch (e) {
    console.error("Could not read Stage 2 attempts", e)
    return []
  }
}

export function addStage2Attempt(attempt) {
  const all = getStage2Attempts()
  const withNumber = { ...attempt, attemptNumber: all.length + 1 }
  all.push(withNumber)
  localStorage.setItem(STAGE2_ATTEMPTS_KEY, JSON.stringify(all))
  return withNumber
}

export function hasPassedStage2() {
  return getStage2Attempts().some(a => a.passed)
}

// ---------------------------------------------------------------
// Hardware Comfort & Familiarity Questionnaire
// ---------------------------------------------------------------

// Items 8 and 9 (1-indexed; index 7 and 8, 0-indexed) are negatively worded
// and get reverse-scored, matching how the System Usability Scale mixes
// positive/negative items to control for acquiescence bias.
const NEGATIVE_ITEM_INDEXES = [7, 8]

export function computeHardwareComfortScore(ratings) {
  let total = 0
  ratings.forEach((value, i) => {
    const isNegative = NEGATIVE_ITEM_INDEXES.includes(i)
    total += isNegative ? (5 - value) : (value - 1)
  })
  return (total / (ratings.length * 4)) * 100
}
