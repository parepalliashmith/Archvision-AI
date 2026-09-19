// Curated/seeded builder profiles — same pattern as SAMPLE_LAYOUTS in
// samples.js: hand-authored demo data so the marketplace experience (search,
// matching, profiles, enquiries) can be fully explored without a real builder
// onboarding/accounts system yet (that's explicit future work — see the plan).
// Every profile carries `verified` explicitly so BuilderCard/BuilderProfile
// only ever show a "Verified" badge when it's actually true, never implied.
// No stock photos — `initials`/`avatarColor` drive a procedural avatar,
// consistent with the rest of the app's "no external assets" approach.

export const SPECIALIZATIONS = ['Modern', 'Traditional', 'Contemporary', 'Farmhouse', 'Compact urban'];
export const SERVICE_LOCATIONS = ['Hyderabad', 'Bangalore', 'Chennai', 'Mumbai', 'Pune', 'Delhi NCR', 'Kochi', 'Coimbatore'];

export const BUILDERS = [
  {
    id: 'meridian-construction',
    name: 'Meridian Construction Co.',
    initials: 'MC', avatarColor: '#a5652e',
    verified: true,
    yearsExperience: 12,
    serviceLocations: ['Hyderabad', 'Bangalore'],
    specializations: ['Modern', 'Contemporary'],
    projectsCompleted: 84,
    rating: 4.8,
    priceRange: [1800, 2400],
    availability: 'available',
    about: 'Modern residential specialists known for clean-lined villas and efficient project delivery across Hyderabad and Bangalore.',
    portfolio: [
      { title: 'Whitefield Modern Villa', style: 'Modern', location: 'Bangalore', areaSqft: 3200 },
      { title: 'Jubilee Hills Residence', style: 'Contemporary', location: 'Hyderabad', areaSqft: 2800 },
    ],
  },
  {
    id: 'stonecraft-builders',
    name: 'Stonecraft Builders',
    initials: 'SB', avatarColor: '#6b4a36',
    verified: true,
    yearsExperience: 18,
    serviceLocations: ['Chennai', 'Coimbatore'],
    specializations: ['Traditional', 'Farmhouse'],
    projectsCompleted: 130,
    rating: 4.6,
    priceRange: [1600, 2000],
    availability: 'available',
    about: 'Traditional and farmhouse-style construction with a strong reputation for stonework and classic detailing in Tamil Nadu.',
    portfolio: [
      { title: 'Adyar Heritage Home', style: 'Traditional', location: 'Chennai', areaSqft: 2600 },
      { title: 'Coimbatore Farmstead', style: 'Farmhouse', location: 'Coimbatore', areaSqft: 3400 },
    ],
  },
  {
    id: 'urban-nest',
    name: 'Urban Nest Developers',
    initials: 'UN', avatarColor: '#4b5842',
    verified: true,
    yearsExperience: 6,
    serviceLocations: ['Bangalore', 'Pune'],
    specializations: ['Compact urban', 'Modern'],
    projectsCompleted: 45,
    rating: 4.5,
    priceRange: [1700, 2200],
    availability: 'busy',
    about: 'Focused on compact-urban and small-plot builds, optimizing every square foot for growing families in dense city plots.',
    portfolio: [
      { title: 'Koramangala Compact Home', style: 'Compact urban', location: 'Bangalore', areaSqft: 1400 },
    ],
  },
  {
    id: 'heritage-home-builders',
    name: 'Heritage Home Builders',
    initials: 'HH', avatarColor: '#8a6a52',
    verified: true,
    yearsExperience: 22,
    serviceLocations: ['Kochi', 'Coimbatore'],
    specializations: ['Traditional', 'Farmhouse'],
    projectsCompleted: 160,
    rating: 4.9,
    priceRange: [1500, 1900],
    availability: 'available',
    about: "Kerala's most experienced traditional-home builder in this directory — sloped-roof homes, courtyards, and natural materials.",
    portfolio: [
      { title: 'Fort Kochi Courtyard House', style: 'Traditional', location: 'Kochi', areaSqft: 3000 },
      { title: 'Palakkad Farmhouse', style: 'Farmhouse', location: 'Coimbatore', areaSqft: 2900 },
    ],
  },
  {
    id: 'skyline-structures',
    name: 'Skyline Structures',
    initials: 'SS', avatarColor: '#33383f',
    verified: false,
    yearsExperience: 9,
    serviceLocations: ['Mumbai', 'Pune'],
    specializations: ['Modern', 'Contemporary'],
    projectsCompleted: 60,
    rating: 4.3,
    priceRange: [2200, 2800],
    availability: 'booked',
    about: 'High-rise-adjacent modern homes and premium finishes for the Mumbai/Pune corridor. Verification in progress.',
    portfolio: [
      { title: 'Bandra Modern Residence', style: 'Modern', location: 'Mumbai', areaSqft: 2400 },
    ],
  },
  {
    id: 'greenroot-builders',
    name: 'GreenRoot Builders',
    initials: 'GR', avatarColor: '#386b47',
    verified: true,
    yearsExperience: 14,
    serviceLocations: ['Delhi NCR', 'Hyderabad'],
    specializations: ['Farmhouse', 'Contemporary'],
    projectsCompleted: 95,
    rating: 4.7,
    priceRange: [1900, 2300],
    availability: 'available',
    about: 'Sustainable-materials farmhouse and contemporary builds with a focus on natural light and courtyard gardens.',
    portfolio: [
      { title: 'Gurgaon Farmhouse Retreat', style: 'Farmhouse', location: 'Delhi NCR', areaSqft: 4200 },
    ],
  },
  {
    id: 'foundation-first',
    name: 'Foundation First',
    initials: 'FF', avatarColor: '#2b2f36',
    verified: false,
    yearsExperience: 5,
    serviceLocations: ['Chennai', 'Bangalore'],
    specializations: ['Modern', 'Compact urban'],
    projectsCompleted: 30,
    rating: 4.2,
    priceRange: [1600, 2000],
    availability: 'available',
    about: 'A newer team building a strong local track record in efficient modern homes. Verification in progress.',
    portfolio: [
      { title: 'Velachery Starter Home', style: 'Modern', location: 'Chennai', areaSqft: 1800 },
    ],
  },
  {
    id: 'legacy-estates',
    name: 'Legacy Estates Construction',
    initials: 'LE', avatarColor: '#9a3324',
    verified: true,
    yearsExperience: 20,
    serviceLocations: ['Mumbai', 'Delhi NCR'],
    specializations: ['Traditional', 'Modern'],
    projectsCompleted: 145,
    rating: 4.8,
    priceRange: [2000, 2600],
    availability: 'busy',
    about: 'Two decades of premium residential construction across Mumbai and the NCR, from classic to modern briefs.',
    portfolio: [
      { title: 'South Delhi Estate', style: 'Traditional', location: 'Delhi NCR', areaSqft: 5000 },
    ],
  },
  {
    id: 'coastal-craft-homes',
    name: 'Coastal Craft Homes',
    initials: 'CC', avatarColor: '#4b8a5e',
    verified: true,
    yearsExperience: 10,
    serviceLocations: ['Kochi', 'Chennai'],
    specializations: ['Contemporary', 'Farmhouse'],
    projectsCompleted: 70,
    rating: 4.5,
    priceRange: [1700, 2100],
    availability: 'available',
    about: 'Coastal-climate-aware contemporary and farmhouse builds — ventilation and moisture-resilient detailing built in.',
    portfolio: [
      { title: 'Marine Drive Contemporary', style: 'Contemporary', location: 'Kochi', areaSqft: 2500 },
    ],
  },
];

