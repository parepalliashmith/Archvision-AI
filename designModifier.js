// Conversational design modification — the deterministic half.
//
// The LLM (or, when no API key is configured / the AI call fails, the heuristic
// keyword parser below) is ONLY ever allowed to pick from a small closed set of
// {action, target, direction, magnitude, style} enum values — see sanitizeIntent,
// which is the enforcement point: anything outside that vocabulary is coerced to
// "unknown" before it ever reaches applyIntent. Neither path is trusted to invent a
// room size, a coordinate, or a count. applyIntent below is pure, deterministic
// JS: given a sanitized intent and the design's current `requirements`, it nudges
// a handful of hand-chosen fields (bedroom/bathroom counts, style, per-room-type
// size multipliers, staircase side, open-space scale, a global size-reduction
// factor) and returns the MODIFIED requirements object. The caller then runs those
// requirements through the exact same generateHouseDesign() used everywhere else
// in the app — the actual geometry always comes from that one deterministic
// engine, never from the LLM.

const ROOM_TARGET_KEYS = {
  living: 'living', livingroom: 'living',
  kitchen: 'kitchen',
  dining: 'dining', diningroom: 'dining',
  masterbedroom: 'masterBedroom', master: 'masterBedroom',
  bedroom: 'bedroom',
  bathroom: 'bathroom', masterbathroom: 'bathroom',
};

const ROOM_LABELS = {
  living: 'Living Room', kitchen: 'Kitchen', dining: 'Dining area',
  masterBedroom: 'Master Bedroom', bedroom: 'bedroom(s)', bathroom: 'bathroom(s)',
};

const STYLE_LABELS = {
  modern: 'Modern', traditional: 'Traditional', contemporary: 'Contemporary',
  farmhouse: 'Farmhouse', 'compact urban': 'Compact urban', compact: 'Compact urban',
};

const INTENT_ACTIONS = [
  'resize_room', 'add_room', 'remove_room', 'more_open_space',
  'move_staircase', 'reduce_cost', 'change_style', 'regenerate_variant', 'unknown',
];
const INTENT_MAGNITUDES = ['slightly', 'moderately', 'significantly'];
const MAGNITUDE_STEP = { slightly: 1.12, moderately: 1.25, significantly: 1.4 };

function resolveRoomKey(target) {
  const k = String(target || '').toLowerCase().replace(/[^a-z]/g, '');
  return ROOM_TARGET_KEYS[k] || null;
}

function resolveStyleLabel(style) {
  return STYLE_LABELS[String(style || '').toLowerCase().trim()] || null;
}

// The one enforcement point: whatever the LLM (or the heuristic parser) produced,
// only a value from the closed vocabulary above survives. Everything else is
// coerced to "unknown", which applyIntent below turns into a no-op + a friendly
// clarification message instead of guessing.
function sanitizeIntent(raw) {
  if (!raw || typeof raw !== 'object') return { action: 'unknown' };
  let action = INTENT_ACTIONS.includes(raw.action) ? raw.action : 'unknown';
  const out = { action };

  if (action === 'resize_room') {
    const target = resolveRoomKey(raw.target);
    if (!target) return { action: 'unknown' };
    out.target = target;
    out.direction = raw.direction === 'decrease' ? 'decrease' : 'increase';
    out.magnitude = INTENT_MAGNITUDES.includes(raw.magnitude) ? raw.magnitude : 'moderately';
  } else if (action === 'add_room' || action === 'remove_room') {
    const target = resolveRoomKey(raw.target);
    out.target = target === 'bathroom' ? 'bathroom' : 'bedroom'; // only these two are addable/removable counts
  } else if (action === 'change_style') {
    const style = resolveStyleLabel(raw.style);
    if (!style) return { action: 'unknown' };
    out.style = style;
  }

  return out;
}

