(function () {
  const NS = "http://www.w3.org/2000/svg";
  const tones = ["#050505", "#3b3b3b", "#686868", "#929292", "#bdbdbd"];
  const dashes = ["", "11 6", "3 4", "14 4 3 4", "2 7"];

  function svgElement(name, attributes = {}) {
    const element = document.createElementNS(NS, name);
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
    return element;
  }

  function formatNumber(value) {
    return new Intl.NumberFormat("ru-RU", {
      maximumFractionDigits: Math.abs(value) < 10 ? 2 : 0,
    }).format(value);
  }

  function niceMaximum(value) {
    if (value <= 0) return 1;
    const exponent = 10 ** Math.floor(Math.log10(value));
    const fraction = value / exponent;
    return (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * exponent;
  }

  function smoothPath(points) {
    if (points.length < 2) return "";
    let path = `M ${points[0][0]} ${points[0][1]}`;
    for (let index = 0; index < points.length - 1; index += 1) {
      const current = points[index];
      const next = points[index + 1];
      const controlX = (current[0] + next[0]) / 2;
      path += ` C ${controlX} ${current[1]}, ${controlX} ${next[1]}, ${next[0]} ${next[1]}`;
    }
    return path;
  }

  function buildScale(chart, values, top, height) {
    const positive = values.filter((value) => value > 0);
    if (chart.scale === "log" && positive.length) {
      const sourceMinimum = Math.min(...positive, chart.threshold || Infinity);
      const sourceMaximum = Math.max(...positive, chart.threshold || 0);
      const minimum = 10 ** Math.floor(Math.log10(sourceMinimum));
      const maximum = 10 ** Math.ceil(Math.log10(sourceMaximum * 1.02));
      const minLog = Math.log10(minimum);
      const maxLog = Math.log10(maximum);
      const ticks = [];
      for (let exponent = Math.floor(minLog); exponent <= Math.ceil(maxLog); exponent += 1) {
        ticks.push(10 ** exponent);
      }
      return {
        minimum,
        maximum,
        ticks,
        y: (value) => top + height - ((Math.log10(Math.max(value, minimum)) - minLog) / (maxLog - minLog || 1)) * height,
      };
    }

    const maximum = niceMaximum(Math.max(...values, chart.threshold || 0) * 1.08);
    return {
      minimum: 0,
      maximum,
      ticks: Array.from({ length: 6 }, (_, index) => (maximum / 5) * index),
      y: (value) => top + height - (value / maximum) * height,
    };
  }

  function attachTooltip(target, tooltip, canvas, html) {
    target.addEventListener("pointermove", (event) => {
      const bounds = canvas.getBoundingClientRect();
      tooltip.innerHTML = html();
      tooltip.hidden = false;
      tooltip.style.left = `${Math.max(8, Math.min(event.clientX - bounds.left + 12, bounds.width - 188))}px`;
      tooltip.style.top = `${Math.max(event.clientY - bounds.top - 62, 8)}px`;
    });
    target.addEventListener("pointerleave", () => {
      tooltip.hidden = true;
    });
  }

  function renderChart(chart, chartIndex) {
    const article = document.createElement("article");
    article.className = `research-chart${chartIndex % 2 ? " is-reversed" : ""}`;

    const copy = document.createElement("div");
    copy.className = "research-chart-copy";

    const meta = document.createElement("div");
    meta.className = "research-chart-meta";
    meta.innerHTML = `<span>РИС. ${chart.number}</span><strong>${chart.unit}</strong>`;

    const heading = document.createElement("div");
    heading.className = "research-chart-heading";
    heading.innerHTML = `<h3>${chart.title}</h3><p>${chart.note}</p>`;

    const metrics = document.createElement("dl");
    metrics.className = "research-chart-metrics";
    (chart.metrics || []).forEach(([term, value]) => {
      const row = document.createElement("div");
      row.innerHTML = `<dt>${term}</dt><dd>${value}</dd>`;
      metrics.append(row);
    });

    const analysis = document.createElement("div");
    analysis.className = "research-chart-analysis";
    (chart.analysis || []).forEach((paragraph) => {
      const element = document.createElement("p");
      element.textContent = paragraph;
      analysis.append(element);
    });

    const canvas = document.createElement("div");
    canvas.className = "research-chart-canvas";
    const instrument = document.createElement("div");
    instrument.className = "chart-instrument-bar";
    instrument.innerHTML = `<span>MIDGAS / ${chart.number}</span><span>${chart.scale === "log" ? "LOG SCALE" : chart.type === "heatmap" ? "COHORT MATRIX" : "LINEAR SCALE"}</span>`;
    const svg = svgElement("svg", { viewBox: "0 0 760 500", role: "img", "aria-label": chart.title, preserveAspectRatio: "xMidYMid meet" });
    const tooltip = document.createElement("div");
    tooltip.className = "chart-tooltip";
    tooltip.hidden = true;
    canvas.append(instrument, svg, tooltip);

    const legend = document.createElement("div");
    legend.className = "chart-legend";
    const active = new Set(chart.series.map((_, index) => index));

    chart.series.forEach((series, seriesIndex) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "chart-legend-item is-active";
      button.innerHTML = `<i style="--series-tone:${tones[seriesIndex % tones.length]}"></i><span>${series.name}</span>`;
      button.addEventListener("click", () => {
        if (active.has(seriesIndex) && active.size > 1) {
          active.delete(seriesIndex);
          button.classList.remove("is-active");
        } else {
          active.add(seriesIndex);
          button.classList.add("is-active");
        }
        draw();
      });
      legend.append(button);
    });

    function drawAxes(scale, layout, xLabels = true) {
      const { left, top, plotWidth, plotHeight, width, height } = layout;
      scale.ticks.forEach((value) => {
        const yy = scale.y(value);
        svg.append(svgElement("line", { x1: left, y1: yy, x2: left + plotWidth, y2: yy, class: "chart-grid-line" }));
        const label = svgElement("text", { x: left - 12, y: yy + 4, "text-anchor": "end", class: "chart-axis-label" });
        label.textContent = formatNumber(value);
        svg.append(label);
      });

      if (xLabels) {
        const step = plotWidth / chart.labels.length;
        chart.labels.forEach((labelText, labelIndex) => {
          const x = left + step * labelIndex + step / 2;
          const label = svgElement("text", { x, y: height - 30, "text-anchor": "middle", class: "chart-axis-label" });
          label.textContent = labelText;
          svg.append(label);
        });
      }

      svg.append(svgElement("line", { x1: left, y1: top, x2: left, y2: top + plotHeight, class: "chart-axis" }));
      svg.append(svgElement("line", { x1: left, y1: top + plotHeight, x2: width - 24, y2: top + plotHeight, class: "chart-axis" }));

      if (chart.threshold) {
        const thresholdY = scale.y(chart.threshold);
        svg.append(svgElement("rect", {
          x: left,
          y: top,
          width: plotWidth,
          height: Math.max(thresholdY - top, 0),
          class: "chart-danger-zone",
        }));
        svg.append(svgElement("line", { x1: left, y1: thresholdY, x2: left + plotWidth, y2: thresholdY, class: "chart-threshold" }));
        const thresholdLabel = svgElement("text", { x: left + plotWidth - 4, y: thresholdY - 7, "text-anchor": "end", class: "chart-threshold-label" });
        thresholdLabel.textContent = `КОНТРОЛЬ ${formatNumber(chart.threshold)}`;
        svg.append(thresholdLabel);
      }
    }

    function drawHeatmap(visibleSeries, layout) {
      const { left, top, plotWidth, plotHeight, width, height } = layout;
      const maximum = Math.max(...visibleSeries.flatMap((series) => series.values));
      const rowHeight = plotHeight / visibleSeries.length;
      const columnWidth = plotWidth / chart.labels.length;

      chart.labels.forEach((labelText, index) => {
        const label = svgElement("text", { x: left + columnWidth * index + columnWidth / 2, y: height - 30, "text-anchor": "middle", class: "chart-axis-label" });
        label.textContent = labelText;
        svg.append(label);
      });

      visibleSeries.forEach((series, rowIndex) => {
        const originalIndex = chart.series.indexOf(series);
        const rowLabel = svgElement("text", { x: left - 12, y: top + rowHeight * rowIndex + rowHeight / 2 + 4, "text-anchor": "end", class: "chart-axis-label chart-heat-label" });
        rowLabel.textContent = series.shortName || series.name;
        svg.append(rowLabel);

        series.values.forEach((value, columnIndex) => {
          const intensity = Math.round(244 - (value / maximum) * 222);
          const cell = svgElement("rect", {
            x: left + columnWidth * columnIndex + 1,
            y: top + rowHeight * rowIndex + 1,
            width: columnWidth - 2,
            height: rowHeight - 2,
            fill: `rgb(${intensity},${intensity},${intensity})`,
            class: "chart-heat-cell",
          });
          attachTooltip(cell, tooltip, canvas, () => `<b>${chart.labels[columnIndex]}</b><span>${series.name}: ${formatNumber(value)} ${chart.unit}</span>`);
          svg.append(cell);
          const valueLabel = svgElement("text", {
            x: left + columnWidth * columnIndex + columnWidth / 2,
            y: top + rowHeight * rowIndex + rowHeight / 2 + 4,
            "text-anchor": "middle",
            fill: intensity < 116 ? "#fff" : "#000",
            class: "chart-cell-value",
          });
          valueLabel.textContent = formatNumber(value);
          svg.append(valueLabel);
        });

        const marker = svgElement("rect", { x: width - 18, y: top + rowHeight * rowIndex + 1, width: 4, height: rowHeight - 2, fill: tones[originalIndex % tones.length] });
        svg.append(marker);
      });
    }

    function drawStackedArea(visibleSeries, scale, layout) {
      const { left, top, plotWidth, plotHeight } = layout;
      const step = plotWidth / chart.labels.length;
      let baseline = Array(chart.labels.length).fill(0);

      visibleSeries.forEach((series, visibleIndex) => {
        const originalIndex = chart.series.indexOf(series);
        const upper = series.values.map((value, index) => baseline[index] + value);
        const upperPoints = upper.map((value, index) => [left + step * index + step / 2, scale.y(value)]);
        const lowerPoints = baseline.map((value, index) => [left + step * index + step / 2, scale.y(value)]).reverse();
        const polygon = svgElement("polygon", {
          points: [...upperPoints, ...lowerPoints].map(([x, y]) => `${x},${y}`).join(" "),
          fill: tones[(originalIndex + 1) % tones.length],
          opacity: 0.88 - visibleIndex * 0.12,
          class: "chart-area",
        });
        svg.append(polygon);
        const outline = svgElement("polyline", {
          points: upperPoints.map(([x, y]) => `${x},${y}`).join(" "),
          fill: "none",
          stroke: "#000",
          "stroke-width": 2,
          class: "chart-line",
        });
        svg.append(outline);
        upperPoints.forEach(([x, y], labelIndex) => {
          const value = series.values[labelIndex];
          const point = svgElement("circle", { cx: x, cy: y, r: 4, fill: "#fff", stroke: "#000", "stroke-width": 2, class: "chart-point" });
          attachTooltip(point, tooltip, canvas, () => `<b>${chart.labels[labelIndex]}</b><span>${series.name}: ${formatNumber(value)} ${chart.unit}</span><span>Накопительно: ${formatNumber(upper[labelIndex])}</span>`);
          svg.append(point);
        });
        baseline = upper;
      });
    }

    function draw() {
      svg.replaceChildren();
      const layout = { width: 760, height: 500, left: chart.type === "heatmap" ? 152 : 74, top: 30 };
      layout.plotWidth = layout.width - layout.left - 24;
      layout.plotHeight = layout.height - layout.top - 72;
      const visibleSeries = chart.series.filter((_, index) => active.has(index));

      if (chart.type === "heatmap") {
        drawHeatmap(visibleSeries, layout);
        return;
      }

      const stackedValues = chart.type === "stacked-area"
        ? chart.labels.map((_, labelIndex) => visibleSeries.reduce((sum, series) => sum + series.values[labelIndex], 0))
        : visibleSeries.flatMap((series) => series.values);
      const scale = buildScale(chart, stackedValues, layout.top, layout.plotHeight);
      drawAxes(scale, layout);
      const step = layout.plotWidth / chart.labels.length;

      if (chart.type === "stacked-area") {
        drawStackedArea(visibleSeries, scale, layout);
        return;
      }

      if (chart.type === "bar" || chart.type === "grouped-bar") {
        const groupWidth = step * 0.72;
        const barWidth = groupWidth / visibleSeries.length;
        const baseY = scale.y(scale.minimum);
        chart.labels.forEach((labelText, labelIndex) => {
          visibleSeries.forEach((series, visibleIndex) => {
            const originalIndex = chart.series.indexOf(series);
            const value = series.values[labelIndex];
            const x = layout.left + step * labelIndex + (step - groupWidth) / 2 + visibleIndex * barWidth;
            const barY = scale.y(value);
            const bar = svgElement("rect", {
              x,
              y: barY,
              width: Math.max(barWidth - 3, 3),
              height: Math.max(baseY - barY, 2),
              fill: tones[originalIndex % tones.length],
              class: "chart-bar",
            });
            attachTooltip(bar, tooltip, canvas, () => `<b>${labelText}</b><span>${series.name}: ${formatNumber(value)} ${chart.unit}</span>`);
            svg.append(bar);
            if (chart.labels.length <= 6) {
              const valueLabel = svgElement("text", { x: x + Math.max(barWidth - 3, 3) / 2, y: barY - 8, "text-anchor": "middle", class: "chart-value-label" });
              valueLabel.textContent = formatNumber(value);
              svg.append(valueLabel);
            }
          });
        });
        return;
      }

      visibleSeries.forEach((series) => {
        const originalIndex = chart.series.indexOf(series);
        const points = series.values.map((value, index) => [layout.left + step * index + step / 2, scale.y(value), value, index]);

        if (chart.uncertainty) {
          const upper = series.values.map((value, index) => [layout.left + step * index + step / 2, scale.y(value * (1 + chart.uncertainty))]);
          const lower = series.values.map((value, index) => [layout.left + step * index + step / 2, scale.y(Math.max(value * (1 - chart.uncertainty), scale.minimum))]).reverse();
          svg.append(svgElement("polygon", {
            points: [...upper, ...lower].map(([x, y]) => `${x},${y}`).join(" "),
            fill: tones[originalIndex % tones.length],
            opacity: 0.08,
            class: "chart-confidence",
          }));
        }

        svg.append(svgElement("path", {
          d: smoothPath(points),
          fill: "none",
          stroke: tones[originalIndex % tones.length],
          "stroke-width": originalIndex === 0 ? 4 : 3,
          "stroke-dasharray": dashes[originalIndex % dashes.length],
          class: "chart-line",
        }));

        points.forEach(([x, y, value, labelIndex]) => {
          const point = svgElement("circle", { cx: x, cy: y, r: 4.5, fill: "#fff", stroke: tones[originalIndex % tones.length], "stroke-width": 3, class: "chart-point" });
          attachTooltip(point, tooltip, canvas, () => `<b>${chart.labels[labelIndex]}</b><span>${series.name}: ${formatNumber(value)} ${chart.unit}</span><span>95% ДИ: ±${Math.round((chart.uncertainty || 0) * 100)}%</span>`);
          svg.append(point);
        });
      });
    }

    copy.append(meta, heading, metrics, legend, analysis);
    draw();
    article.append(canvas, copy);
    return article;
  }

  function renderTable(table) {
    const section = document.createElement("section");
    section.className = "research-table-section";
    const title = document.createElement("h3");
    title.textContent = table.title;
    const viewport = document.createElement("div");
    viewport.className = "research-table-viewport";
    const element = document.createElement("table");
    const head = document.createElement("thead");
    const headRow = document.createElement("tr");
    table.headers.forEach((header) => {
      const cell = document.createElement("th");
      cell.textContent = header;
      headRow.append(cell);
    });
    head.append(headRow);
    const body = document.createElement("tbody");
    table.rows.forEach((row) => {
      const tr = document.createElement("tr");
      row.forEach((value) => {
        const cell = document.createElement("td");
        cell.textContent = value;
        tr.append(cell);
      });
      body.append(tr);
    });
    element.append(head, body);
    viewport.append(element);
    section.append(title, viewport);
    return section;
  }

  window.renderMidgasResearch = function (record, target) {
    if (!record.research || !target) return;
    const research = record.research;
    const section = document.createElement("section");
    section.className = "record-research";
    section.id = record.kind === "INCIDENT" ? "incident-research" : "radiation-research";

    const header = document.createElement("header");
    header.className = "research-header";
    header.innerHTML = `<span>${research.code}</span><div><p>${research.period}</p><h2>${research.title}</h2><p>${research.intro}</p></div>`;

    const methods = document.createElement("dl");
    methods.className = "research-methods";
    research.methodology.forEach(([term, value]) => {
      const row = document.createElement("div");
      row.innerHTML = `<dt>${term}</dt><dd>${value}</dd>`;
      methods.append(row);
    });

    const charts = document.createElement("div");
    charts.className = "research-chart-list";
    research.charts.forEach((chart, index) => charts.append(renderChart(chart, index)));

    section.append(header, methods, charts, renderTable(research.sampleTable));
    target.append(section);
  };
})();