// Deterministic, explainable match score — never a bare "mysterious" number.
// Each criterion contributes a fixed point value AND a human-readable reason,
// so the UI can show both (per the spec's own "✓ Serves your location" example).
// `costPerArea` and `areaUnit` come from the customer's actual cost estimate,
// so the budget check compares like-for-like rather than guessing.
export function matchBuilders(builders, { location, style, costPerArea } = {}) {
  const loc = (location || '').trim().toLowerCase();

  return builders
    .map((builder) => {
      let score = 0;
      const reasons = [];

      if (loc && builder.serviceLocations.some((l) => l.toLowerCase().includes(loc) || loc.includes(l.toLowerCase()))) {
        score += 30;
        reasons.push(`Serves your location (${builder.serviceLocations.join(', ')})`);
      }
      if (style && builder.specializations.some((s) => s.toLowerCase() === style.toLowerCase())) {
        score += 25;
        reasons.push(`Experienced in ${style} homes`);
      }
      if (costPerArea) {
        const [min, max] = builder.priceRange;
        const tolerance = (max - min) * 0.3;
        if (costPerArea >= min - tolerance && costPerArea <= max + tolerance) {
          score += 20;
          reasons.push('Handles your budget range');
        }
      }
      const expPoints = Math.min(10, Math.round((builder.yearsExperience / 15) * 10));
      score += expPoints;
      if (builder.yearsExperience >= 8) reasons.push(`${builder.yearsExperience} years of experience`);

      if (builder.availability === 'available') { score += 10; reasons.push('Currently available'); }
      else if (builder.availability === 'busy') { score += 5; }

      if (builder.projectsCompleted >= 50) {
        score += 5;
        reasons.push(`${builder.projectsCompleted}+ homes completed`);
      }

      return { builder, score: Math.min(100, score), reasons };
    })
    .sort((a, b) => b.score - a.score);
}