// Keyword/regex fallback — used whenever GEMINI_API_KEY isn't configured, or the
// AI call errors/times out, so the feature still works without a live model.
// Deliberately narrow: it only needs to cover requests shaped like the examples
// in the product spec, not open-ended conversation. Order matters below (style
// and "another design" are checked before the generic resize matcher so "give me
// a modern design" isn't misread as resizing something called "design").
function interpretIntentHeuristically(message) {
  const m = String(message || '').toLowerCase();

  for (const [kw, style] of [
    ['compact urban', 'Compact urban'], ['modern', 'Modern'], ['traditional', 'Traditional'],
    ['contemporary', 'Contemporary'], ['farmhouse', 'Farmhouse'], ['compact', 'Compact urban'],
  ]) {
    if (m.includes(kw)) return { action: 'change_style', style };
  }

  if (/\b(another|different|new version|regenerate|try again|start over)\b/.test(m)) return { action: 'regenerate_variant' };
  if (/reduce.*cost|lower.*cost|cheaper|less expensive|save money|too expensive/.test(m)) return { action: 'reduce_cost' };
  if (/open space|garden|outdoor|more open|yard/.test(m)) return { action: 'more_open_space' };
  if (/stair/.test(m) && /(move|change|shift|relocate|different (position|side|place))/.test(m)) return { action: 'move_staircase' };

  if (/\b(add|one more|extra|another)\b/.test(m) && /bedroom/.test(m)) return { action: 'add_room', target: 'bedroom' };
  if (/\b(add|one more|extra)\b/.test(m) && /bathroom/.test(m)) return { action: 'add_room', target: 'bathroom' };
  if (/\b(remove|one less|fewer|delete)\b/.test(m) && /bedroom/.test(m)) return { action: 'remove_room', target: 'bedroom' };
  if (/\b(remove|one less|fewer|delete)\b/.test(m) && /bathroom/.test(m)) return { action: 'remove_room', target: 'bathroom' };

  const roomMatch = m.match(/master\s*bedroom|living\s*room|dining\s*room|kitchen|dining|living|bedroom|bathroom/);
  const magnitude = /\b(very|much|significantly|a lot)\b/.test(m) ? 'significantly'
    : /\b(slightly|a bit|little|tiny)\b/.test(m) ? 'slightly' : 'moderately';

  if (roomMatch && /bigger|larger|increase|expand|more space|enlarge|grow/.test(m)) {
    return { action: 'resize_room', target: roomMatch[0], direction: 'increase', magnitude };
  }
  if (roomMatch && /smaller|reduce|shrink|decrease|less space/.test(m)) {
    return { action: 'resize_room', target: roomMatch[0], direction: 'decrease', magnitude };
  }

  return { action: 'unknown' };
}

function clampMultiplier(v) {
  return Math.min(2.2, Math.max(0.55, v));
}

