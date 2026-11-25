/**
 * Procedural SSB Hazy Scene Renderer (Canvas 2D) for PPDT & TAT.
 * Produces ambiguous low-contrast grayscale/sepia scenes AND supports custom uploaded images
 * filtered through authentic projection haze, vignette, and film grain.
 */

function drawPerson(ctx, x, y, scale = 1, pose = 'stand', shade = '#242930') {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = shade;
  ctx.strokeStyle = shade;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Head
  ctx.beginPath();
  ctx.arc(0, -52, 9, 0, Math.PI * 2);
  ctx.fill();

  if (pose === 'crouch') {
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(0, -42);
    ctx.lineTo(-8, -18);
    ctx.lineTo(10, 0);
    ctx.stroke();
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(-4, -36);
    ctx.lineTo(16, -24);
    ctx.stroke();
  } else if (pose === 'sit') {
    ctx.beginPath();
    ctx.roundRect(-10, -42, 20, 26, 5);
    ctx.fill();
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(-2, -18);
    ctx.lineTo(18, -14);
    ctx.lineTo(20, 4);
    ctx.stroke();
  } else if (pose === 'gesture') {
    ctx.beginPath();
    ctx.roundRect(-10, -42, 20, 32, 5);
    ctx.fill();
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(-5, -12);
    ctx.lineTo(-10, 18);
    ctx.moveTo(5, -12);
    ctx.lineTo(11, 18);
    ctx.stroke();
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(8, -36);
    ctx.lineTo(28, -50);
    ctx.moveTo(-8, -36);
    ctx.lineTo(-16, -18);
    ctx.stroke();
  } else if (pose === 'walk') {
    ctx.beginPath();
    ctx.roundRect(-9, -42, 18, 30, 5);
    ctx.fill();
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(-3, -13);
    ctx.lineTo(-14, 18);
    ctx.moveTo(4, -13);
    ctx.lineTo(15, 16);
    ctx.stroke();
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(6, -36);
    ctx.lineTo(18, -20);
    ctx.stroke();
  } else {
    // Stand
    ctx.beginPath();
    ctx.roundRect(-10, -42, 20, 32, 5);
    ctx.fill();
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(-5, -12);
    ctx.lineTo(-7, 18);
    ctx.moveTo(5, -12);
    ctx.lineTo(7, 18);
    ctx.stroke();
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-9, -36);
    ctx.lineTo(-15, -14);
    ctx.moveTo(9, -36);
    ctx.lineTo(15, -14);
    ctx.stroke();
  }

  ctx.restore();
}

