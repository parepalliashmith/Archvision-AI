import { getAllRooms, getPlotSize } from '../lib/layout.js';

export default function RoomLegend({ layout }) {
  const rooms = getAllRooms(layout);
  const { unit } = getPlotSize(layout);
  return (
    <ul className="room-legend">
      {rooms.map((room, i) => (
        <li key={i}>
          <span className={`swatch swatch--${room.type}`} />
          {room.name}
          <em>{room.width.toFixed(1)}×{room.depth.toFixed(1)}{unit}</em>
        </li>
      ))}
    </ul>
  );
}
