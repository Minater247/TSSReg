(() => {
  const SCALE = 2;
  const MAX_PIXELS = 8000;
  const PADDING = 24;
  const HEADER_H = 48;
  const DAY_HEADER_H = 26;
  const AXIS_W = 54;
  const DAY_W = 180;
  const LEGEND_H = 34;
  const MIN_BLOCK_HEIGHT = 66;
  const BREATHING_ROOM = 14;
  const TRACK_SLACK = 12;
  const BLOCK_PAD_X = 4;
  const BLOCK_PAD_TOP = 2;
  const BLOCK_PAD_BOTTOM = 6;
  const TOP_LINE = 11;
  const TITLE_LINE = 14;
  const TITLE_GAP = 4;
  const SUB_LINE = 12;
  const SWATCH = 12;
  const FONT = '"72", "72full", Arial, Helvetica, sans-serif';
  const TEXT_COLOR = "#131e29";
  const MUTED_COLOR = "#556b82";
  const LINE_COLOR = "#f0f0f0";
  const BORDER_COLOR = "#e5e5e5";
  const CONFLICT_COLOR = "#bb0000";
  const STATUS_STYLE = {
    enrolled: { fill: "#40798e", stroke: "#2c5867", text: "#ffffff" },
    waitlisted: { fill: "#ccffff", stroke: "#7fcccc", text: "#000000" },
    planned: { fill: "#ffffff", stroke: "#a0a0a0", text: "#767676", dashed: true },
    other: { fill: "#eeeeee", stroke: "#cccccc", text: "#333333" },
    conflict: { fill: "#ffffff", stroke: CONFLICT_COLOR, text: TEXT_COLOR, width: 2 },
  };

  function styleOf(status) {
    return STATUS_STYLE[status] || STATUS_STYLE.other;
  }

  function truncate(ctx, text, maxWidth) {
    const value = String(text == null ? "" : text);
    if (!value || maxWidth <= 0) return "";
    if (ctx.measureText(value).width <= maxWidth) return value;
    let cut = value;
    while (cut.length > 1 && ctx.measureText(cut + "…").width > maxWidth) cut = cut.slice(0, -1);
    return cut + "…";
  }

  function blockHeight(item) {
    let height = BLOCK_PAD_TOP + TOP_LINE + TITLE_GAP + TITLE_LINE + TITLE_GAP + BLOCK_PAD_BOTTOM;
    if (item.meta) height += SUB_LINE;
    if (item.instructor) height += SUB_LINE;
    return height;
  }

  function pxPerMinute(items, range) {
    let content = MIN_BLOCK_HEIGHT;
    let shortest = Math.max(range.endMin - range.startMin, 1);
    items.forEach((item) => {
      content = Math.max(content, blockHeight(item));
      shortest = Math.min(shortest, item.endMin - item.startMin);
    });
    return Math.max(1, (content + BREATHING_ROOM) / Math.max(shortest, 1));
  }

  function measure(model) {
    const perMinute = pxPerMinute(model.items, model.range);
    const totalMin = Math.max(model.range.endMin - model.range.startMin, 60);
    const trackHeight = totalMin * perMinute + TRACK_SLACK;
    const gridWidth = DAY_W * Math.max(model.days.length, 1);
    return {
      perMinute,
      trackHeight,
      gridWidth,
      gridLeft: PADDING + AXIS_W,
      headerTop: PADDING + HEADER_H,
      trackTop: PADDING + HEADER_H + DAY_HEADER_H,
      width: PADDING * 2 + AXIS_W + gridWidth,
      height: PADDING * 2 + HEADER_H + DAY_HEADER_H + trackHeight + LEGEND_H,
    };
  }

  function stamp(date) {
    const pad = (value) => (value < 10 ? "0" + value : String(value));
    return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
  }

  function fileName(model, date) {
    const slug = String(model.planName || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return (slug || "my-schedule") + "-" + stamp(date || new Date()) + ".png";
  }

  function subtitle(model, date) {
    const exported = "Exported " + (date || new Date()).toLocaleDateString();
    return model.planName ? model.planName + " | " + exported : exported;
  }

  function outline(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, width, height, radius);
    else ctx.rect(x, y, width, height);
  }

  function swatchAt(ctx, style, x, y) {
    const width = style.width || 1;
    outline(ctx, x, y, SWATCH, SWATCH, 2);
    ctx.fillStyle = style.fill;
    ctx.fill();
    ctx.setLineDash(style.dashed ? [3, 2] : []);
    ctx.strokeStyle = style.stroke;
    ctx.lineWidth = width;
    outline(ctx, x + width / 2, y + width / 2, SWATCH - width, SWATCH - width, 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawHeading(ctx, model) {
    ctx.textAlign = "left";
    ctx.fillStyle = TEXT_COLOR;
    ctx.font = "600 18px " + FONT;
    ctx.fillText("My Schedule", PADDING, PADDING + 16);
    ctx.font = "11px " + FONT;
    ctx.fillStyle = MUTED_COLOR;
    ctx.fillText(subtitle(model), PADDING, PADDING + 34);
  }

  function drawGrid(ctx, model, size) {
    ctx.font = "600 12px " + FONT;
    ctx.fillStyle = TEXT_COLOR;
    ctx.textAlign = "center";
    model.days.forEach((day, index) => {
      ctx.fillText(day.label, size.gridLeft + index * DAY_W + DAY_W / 2, size.headerTop + 17);
    });

    ctx.lineWidth = 1;
    ctx.strokeStyle = BORDER_COLOR;
    ctx.beginPath();
    ctx.moveTo(size.gridLeft, size.trackTop - 0.5);
    ctx.lineTo(size.gridLeft + size.gridWidth, size.trackTop - 0.5);
    ctx.stroke();

    ctx.font = "11px " + FONT;
    model.hours.forEach((hour) => {
      const y = size.trackTop + (hour.minute - model.range.startMin) * size.perMinute;
      ctx.strokeStyle = LINE_COLOR;
      ctx.beginPath();
      ctx.moveTo(size.gridLeft, y + 0.5);
      ctx.lineTo(size.gridLeft + size.gridWidth, y + 0.5);
      ctx.stroke();
      ctx.fillStyle = MUTED_COLOR;
      ctx.textAlign = "right";
      ctx.fillText(hour.label, size.gridLeft - 8, y + 4);
    });

    ctx.strokeStyle = BORDER_COLOR;
    for (let index = 0; index <= model.days.length; index++) {
      const x = size.gridLeft + index * DAY_W;
      ctx.beginPath();
      ctx.moveTo(x + 0.5, size.trackTop);
      ctx.lineTo(x + 0.5, size.trackTop + size.trackHeight);
      ctx.stroke();
    }
    ctx.textAlign = "left";
  }

  function drawBlockText(ctx, item, x, y, width, style) {
    const textWidth = width - BLOCK_PAD_X * 2;
    const center = x + width / 2;
    let cursor = y + BLOCK_PAD_TOP;

    ctx.fillStyle = style.text;
    ctx.globalAlpha = 0.85;
    ctx.font = "600 9px " + FONT;
    const status = truncate(ctx, item.statusLabel, textWidth / 2);
    const statusWidth = status ? ctx.measureText(status).width + 4 : 0;
    if (status) {
      ctx.textAlign = "right";
      ctx.fillText(status, x + width - BLOCK_PAD_X, cursor + 8);
    }
    ctx.textAlign = "left";
    ctx.font = "9px " + FONT;
    ctx.fillText(truncate(ctx, item.timeLabel, textWidth - statusWidth), x + BLOCK_PAD_X, cursor + 8);
    ctx.globalAlpha = 1;

    cursor += TOP_LINE + TITLE_GAP;
    ctx.textAlign = "center";
    ctx.font = "600 12px " + FONT;
    ctx.fillText(truncate(ctx, item.title, textWidth), center, cursor + 11);
    cursor += TITLE_LINE + TITLE_GAP;

    ctx.font = "10px " + FONT;
    if (item.meta) {
      ctx.fillText(truncate(ctx, item.meta, textWidth), center, cursor + 9);
      cursor += SUB_LINE;
    }
    if (item.instructor) {
      ctx.globalAlpha = 0.85;
      ctx.fillText(truncate(ctx, item.instructor, textWidth), center, cursor + 9);
      ctx.globalAlpha = 1;
    }
    ctx.textAlign = "left";
  }

  function drawBlock(ctx, item, x, y, width, height) {
    const style = styleOf(item.status);
    const lineWidth = item.conflict ? 2 : 1;
    ctx.save();
    outline(ctx, x, y, width, height, 3);
    ctx.fillStyle = style.fill;
    ctx.fill();
    ctx.clip();
    drawBlockText(ctx, item, x, y, width, style);
    ctx.restore();
    ctx.save();
    ctx.setLineDash(style.dashed && !item.conflict ? [3, 2] : []);
    ctx.strokeStyle = item.conflict ? CONFLICT_COLOR : style.stroke;
    ctx.lineWidth = lineWidth;
    outline(ctx, x + lineWidth / 2, y + lineWidth / 2, width - lineWidth, height - lineWidth, 3);
    ctx.stroke();
    ctx.restore();
  }

  function drawItems(ctx, model, size) {
    const columnOf = {};
    model.days.forEach((day, index) => {
      columnOf[day.key] = index;
    });
    model.items.forEach((item) => {
      const index = columnOf[item.day];
      if (index === undefined) return;
      const columns = Math.max(item.columns || 1, 1);
      const columnWidth = DAY_W / columns;
      const x = size.gridLeft + index * DAY_W + (item.column || 0) * columnWidth + 1;
      const y = size.trackTop + (item.startMin - model.range.startMin) * size.perMinute;
      const height = Math.max((item.endMin - item.startMin) * size.perMinute - 2, 14);
      drawBlock(ctx, item, x, y, columnWidth - 2, height);
    });
  }

  function drawLegend(ctx, model, size) {
    const baseline = size.trackTop + size.trackHeight + 22;
    let x = size.gridLeft;
    ctx.font = "11px " + FONT;
    ctx.textAlign = "left";
    model.legend.forEach((entry) => {
      swatchAt(ctx, styleOf(entry.status), x, baseline - 9);
      ctx.fillStyle = MUTED_COLOR;
      ctx.fillText(entry.label, x + SWATCH + 6, baseline);
      x += SWATCH + 6 + ctx.measureText(entry.label).width + 16;
    });
  }

  function render(model) {
    const size = measure(model);
    const ratio = Math.min(SCALE, MAX_PIXELS / Math.max(size.width, size.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(size.width * ratio);
    canvas.height = Math.round(size.height * ratio);
    const ctx = canvas.getContext("2d");
    ctx.scale(ratio, ratio);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size.width, size.height);
    drawHeading(ctx, model);
    drawGrid(ctx, model, size);
    drawItems(ctx, model, size);
    drawLegend(ctx, model, size);
    return canvas;
  }

  function save(model) {
    render(model).toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName(model);
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }, "image/png");
  }

  function download(model) {
    if (!model || !model.days.length) return;
    const fonts = document.fonts && document.fonts.ready;
    if (fonts && fonts.then) fonts.then(() => save(model), () => save(model));
    else save(model);
  }

  window.__tssregShared.scheduleExport = {
    MIN_BLOCK_HEIGHT,
    BREATHING_ROOM,
    TRACK_SLACK,
    blockHeight,
    pxPerMinute,
    measure,
    fileName,
    subtitle,
    render,
    download,
  };
})();