function drawBlueprintContent(ctx, width, height, blueprint) {
  if (blueprint === 'blank-slide') {
    ctx.fillStyle = '#e7e4dc';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(40,46,54,0.38)';
    ctx.font = '600 18px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TAT SLIDE 12 — BLANK SLIDE', width / 2, height / 2 - 10);
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillText('Visualize and write a genuine, self-projected story.', width / 2, height / 2 + 18);
    return;
  }

  // Neutral washed overcast sky gradient
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, '#c8ccd0');
  sky.addColorStop(0.58, '#a6abb2');
  sky.addColorStop(1, '#7c828a');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  // Soft horizon / ground plane
  ctx.fillStyle = '#62676f';
  ctx.fillRect(0, height * 0.64, width, height * 0.36);

  switch (blueprint) {
    case 'flood-crossing': {
      ctx.fillStyle = '#8b939b';
      ctx.beginPath();
      ctx.moveTo(0, height * 0.56);
      ctx.quadraticCurveTo(width * 0.5, height * 0.62, width, height * 0.52);
      ctx.lineTo(width, height);
      ctx.lineTo(0, height);
      ctx.fill();
      // Wooden boat silhouette
      ctx.fillStyle = '#2b3036';
      ctx.beginPath();
      ctx.moveTo(width * 0.28, height * 0.72);
      ctx.lineTo(width * 0.72, height * 0.72);
      ctx.lineTo(width * 0.65, height * 0.82);
      ctx.lineTo(width * 0.35, height * 0.82);
      ctx.closePath();
      ctx.fill();
      drawPerson(ctx, width * 0.38, height * 0.70, 0.95, 'gesture');
      drawPerson(ctx, width * 0.52, height * 0.71, 0.85, 'sit');
      drawPerson(ctx, width * 0.63, height * 0.70, 0.88, 'stand');
      drawPerson(ctx, width * 0.16, height * 0.66, 0.9, 'walk');
      break;
    }
    case 'road-mishap': {
      ctx.fillStyle = '#4e535a';
      ctx.fillRect(0, height * 0.66, width, height * 0.34);
      // Streetlamp glow
      const glow = ctx.createRadialGradient(width * 0.24, height * 0.28, 8, width * 0.24, height * 0.28, 160);
      glow.addColorStop(0, 'rgba(235,235,220,0.85)');
      glow.addColorStop(1, 'rgba(200,200,190,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#22262b';
      ctx.fillRect(width * 0.23, height * 0.28, 6, height * 0.42);
      // Fallen two-wheeler silhouette
      ctx.save();
      ctx.translate(width * 0.54, height * 0.78);
      ctx.rotate(-0.35);
      ctx.strokeStyle = '#22262b';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(-22, 6, 14, 0, Math.PI * 2);
      ctx.arc(24, 6, 14, 0, Math.PI * 2);
      ctx.moveTo(-22, 6);
      ctx.lineTo(8, -12);
      ctx.lineTo(24, 6);
      ctx.stroke();
      ctx.restore();
      drawPerson(ctx, width * 0.43, height * 0.74, 1.0, 'crouch');
      drawPerson(ctx, width * 0.68, height * 0.74, 1.05, 'gesture');
      break;
    }
    case 'classroom-briefing': {
      ctx.fillStyle = '#b4b8bd';
      ctx.fillRect(0, 0, width, height * 0.72);
      // Chalkboard
      ctx.fillStyle = '#3c4249';
      ctx.fillRect(width * 0.22, height * 0.16, width * 0.56, height * 0.34);
      ctx.strokeStyle = '#23282e';
      ctx.lineWidth = 6;
      ctx.strokeRect(width * 0.22, height * 0.16, width * 0.56, height * 0.34);
      // Faint diagram lines on board
      ctx.strokeStyle = 'rgba(220,225,230,0.45)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(width * 0.28, height * 0.42);
      ctx.lineTo(width * 0.42, height * 0.28);
      ctx.lineTo(width * 0.56, height * 0.34);
      ctx.lineTo(width * 0.69, height * 0.22);
      ctx.stroke();
      drawPerson(ctx, width * 0.30, height * 0.65, 1.05, 'gesture');
      drawPerson(ctx, width * 0.52, height * 0.73, 0.92, 'sit');
      drawPerson(ctx, width * 0.64, height * 0.73, 0.92, 'sit');
      drawPerson(ctx, width * 0.76, height * 0.73, 0.92, 'sit');
      break;
    }
    case 'mountain-trail': {
      ctx.fillStyle = '#7b8088';
      ctx.beginPath();
      ctx.moveTo(0, height);
      ctx.lineTo(width * 0.34, height * 0.38);
      ctx.lineTo(width * 0.68, height * 0.62);
      ctx.lineTo(width, height * 0.28);
      ctx.lineTo(width, height);
      ctx.fill();
      ctx.fillStyle = '#50555d';
      ctx.beginPath();
      ctx.moveTo(0, height * 0.85);
      ctx.lineTo(width * 0.55, height * 0.58);
      ctx.lineTo(width, height * 0.72);
      ctx.lineTo(width, height);
      ctx.lineTo(0, height);
      ctx.fill();
      drawPerson(ctx, width * 0.44, height * 0.62, 0.95, 'walk');
      drawPerson(ctx, width * 0.33, height * 0.68, 0.92, 'walk');
      // Backpack & trekking pole hints
      ctx.strokeStyle = '#20242a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(width * 0.47, height * 0.53);
      ctx.lineTo(width * 0.50, height * 0.67);
      ctx.stroke();
      break;
    }
    case 'study-desk': {
      ctx.fillStyle = '#8b9097';
      ctx.fillRect(0, 0, width, height);
      const lamp = ctx.createRadialGradient(width * 0.48, height * 0.44, 12, width * 0.48, height * 0.52, 180);
      lamp.addColorStop(0, 'rgba(245,245,235,0.9)');
      lamp.addColorStop(1, 'rgba(90,95,102,0.75)');
      ctx.fillStyle = lamp;
      ctx.fillRect(0, 0, width, height);
      // Desk & book stack
      ctx.fillStyle = '#2a2f36';
      ctx.fillRect(width * 0.2, height * 0.68, width * 0.6, 14);
      ctx.fillRect(width * 0.24, height * 0.70, 12, height * 0.28);
      ctx.fillRect(width * 0.72, height * 0.70, 12, height * 0.28);
      ctx.fillRect(width * 0.62, height * 0.61, 44, 14);
      drawPerson(ctx, width * 0.44, height * 0.69, 1.15, 'sit');
      break;
    }
    case 'workshop-repair': {
      ctx.fillStyle = '#9aa0a8';
      ctx.fillRect(0, 0, width, height * 0.7);
      // Machine / tractor block silhouette
      ctx.fillStyle = '#2e343c';
      ctx.fillRect(width * 0.36, height * 0.46, width * 0.34, height * 0.28);
      ctx.beginPath();
      ctx.arc(width * 0.42, height * 0.74, 24, 0, Math.PI * 2);
      ctx.arc(width * 0.66, height * 0.72, 30, 0, Math.PI * 2);
      ctx.fill();
      drawPerson(ctx, width * 0.28, height * 0.72, 1.05, 'crouch');
      drawPerson(ctx, width * 0.76, height * 0.70, 1.05, 'gesture');
      break;
    }
    case 'railway-platform': {
      // Train coach outline on left
      ctx.fillStyle = '#333941';
      ctx.fillRect(width * 0.04, height * 0.22, width * 0.42, height * 0.46);
      ctx.fillStyle = '#aeb4bc';
      for (let i = 0; i < 3; i++) {
        ctx.fillRect(width * (0.09 + i * 0.12), height * 0.30, 38, 28);
      }
      // Luggage & figures
      ctx.fillStyle = '#262b31';
      ctx.fillRect(width * 0.62, height * 0.68, 28, 22);
      drawPerson(ctx, width * 0.56, height * 0.70, 1.05, 'stand');
      drawPerson(ctx, width * 0.72, height * 0.70, 1.0, 'walk');
      drawPerson(ctx, width * 0.82, height * 0.68, 0.92, 'stand');
      break;
    }
    case 'village-water': {
      // Handpump / tank silhouette
      ctx.fillStyle = '#2f353d';
      ctx.fillRect(width * 0.47, height * 0.48, 14, 72);
      ctx.fillRect(width * 0.42, height * 0.54, 28, 8);
      ctx.fillRect(width * 0.12, height * 0.36, 95, 76);
      drawPerson(ctx, width * 0.38, height * 0.70, 1.0, 'crouch');
      drawPerson(ctx, width * 0.58, height * 0.70, 1.02, 'gesture');
      drawPerson(ctx, width * 0.74, height * 0.71, 0.96, 'stand');
      break;
    }
    case 'sports-track': {
      // Track lanes
      ctx.strokeStyle = 'rgba(230,235,240,0.45)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(0, height * (0.68 + i * 0.07));
        ctx.lineTo(width, height * (0.62 + i * 0.08));
        ctx.stroke();
      }
      drawPerson(ctx, width * 0.46, height * 0.74, 1.05, 'crouch');
      drawPerson(ctx, width * 0.58, height * 0.72, 1.05, 'stand');
      drawPerson(ctx, width * 0.80, height * 0.64, 0.78, 'walk');
      break;
    }
    case 'family-table': {
      ctx.fillStyle = '#9ea4ac';
      ctx.fillRect(0, 0, width, height * 0.68);
      // Table
      ctx.fillStyle = '#2b3036';
      ctx.fillRect(width * 0.25, height * 0.62, width * 0.5, 16);
      ctx.fillRect(width * 0.30, height * 0.64, 12, height * 0.28);
      ctx.fillRect(width * 0.68, height * 0.64, 12, height * 0.28);
      drawPerson(ctx, width * 0.32, height * 0.62, 0.95, 'sit');
      drawPerson(ctx, width * 0.50, height * 0.60, 1.0, 'gesture');
      drawPerson(ctx, width * 0.68, height * 0.62, 0.95, 'sit');
      break;
    }
    case 'warehouse-smoke': {
      // Warehouse silhouette
      ctx.fillStyle = '#333840';
      ctx.fillRect(width * 0.42, height * 0.38, width * 0.44, height * 0.30);
      // Smoke plume clouds
      ctx.fillStyle = 'rgba(35,38,42,0.55)';
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.arc(width * (0.64 - i * 0.04), height * (0.36 - i * 0.055), 24 + i * 9, 0, Math.PI * 2);
        ctx.fill();
      }
      drawPerson(ctx, width * 0.24, height * 0.72, 1.05, 'walk');
      drawPerson(ctx, width * 0.36, height * 0.70, 1.0, 'gesture');
      break;
    }
    case 'hospital-corridor': {
      ctx.fillStyle = '#a4aab2';
      ctx.fillRect(0, 0, width, height * 0.7);
      // Door frame + cross hint
      ctx.fillStyle = '#40464f';
      ctx.fillRect(width * 0.56, height * 0.24, width * 0.22, height * 0.46);
      ctx.fillStyle = '#d8dde2';
      ctx.fillRect(width * 0.65, height * 0.30, 16, 6);
      ctx.fillRect(width * 0.67 - 2, height * 0.27, 6, 16);
      drawPerson(ctx, width * 0.35, height * 0.70, 1.05, 'stand');
      drawPerson(ctx, width * 0.46, height * 0.71, 1.0, 'gesture');
      break;
    }
    case 'group-dispute': {
      drawPerson(ctx, width * 0.25, height * 0.70, 1.02, 'gesture');
      drawPerson(ctx, width * 0.43, height * 0.71, 1.05, 'stand');
      drawPerson(ctx, width * 0.58, height * 0.70, 1.0, 'gesture');
      drawPerson(ctx, width * 0.74, height * 0.71, 0.98, 'stand');
      break;
    }
    case 'night-search': {
      ctx.fillStyle = '#1b1f26';
      ctx.fillRect(0, 0, width, height);
      // Trees
      ctx.fillStyle = '#101318';
      for (const tx of [0.1, 0.24, 0.78, 0.9]) {
        ctx.fillRect(width * tx, height * 0.14, 18, height * 0.62);
      }
      // Flashlight beam cone
      ctx.fillStyle = 'rgba(235, 238, 225, 0.42)';
      ctx.beginPath();
      ctx.moveTo(width * 0.46, height * 0.54);
      ctx.lineTo(width * 0.85, height * 0.34);
      ctx.lineTo(width * 0.85, height * 0.70);
      ctx.closePath();
      ctx.fill();
      drawPerson(ctx, width * 0.40, height * 0.70, 1.05, 'walk', '#0d1014');
      drawPerson(ctx, width * 0.30, height * 0.72, 0.98, 'stand', '#0d1014');
      break;
    }
    case 'coastal-pier': {
      ctx.fillStyle = '#737b84';
      ctx.fillRect(0, height * 0.56, width, height * 0.44);
      // Pier deck & mast
      ctx.fillStyle = '#252a30';
      ctx.fillRect(0, height * 0.64, width * 0.48, 14);
      ctx.beginPath();
      ctx.moveTo(width * 0.56, height * 0.64);
      ctx.lineTo(width * 0.86, height * 0.64);
      ctx.lineTo(width * 0.80, height * 0.75);
      ctx.lineTo(width * 0.61, height * 0.75);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(width * 0.70, height * 0.28, 5, height * 0.38);
      drawPerson(ctx, width * 0.34, height * 0.64, 1.02, 'gesture');
      drawPerson(ctx, width * 0.45, height * 0.64, 0.98, 'crouch');
      break;
    }
    default: {
      drawPerson(ctx, width * 0.5, height * 0.7, 1.05, 'stand');
      break;
    }
  }
}

