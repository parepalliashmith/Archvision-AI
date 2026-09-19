// Deterministic construction cost estimator — deliberately NOT an AI call.
// AI is unreliable at precise arithmetic, and a cost figure is exactly the kind of
// number a user might take seriously, so this is a plain, explainable rate-table formula.
// Figures are illustrative approximations for concept-stage budgeting only.

const BASE_RATE_PER_SQFT = 1800; // INR, "standard" quality residential construction
const SQM_TO_SQFT = 10.7639;

const STYLE_MULTIPLIERS = {
  'modern minimalist': 1.15,
  modern: 1.15,
  contemporary: 1.1,
  farmhouse: 1.05,
  traditional: 1.0,
  'compact urban': 0.95,
};

// The core formula, native to square feet (the unit the rule-based design generator
// works in). Takes bathroom count directly rather than re-deriving it from room lists,
// so it can be reused by both a room-array-shaped layout and a flat requirements object.
function estimateCostFromSqft(areaSqft, { style, floorsCount = 1, bathroomCount = 1, parking, garden, budget } = {}) {
  const styleMultiplier = STYLE_MULTIPLIERS[String(style || '').toLowerCase()] || 1.0;
  const floorMultiplier = 1 + Math.max(0, floorsCount - 1) * 0.08; // extra structure per storey

  const ratePerSqft = BASE_RATE_PER_SQFT * styleMultiplier * floorMultiplier;
  const baseCost = areaSqft * ratePerSqft;

  const extraBathroomCost = Math.max(0, bathroomCount - 1) * 45000;
  const parkingCost = parking ? 150000 : 0;
  const gardenCost = garden ? 80000 : 0;

  const adjustments = [];
  if (extraBathroomCost) adjustments.push({ label: `${bathroomCount} bathrooms`, amount: Math.round(extraBathroomCost) });
  if (parkingCost) adjustments.push({ label: 'Covered parking', amount: parkingCost });
  if (gardenCost) adjustments.push({ label: 'Garden / landscaping', amount: gardenCost });

  const totalCost = Math.round(baseCost + extraBathroomCost + parkingCost + gardenCost);

  const result = {
    areaSqft: Math.round(areaSqft),
    ratePerSqft: Math.round(ratePerSqft),
    baseCost: Math.round(baseCost),
    adjustments,
    totalCost,
    currency: 'INR',
    disclaimer:
      'Approximate concept-stage estimate only — actual cost depends on location, material choices, ' +
      'labor rates, and site conditions. Get a quote from a licensed contractor before budgeting for real.',
  };

  const budgetNum = Number(budget) || 0;
  if (budgetNum > 0) {
    result.budgetTarget = budgetNum;
    result.withinBudget = totalCost <= budgetNum;
    result.differenceFromBudget = totalCost - budgetNum;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Standalone detailed cost estimator — takes plain numbers/enums directly
// (total built-up area, floors, bedrooms, house type, finish quality, budget)
// rather than a generated layout, so it works as its own quick-estimate tool
// independent of the design generator. Same "deterministic, not AI" principle:
// a fixed rate table plus fixed category percentages, nothing invented per call.
// ---------------------------------------------------------------------------

// "Finish quality" is the dominant driver of rate/sqft in real Indian residential
// construction estimates — basic vs premium fit-out swings cost far more than
// almost anything else. "standard" is anchored to the same base rate the design
// generator already uses, so the two tools stay roughly consistent with each other.
const FINISH_QUALITY_RATES = {
  basic: 1400,
  standard: BASE_RATE_PER_SQFT,
  premium: 2400,
  luxury: 3200,
};

// "House type" here means construction category (affects shared-structure economies
// and land/foundation overhead), distinct from architectural "style" (modern/
// traditional/farmhouse) used elsewhere — an apartment shares walls/structure with
// neighbors and costs less per sqft to build than a fully standalone villa.
const HOUSE_TYPE_MULTIPLIERS = {
  'independent-house': 1.0,
  villa: 1.15,
  duplex: 1.08,
  'row-house': 0.95,
  apartment: 0.9,
};

// Typical Indian residential construction cost breakup by trade, as a percentage
// of the base (pre-bedroom-addon) civil cost. Sums to exactly 100%.
const COST_CATEGORIES = [
  { key: 'civilStructural', label: 'Civil / Structural Work', percentage: 0.42 },
  { key: 'flooring', label: 'Flooring', percentage: 0.11 },
  { key: 'doorsWindows', label: 'Doors & Windows', percentage: 0.09 },
  { key: 'electrical', label: 'Electrical', percentage: 0.07 },
  { key: 'plumbing', label: 'Plumbing', percentage: 0.07 },
  { key: 'painting', label: 'Painting', percentage: 0.05 },
  { key: 'kitchen', label: 'Kitchen', percentage: 0.06 },
  { key: 'bathroom', label: 'Bathroom', percentage: 0.05 },
  { key: 'basicFinishing', label: 'Basic Finishing', percentage: 0.08 },
];

function estimateDetailedCost({ builtUpAreaSqft, floors, bedrooms, houseType, finishQuality, budget } = {}) {
  const area = Math.max(100, Math.min(20000, Number(builtUpAreaSqft) || 1000));
  const floorsCount = Math.max(1, Math.min(4, parseInt(floors, 10) || 1));
  const bedroomCount = Math.max(1, Math.min(10, parseInt(bedrooms, 10) || 2));
  const quality = FINISH_QUALITY_RATES[finishQuality] ? finishQuality : 'standard';
  const type = HOUSE_TYPE_MULTIPLIERS[houseType] !== undefined ? houseType : 'independent-house';

  const floorMultiplier = 1 + Math.max(0, floorsCount - 1) * 0.08;
  const ratePerSqft = FINISH_QUALITY_RATES[quality] * HOUSE_TYPE_MULTIPLIERS[type] * floorMultiplier;
  const baseTotal = area * ratePerSqft;

  // Larger homes typically add more bathrooms/fixtures beyond a 2-bed base —
  // folded into the plumbing and bathroom line items below, not spread evenly.
  const bedroomAddon = Math.max(0, bedroomCount - 2) * 30000;
  const totalCost = Math.round(baseTotal + bedroomAddon);

  const breakdown = COST_CATEGORIES.map((c) => {
    let amount = baseTotal * c.percentage;
    if (c.key === 'plumbing' || c.key === 'bathroom') amount += bedroomAddon / 2;
    return { key: c.key, label: c.label, amount: Math.round(amount), percentage: Math.round(c.percentage * 100) };
  });
  // Rounding each line independently can drift a few rupees from the total —
  // absorb that drift into the largest line item so the breakdown always sums exactly.
  const drift = totalCost - breakdown.reduce((s, b) => s + b.amount, 0);
  if (drift !== 0) breakdown[0].amount += drift;

  const result = {
    inputs: { builtUpAreaSqft: area, floors: floorsCount, bedrooms: bedroomCount, houseType: type, finishQuality: quality },
    totalCost,
    costPerSqft: Math.round(ratePerSqft),
    breakdown,
    currency: 'INR',
    disclaimer:
      'This is an approximate PLANNING-STAGE ESTIMATE, not a construction quotation. Actual cost ' +
      'depends on location, material brands, labor rates, site conditions, and final design — always ' +
      'get a detailed quote from a licensed contractor or quantity surveyor before budgeting for real.',
  };

  const budgetNum = Number(budget) || 0;
  if (budgetNum > 0) {
    result.budget = budgetNum;
    result.difference = totalCost - budgetNum; // positive = over budget, negative = under
    result.exceedsBudget = totalCost > budgetNum;
    if (result.exceedsBudget) {
      result.warningMessage = 'Design exceeds approximate budget.';
      result.suggestions = [
        `Reduce built-up area — every 100 sqft cut saves roughly ${Math.round(ratePerSqft * 100).toLocaleString('en-IN')} rupees.`,
        `Reduce finishing level — dropping from "${quality}" to a simpler finish lowers the rate per sqft directly.`,
        'Reduce unnecessary spaces — merge or drop a rarely-used room, like a formal dining room or a second living area.',
        'Use a simpler layout — fewer partition walls, verandahs, or decorative features lowers both civil and finishing costs.',
      ];
    }
  }

  return result;
}

function allRooms(layout) {
  if (Array.isArray(layout.floors) && layout.floors.length && layout.floors[0]?.rooms) {
    return layout.floors.flatMap((f) => f.rooms || []);
  }
  return layout.rooms || [];
}

// Meters-based entry point — used by the Gemini-generated layouts (server.js's
// /api/design and /api/design/modify), whose room dimensions are in meters.
function estimateCost(layout, requirements = {}) {
  const rooms = allRooms(layout);
  const areaSqm = rooms.reduce((sum, r) => sum + r.width * r.depth, 0);
  const areaSqft = areaSqm * SQM_TO_SQFT;
  const floorsCount = (Array.isArray(layout.floors) && layout.floors.length) || 1;
  const bathroomCount = rooms.filter((r) => r.type === 'bathroom').length;

  const result = estimateCostFromSqft(areaSqft, {
    style: requirements.style,
    floorsCount,
    bathroomCount,
    parking: requirements.parking,
    garden: requirements.garden,
    budget: requirements.budget,
  });
  result.areaSqm = Math.round(areaSqm * 10) / 10;
  return result;
}

module.exports = { estimateCost, estimateCostFromSqft, estimateDetailedCost };