// The deterministic "apply" step. Takes a SANITIZED intent (never trust an
// unsanitized one here) and the design's current requirements, and returns the
// modified requirements plus a plain-English summary of what changed. Every
// number below is a fixed constant chosen by us, not something the caller passes
// in — the intent only ever selects WHICH of these fixed nudges to apply.
function applyIntent(intent, requirements) {
  const reqs = { ...(requirements || {}) };
  const overrides = { ...(reqs.roomSizeOverrides || {}) };

  switch (intent.action) {
    case 'resize_room': {
      const step = MAGNITUDE_STEP[intent.magnitude] || MAGNITUDE_STEP.moderately;
      const factor = intent.direction === 'decrease' ? 1 / step : step;
      overrides[intent.target] = clampMultiplier((overrides[intent.target] || 1) * factor);
      reqs.roomSizeOverrides = overrides;
      return {
        requirements: reqs,
        changed: true,
        message: `Made the ${ROOM_LABELS[intent.target]} ${intent.direction === 'decrease' ? 'smaller' : 'bigger'}.`,
      };
    }
    case 'add_room': {
      const field = intent.target === 'bathroom' ? 'bathrooms' : 'bedrooms';
      const max = intent.target === 'bathroom' ? 6 : 8;
      reqs[field] = Math.min(max, (Number(reqs[field]) || 1) + 1);
      return { requirements: reqs, changed: true, message: `Added a ${intent.target} (now ${reqs[field]}).` };
    }
    case 'remove_room': {
      const field = intent.target === 'bathroom' ? 'bathrooms' : 'bedrooms';
      reqs[field] = Math.max(1, (Number(reqs[field]) || 2) - 1);
      return { requirements: reqs, changed: true, message: `Removed a ${intent.target} (now ${reqs[field]}).` };
    }
    case 'more_open_space': {
      if (!reqs.garden) {
        reqs.garden = true;
        return { requirements: reqs, changed: true, message: 'Added a garden / open space in front of the house.' };
      }
      reqs.openSpaceScale = clampMultiplier((Number(reqs.openSpaceScale) || 1) * 1.3);
      return { requirements: reqs, changed: true, message: 'Made the open space larger.' };
    }
    case 'move_staircase': {
      if ((Number(reqs.floors) || 1) < 2) {
        return {
          requirements: reqs, changed: false,
          message: "This design only has one floor, so there's no staircase to move — add a floor first.",
        };
      }
      reqs.staircaseSideOverride = reqs.staircaseSideOverride === 'end' ? 'start' : 'end';
      return { requirements: reqs, changed: true, message: 'Moved the staircase to the other side of the house.' };
    }
    case 'reduce_cost': {
      reqs.sizeScale = clampMultiplier((Number(reqs.sizeScale) || 1) * 0.88);
      return { requirements: reqs, changed: true, message: 'Reduced overall room sizes to bring the construction cost down.' };
    }
    case 'change_style': {
      reqs.style = intent.style;
      return { requirements: reqs, changed: true, message: `Switched to a ${intent.style} style.` };
    }
    case 'regenerate_variant': {
      reqs.variationSeed = (Number(reqs.variationSeed) || 0) + 1;
      return { requirements: reqs, changed: true, message: 'Generated a different layout with the same requirements.' };
    }
    default:
      return {
        requirements: reqs, changed: false,
        message: 'I didn\'t quite catch that. Try things like "make the kitchen bigger," "add one more bedroom," "move the staircase," or "give me a modern design."',
      };
  }
}

function buildIntentPrompt(message, requirements) {
  return (
    `You are interpreting a homeowner's request to modify their house design. Do NOT invent ` +
    `room sizes, coordinates, or measurements of any kind — you are only picking from the fixed ` +
    `menu of actions below; a separate deterministic system applies the actual change.\n\n` +
    `User's request: "${message}"\n\n` +
    `Current design: ${requirements.bedrooms || '?'} bedroom(s), ${requirements.bathrooms || '?'} bathroom(s), ` +
    `${requirements.floors || 1} floor(s), style: ${requirements.style || 'none set'}.\n\n` +
    `Respond with STRICT JSON only (no markdown, no code fences), matching exactly ONE of these shapes:\n` +
    `{"action":"resize_room","target":"living|kitchen|dining|masterBedroom|bedroom|bathroom","direction":"increase|decrease","magnitude":"slightly|moderately|significantly"}\n` +
    `{"action":"add_room","target":"bedroom|bathroom"}\n` +
    `{"action":"remove_room","target":"bedroom|bathroom"}\n` +
    `{"action":"more_open_space"}\n` +
    `{"action":"move_staircase"}\n` +
    `{"action":"reduce_cost"}\n` +
    `{"action":"change_style","style":"Modern|Traditional|Contemporary|Farmhouse|Compact urban"}\n` +
    `{"action":"regenerate_variant"}\n` +
    `{"action":"unknown"}\n\n` +
    `Use "resize_room" for any request about a specific named room getting bigger/smaller (e.g. ` +
    `"make the master bedroom larger" -> target "masterBedroom"). Use "unknown" if the request ` +
    `doesn't clearly match any of these — do not guess.`
  );
}

module.exports = {
  sanitizeIntent,
  applyIntent,
  interpretIntentHeuristically,
  buildIntentPrompt,
  resolveRoomKey,
};