/**
 * Render either a built-in scene blueprint or a user-provided image onto a canvas with SSB haze filter.
 * @param {HTMLCanvasElement} canvas
 * @param {{ blueprint?: string, imageEl?: HTMLImageElement | null, hazeLevel?: number }} opts
 */
export function renderSsbScene(canvas, { blueprint = 'flood-crossing', imageEl = null, hazeLevel = 65 } = {}) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);

  if (blueprint === 'blank-slide' && !imageEl) {
    drawBlueprintContent(ctx, width, height, 'blank-slide');
    return;
  }

  // Blur filter proportional to hazeLevel (real SSB projector ambiguity!)
  const blurPx = ((Math.max(0, Math.min(100, hazeLevel)) / 100) * 3.2).toFixed(2);
  ctx.save();
  ctx.filter = `grayscale(100%) contrast(${108 - hazeLevel * 0.28}%) blur(${blurPx}px)`;

  if (imageEl) {
    const scale = Math.max(width / imageEl.width, height / imageEl.height);
    const dw = imageEl.width * scale;
    const dh = imageEl.height * scale;
    ctx.drawImage(imageEl, (width - dw) / 2, (height - dh) / 2, dw, dh);
  } else {
    drawBlueprintContent(ctx, width, height, blueprint);
  }
  ctx.restore();

  // Atmospheric projector veil & vignette
  const veilAlpha = (hazeLevel / 100) * 0.24;
  if (veilAlpha > 0) {
    ctx.fillStyle = `rgba(210, 214, 218, ${veilAlpha.toFixed(2)})`;
    ctx.fillRect(0, 0, width, height);
  }

  const vignette = ctx.createRadialGradient(
    width / 2,
    height / 2,
    width * 0.22,
    width / 2,
    height / 2,
    width * 0.65
  );
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(12,15,20,0.52)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
}
