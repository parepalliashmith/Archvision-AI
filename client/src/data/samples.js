// Hand-authored sample layouts so the dashboard can demo the 3D engine and the
// save/compare flow without an AI key configured. Same shape /api/design returns.
import { getAllRooms, areaOf, areaUnitOf, roomCountOf, floorCountOf } from '../lib/layout.js';

export { areaOf, areaUnitOf, roomCountOf, floorCountOf };

export const SAMPLE_LAYOUTS = [
  {
    id: 'compact-2bhk',
    label: 'Compact 2BHK',
    layout: {
      title: 'Compact 2BHK',
      summary: 'A tight, efficient 65 sqm layout with two bedrooms and an open living area.',
      widthMeters: 10,
      depthMeters: 6.5,
      rooms: [
        { name: 'Living Room', type: 'living', x: 0, y: 0, width: 5, depth: 4 },
        { name: 'Kitchen', type: 'kitchen', x: 5, y: 0, width: 3, depth: 2.5 },
        { name: 'Bathroom', type: 'bathroom', x: 8, y: 0, width: 2, depth: 2.5 },
        { name: 'Hallway', type: 'hallway', x: 5, y: 2.5, width: 5, depth: 1.5 },
        { name: 'Bedroom 1', type: 'bedroom', x: 0, y: 4, width: 4, depth: 2.5 },
        { name: 'Bedroom 2', type: 'bedroom', x: 4, y: 4, width: 3.5, depth: 2.5 },
        { name: 'Balcony', type: 'balcony', x: 7.5, y: 4, width: 2.5, depth: 2.5 },
      ],
      doors: [
        { floor: 0, room: 'Living Room', wall: 'north', offset: 2, width: 1 },
        { floor: 0, room: 'Living Room', wall: 'east', offset: 0.8, width: 1 },
        { floor: 0, room: 'Kitchen', wall: 'west', offset: 0.8, width: 1 },
        { floor: 0, room: 'Living Room', wall: 'south', offset: 1, width: 1 },
        { floor: 0, room: 'Bedroom 1', wall: 'north', offset: 1, width: 1 },
        { floor: 0, room: 'Hallway', wall: 'south', offset: 0.5, width: 1 },
        { floor: 0, room: 'Bedroom 2', wall: 'north', offset: 1.5, width: 1 },
        { floor: 0, room: 'Bathroom', wall: 'south', offset: 0.5, width: 0.8 },
        { floor: 0, room: 'Hallway', wall: 'north', offset: 3.5, width: 0.8 },
      ],
      windows: [
        { floor: 0, room: 'Living Room', wall: 'north', offset: 3.5, width: 1.2 },
        { floor: 0, room: 'Kitchen', wall: 'north', offset: 1, width: 1 },
        { floor: 0, room: 'Bathroom', wall: 'east', offset: 0.5, width: 1 },
        { floor: 0, room: 'Bedroom 1', wall: 'west', offset: 0.5, width: 1 },
        { floor: 0, room: 'Bedroom 2', wall: 'south', offset: 1, width: 1.2 },
      ],
    },
  },
  {
    id: 'modern-villa',
    label: 'Modern Family Villa',
    layout: {
      title: 'Modern Family Villa',
      summary: 'An 180 sqm single-storey villa with an open living/dining core, a study, and a garage.',
      widthMeters: 15,
      depthMeters: 12,
      rooms: [
        { name: 'Living Room', type: 'living', x: 0, y: 0, width: 7, depth: 6 },
        { name: 'Dining', type: 'dining', x: 7, y: 0, width: 4, depth: 4 },
        { name: 'Kitchen', type: 'kitchen', x: 11, y: 0, width: 4, depth: 4 },
        { name: 'Study', type: 'study', x: 7, y: 4, width: 4, depth: 2.5 },
        { name: 'Garage', type: 'garage', x: 11, y: 4, width: 4, depth: 5.5 },
        { name: 'Hallway', type: 'hallway', x: 0, y: 6, width: 11, depth: 1.5 },
        { name: 'Master Bedroom', type: 'bedroom', x: 0, y: 7.5, width: 5, depth: 4.5 },
        { name: 'Master Bathroom', type: 'bathroom', x: 5, y: 7.5, width: 2.5, depth: 2.5 },
        { name: 'Bedroom 2', type: 'bedroom', x: 7.5, y: 7.5, width: 4, depth: 4.5 },
        { name: 'Bedroom 3', type: 'bedroom', x: 11.5, y: 7.5, width: 3.5, depth: 4.5 },
        { name: 'Bathroom', type: 'bathroom', x: 5, y: 10, width: 2.5, depth: 2 },
      ],
      doors: [
        { floor: 0, room: 'Living Room', wall: 'west', offset: 2, width: 1.2 },
        { floor: 0, room: 'Living Room', wall: 'east', offset: 2, width: 1.2 },
        { floor: 0, room: 'Dining', wall: 'west', offset: 2, width: 1.2 },
        { floor: 0, room: 'Dining', wall: 'east', offset: 1.5, width: 1 },
        { floor: 0, room: 'Kitchen', wall: 'west', offset: 1.5, width: 1 },
        { floor: 0, room: 'Living Room', wall: 'south', offset: 3, width: 1.2 },
        { floor: 0, room: 'Hallway', wall: 'north', offset: 3, width: 1.2 },
        { floor: 0, room: 'Hallway', wall: 'south', offset: 2, width: 1 },
        { floor: 0, room: 'Master Bedroom', wall: 'north', offset: 2, width: 1 },
      ],
      windows: [
        { floor: 0, room: 'Living Room', wall: 'north', offset: 2.5, width: 1.6 },
        { floor: 0, room: 'Kitchen', wall: 'north', offset: 1.5, width: 1.2 },
        { floor: 0, room: 'Master Bedroom', wall: 'west', offset: 1.5, width: 1.2 },
        { floor: 0, room: 'Master Bedroom', wall: 'south', offset: 1.5, width: 1.2 },
        { floor: 0, room: 'Bedroom 2', wall: 'south', offset: 1.5, width: 1.2 },
        { floor: 0, room: 'Bedroom 3', wall: 'south', offset: 1, width: 1.2 },
        { floor: 0, room: 'Bedroom 3', wall: 'east', offset: 1.5, width: 1.2 },
      ],
    },
  },
  {
    id: 'studio-apartment',
    label: 'Studio Apartment',
    layout: {
      title: 'Studio Apartment',
      summary: 'A 40 sqm open-plan studio with a kitchenette and compact bathroom.',
      widthMeters: 8,
      depthMeters: 5,
      rooms: [
        { name: 'Living / Sleeping Area', type: 'living', x: 0, y: 0, width: 5, depth: 5 },
        { name: 'Kitchenette', type: 'kitchen', x: 5, y: 0, width: 3, depth: 2.5 },
        { name: 'Bathroom', type: 'bathroom', x: 5, y: 2.5, width: 3, depth: 2.5 },
      ],
      doors: [
        { floor: 0, room: 'Living / Sleeping Area', wall: 'west', offset: 2, width: 1.2 },
        { floor: 0, room: 'Living / Sleeping Area', wall: 'east', offset: 0.8, width: 1 },
        { floor: 0, room: 'Kitchenette', wall: 'west', offset: 0.8, width: 1 },
        { floor: 0, room: 'Living / Sleeping Area', wall: 'east', offset: 3.3, width: 0.8 },
        { floor: 0, room: 'Bathroom', wall: 'west', offset: 0.5, width: 0.8 },
      ],
      windows: [
        { floor: 0, room: 'Living / Sleeping Area', wall: 'north', offset: 1.5, width: 1.5 },
        { floor: 0, room: 'Kitchenette', wall: 'north', offset: 1, width: 1 },
      ],
    },
  },
  {
    id: 'two-storey-family-home',
    label: 'Two-Storey Family Home',
    layout: {
      title: 'Two-Storey Family Home',
      summary: 'A 150 sqm two-storey home: living/kitchen/garage downstairs, three bedrooms and a staircase landing upstairs.',
      widthMeters: 10,
      depthMeters: 8,
      floors: [
        {
          level: 0,
          rooms: [
            { name: 'Living Room', type: 'living', x: 0, y: 0, width: 6, depth: 4 },
            { name: 'Kitchen', type: 'kitchen', x: 6, y: 0, width: 4, depth: 3 },
            { name: 'Dining', type: 'dining', x: 6, y: 3, width: 4, depth: 2 },
            { name: 'Hallway', type: 'hallway', x: 0, y: 4, width: 3, depth: 4 },
            { name: 'Garage', type: 'garage', x: 3, y: 4, width: 3, depth: 4 },
            { name: 'Guest Bathroom', type: 'bathroom', x: 7, y: 5, width: 3, depth: 3 },
          ],
        },
        {
          level: 1,
          rooms: [
            { name: 'Master Bedroom', type: 'bedroom', x: 0, y: 0, width: 5, depth: 4 },
            { name: 'Bedroom 2', type: 'bedroom', x: 5, y: 0, width: 5, depth: 4 },
            { name: 'Bedroom 3', type: 'bedroom', x: 6, y: 4, width: 4, depth: 4 },
            { name: 'Bathroom', type: 'bathroom', x: 3, y: 4, width: 3, depth: 2 },
            { name: 'Landing', type: 'hallway', x: 0, y: 4, width: 3, depth: 4 },
          ],
        },
      ],
      stairs: [{ fromFloor: 0, x: 0, y: 4, width: 3, depth: 4 }],
      doors: [
        { floor: 0, room: 'Living Room', wall: 'north', offset: 2, width: 1 },
        { floor: 0, room: 'Living Room', wall: 'east', offset: 1, width: 1 },
        { floor: 0, room: 'Kitchen', wall: 'west', offset: 1, width: 1 },
        { floor: 0, room: 'Living Room', wall: 'south', offset: 1, width: 1 },
        { floor: 0, room: 'Hallway', wall: 'north', offset: 1, width: 1 },
        { floor: 0, room: 'Hallway', wall: 'east', offset: 1.5, width: 1 },
        { floor: 0, room: 'Garage', wall: 'west', offset: 1.5, width: 1 },
        { floor: 0, room: 'Kitchen', wall: 'south', offset: 1, width: 1 },
        { floor: 0, room: 'Dining', wall: 'north', offset: 1, width: 1 },
        { floor: 0, room: 'Garage', wall: 'south', offset: 1, width: 2 },
        { floor: 1, room: 'Landing', wall: 'east', offset: 0.5, width: 1 },
        { floor: 1, room: 'Bathroom', wall: 'west', offset: 0.5, width: 1 },
        { floor: 1, room: 'Landing', wall: 'north', offset: 1, width: 1 },
        { floor: 1, room: 'Master Bedroom', wall: 'south', offset: 1, width: 1 },
        { floor: 1, room: 'Master Bedroom', wall: 'east', offset: 1, width: 1 },
        { floor: 1, room: 'Bedroom 2', wall: 'west', offset: 1, width: 1 },
        { floor: 1, room: 'Bedroom 3', wall: 'west', offset: 0.5, width: 1 },
        { floor: 1, room: 'Bathroom', wall: 'east', offset: 0.5, width: 1 },
      ],
      windows: [
        { floor: 0, room: 'Living Room', wall: 'north', offset: 3.5, width: 1.2 },
        { floor: 0, room: 'Living Room', wall: 'west', offset: 1, width: 1 },
        { floor: 0, room: 'Kitchen', wall: 'north', offset: 1, width: 1 },
        { floor: 0, room: 'Dining', wall: 'east', offset: 0.5, width: 1 },
        { floor: 0, room: 'Guest Bathroom', wall: 'south', offset: 1, width: 1 },
        { floor: 1, room: 'Master Bedroom', wall: 'north', offset: 1.5, width: 1.2 },
        { floor: 1, room: 'Bedroom 2', wall: 'north', offset: 1.5, width: 1.2 },
        { floor: 1, room: 'Bedroom 2', wall: 'east', offset: 1, width: 1 },
        { floor: 1, room: 'Bedroom 3', wall: 'east', offset: 1, width: 1 },
        { floor: 1, room: 'Bedroom 3', wall: 'south', offset: 1, width: 1.2 },
      ],
    },
  },
];

export function deriveRequirementsFromLayout(layout) {
  const rooms = getAllRooms(layout);
  return {
    bedrooms: rooms.filter((r) => r.type === 'bedroom').length || undefined,
    bathrooms: rooms.filter((r) => r.type === 'bathroom').length || undefined,
    floors: floorCountOf(layout),
    notes: `Similar in scale and style to "${layout.title}": ${layout.summary || ''}`.trim(),
  };
}
