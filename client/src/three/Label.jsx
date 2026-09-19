import { useEffect, useMemo } from 'react';
import * as THREE from 'three';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// A floating text label (room name, "Stairs") rendered as a canvas-texture sprite —
// same technique as the old viewer's makeLabelSprite, kept because it has zero extra
// dependencies and zero network requests (unlike drei's <Text>, which needs a font
// file). depthTest={false} + a high renderOrder keeps it readable through walls.
export default function Label({ text, position }) {
  const { texture, width, height } = useMemo(() => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const fontSize = 42;
    ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
    const metrics = ctx.measureText(text);
    canvas.width = metrics.width + 40;
    canvas.height = fontSize + 30;
    // Re-set the font: changing canvas.width/height resets the 2D context state.
    ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
    ctx.fillStyle = 'rgba(20, 24, 30, 0.82)';
    roundRect(ctx, 0, 0, canvas.width, canvas.height, 16);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 20, canvas.height / 2);
    return { texture: new THREE.CanvasTexture(canvas), width: canvas.width, height: canvas.height };
  }, [text]);

  useEffect(() => () => texture.dispose(), [texture]);

  const scale = 0.012;
  return (
    <sprite position={position} scale={[width * scale, height * scale, 1]} renderOrder={999}>
      <spriteMaterial map={texture} depthTest={false} />
    </sprite>
  );
}
