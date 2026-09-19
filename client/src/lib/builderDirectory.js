// Shared by FindBuilders.jsx and BuilderProfile.jsx — normalizes a real
// signed-up builder (from GET /api/builders) into the same shape as the
// static demo BUILDERS array, so BuilderCard/BuilderProfile/matchBuilders
// never have to special-case where a builder came from.
//
// Only fields a real signup form never collects are fabricated here, and
// only with honest "new/unrated" values — never a fake trust signal:
// verified stays false, rating/projectsCompleted start at 0, portfolio is
// empty, availability defaults to 'available' (no real-account equivalent
// yet). Everything else (name, specializations, serviceLocations, priceRange,
// yearsExperience, about) comes straight from the required profile-setup
// fields, so it's never null.
const AVATAR_COLORS = ['#a5652e', '#6b4a36', '#4b5842', '#8a6a52', '#33383f', '#386b47', '#2b2f36', '#9a3324', '#4b8a5e'];

function initialsOf(name) {
  return (name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || '?';
}

function colorFromString(str) {
  let hash = 0;
  for (let i = 0; i < (str || '').length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function normalizeRealBuilder(b) {
  return {
    ...b,
    verified: false,
    rating: 0,
    projectsCompleted: 0,
    portfolio: [],
    availability: 'available',
    initials: initialsOf(b.name),
    avatarColor: colorFromString(b.name),
  };
}
