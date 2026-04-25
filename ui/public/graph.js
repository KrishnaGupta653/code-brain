class GraphVisualizer {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext("2d");
    this.nodes = [];
    this.edges = [];
    this.nodeMap = new Map();
    this.highlighted = new Set();
    this.selectedNode = null;
    this.offsetX = 0;
    this.offsetY = 0;
    this.zoom = 1;
    this.dragging = false;
    this.dragNodeId = null;
    this.lastMouse = null;
    this.palette = {
      project: "#3f51b5",
      file: "#1565c0",
      module: "#00897b",
      class: "#ef6c00",
      function: "#2e7d32",
      method: "#5e35b1",
      route: "#c62828",
      config: "#6d4c41",
      test: "#8e24aa",
      doc: "#546e7a",
      interface: "#7b1fa2",
      type: "#455a64",
      constant: "#9e9d24",
      variable: "#039be5",
      enum: "#f4511e",
    };

    this.setupCanvas();
    this.setupEventListeners();
    this.renderLegend();
  }

  setupCanvas() {
    const resize = () => {
      const rect = this.canvas.getBoundingClientRect();
      this.canvas.width = rect.width * window.devicePixelRatio;
      this.canvas.height = rect.height * window.devicePixelRatio;
      this.ctx.setTransform(
        window.devicePixelRatio,
        0,
        0,
        window.devicePixelRatio,
        0,
        0,
      );
    };

    resize();
    window.addEventListener("resize", resize);
  }

  setupEventListeners() {
    this.canvas.addEventListener("mousedown", (event) =>
      this.onMouseDown(event),
    );
    this.canvas.addEventListener("mousemove", (event) =>
      this.onMouseMove(event),
    );
    this.canvas.addEventListener("mouseup", () => this.onMouseUp());
    this.canvas.addEventListener("mouseleave", () => this.onMouseUp());
    this.canvas.addEventListener("wheel", (event) => this.onWheel(event), {
      passive: false,
    });

    document
      .getElementById("searchBtn")
      .addEventListener("click", () => this.search());
    document
      .getElementById("searchInput")
      .addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          this.search();
        }
      });
    document
      .getElementById("resetBtn")
      .addEventListener("click", () => this.reset());
    document
      .getElementById("zoomInBtn")
      .addEventListener("click", () => this.zoomBy(1.15));
    document
      .getElementById("zoomOutBtn")
      .addEventListener("click", () => this.zoomBy(1 / 1.15));
  }

  async loadGraph() {
    const response = await fetch("/api/graph");
    const data = await response.json();
    this.nodes = data.nodes.map((node, index) => ({
      ...node,
      x: 140 + (index % 12) * 110,
      y: 120 + Math.floor(index / 12) * 90,
      vx: 0,
      vy: 0,
    }));
    this.edges = data.edges;
    this.nodeMap = new Map(this.nodes.map((node) => [node.id, node]));
    this.updateStats(data.stats);
    this.animate();
  }

  animate() {
    this.updateLayout();
    this.render();
    requestAnimationFrame(() => this.animate());
  }

  updateLayout() {
    const repulsion = 8500;
    const spring = 0.0025;
    const damping = 0.9;

    for (const node of this.nodes) {
      node.fx = 0;
      node.fy = 0;
    }

    for (let i = 0; i < this.nodes.length; i += 1) {
      for (let j = i + 1; j < this.nodes.length; j += 1) {
        const a = this.nodes[i];
        const b = this.nodes[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distance = Math.hypot(dx, dy) || 1;
        const force = repulsion / (distance * distance);
        const fx = (force * dx) / distance;
        const fy = (force * dy) / distance;
        a.fx -= fx;
        a.fy -= fy;
        b.fx += fx;
        b.fy += fy;
      }
    }

    for (const edge of this.edges) {
      const source = this.nodeMap.get(edge.from);
      const target = this.nodeMap.get(edge.to);
      if (!source || !target) {
        continue;
      }

      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const distance = Math.hypot(dx, dy) || 1;
      const desired = 90;
      const force = spring * (distance - desired);
      const fx = (force * dx) / distance;
      const fy = (force * dy) / distance;
      source.fx += fx;
      source.fy += fy;
      target.fx -= fx;
      target.fy -= fy;
    }

    for (const node of this.nodes) {
      if (this.dragNodeId === node.id) {
        node.vx = 0;
        node.vy = 0;
        continue;
      }

      node.vx = (node.vx + node.fx * 0.05) * damping;
      node.vy = (node.vy + node.fy * 0.05) * damping;
      node.x += node.vx;
      node.y += node.vy;
    }
  }

  render() {
    const width = this.canvas.width / window.devicePixelRatio;
    const height = this.canvas.height / window.devicePixelRatio;
    this.ctx.clearRect(0, 0, width, height);
    this.ctx.save();
    this.ctx.translate(this.offsetX, this.offsetY);
    this.ctx.scale(this.zoom, this.zoom);

    // Edge type colors
    const edgeColors = {
      IMPORTS: "#1565c0",
      EXPORTS: "#d32f2f",
      CALLS: "#2e7d32",
      CALLS_UNRESOLVED: "#f57f17",
      OWNS: "#6d4c41",
      DEFINES: "#1976d2",
      USES: "#7e57c2",
      DEPENDS_ON: "#c62828",
      TESTS: "#8e24aa",
      DOCUMENTS: "#546e7a",
      IMPLEMENTS: "#00897b",
      EXTENDS: "#e64a19",
      DECORATES: "#5e35b1",
      REFERENCES: "#0097a7",
      ENTRY_POINT: "#f57f17",
    };

    for (const edge of this.edges) {
      const from = this.nodeMap.get(edge.from);
      const to = this.nodeMap.get(edge.to);
      if (!from || !to) {
        continue;
      }

      const highlighted =
        this.highlighted.has(edge.from) && this.highlighted.has(edge.to);
      const edgeColor = edgeColors[edge.type] || "#1d2330";
      this.ctx.strokeStyle = highlighted ? edgeColor : `${edgeColor}40`;
      this.ctx.lineWidth = highlighted ? 2.2 / this.zoom : 0.8 / this.zoom;
      this.ctx.beginPath();
      this.ctx.moveTo(from.x, from.y);
      this.ctx.lineTo(to.x, to.y);
      this.ctx.stroke();
    }

    for (const node of this.nodes) {
      // Node size based on degree (incoming + outgoing edges)
      const radius = Math.max(5, Math.min(15, 5 + (node.degree || 0) * 0.3));
      const fill = this.palette[node.type] || "#607d8b";
      const highlighted =
        this.highlighted.size === 0 || this.highlighted.has(node.id);

      this.ctx.globalAlpha = highlighted ? 1 : 0.25;
      this.ctx.fillStyle = fill;
      this.ctx.beginPath();
      this.ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
      this.ctx.fill();

      if (this.selectedNode === node.id) {
        this.ctx.strokeStyle = "#111";
        this.ctx.lineWidth = 2.5 / this.zoom;
        this.ctx.stroke();
      }

      if (this.zoom > 0.6) {
        this.ctx.fillStyle = "#1d2330";
        this.ctx.font = `${12 / this.zoom}px "IBM Plex Sans", sans-serif`;
        this.ctx.textAlign = "center";
        this.ctx.fillText(node.name, node.x, node.y + 18 / this.zoom);
      }
    }

    this.ctx.restore();
    this.ctx.globalAlpha = 1;
  }

  onMouseDown(event) {
    const point = this.toGraphPoint(event);
    this.dragNodeId = this.getNodeAtPoint(point);
    this.dragging = true;
    this.lastMouse = { x: event.clientX, y: event.clientY };

    if (this.dragNodeId) {
      this.selectNode(this.dragNodeId);
    }
  }

  onMouseMove(event) {
    if (!this.dragging || !this.lastMouse) {
      return;
    }

    const dx = event.clientX - this.lastMouse.x;
    const dy = event.clientY - this.lastMouse.y;
    this.lastMouse = { x: event.clientX, y: event.clientY };

    if (this.dragNodeId) {
      const node = this.nodeMap.get(this.dragNodeId);
      if (node) {
        node.x += dx / this.zoom;
        node.y += dy / this.zoom;
      }
    } else {
      this.offsetX += dx;
      this.offsetY += dy;
    }
  }

  onMouseUp() {
    this.dragging = false;
    this.dragNodeId = null;
    this.lastMouse = null;
  }

  onWheel(event) {
    event.preventDefault();
    const factor = event.deltaY > 0 ? 1 / 1.1 : 1.1;
    this.zoomBy(factor, event);
  }

  zoomBy(factor, event = null) {
    const rect = this.canvas.getBoundingClientRect();
    const originX = event ? event.clientX - rect.left : rect.width / 2;
    const originY = event ? event.clientY - rect.top : rect.height / 2;
    this.offsetX = originX - (originX - this.offsetX) * factor;
    this.offsetY = originY - (originY - this.offsetY) * factor;
    this.zoom = Math.max(0.25, Math.min(2.5, this.zoom * factor));
  }

  reset() {
    this.offsetX = 0;
    this.offsetY = 0;
    this.zoom = 1;
    this.highlighted.clear();
    this.selectedNode = null;
    document.getElementById("nodeTitle").textContent = "Select a node";
    document.getElementById("nodeDetails").innerHTML = "";
    document.getElementById("nodeRelations").innerHTML = "";
  }

  toGraphPoint(event) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left - this.offsetX) / this.zoom,
      y: (event.clientY - rect.top - this.offsetY) / this.zoom,
    };
  }

  getNodeAtPoint(point) {
    for (const node of this.nodes) {
      if (Math.hypot(node.x - point.x, node.y - point.y) <= 12 / this.zoom) {
        return node.id;
      }
    }
    return null;
  }

  async selectNode(nodeId) {
    const response = await fetch(`/api/node/${encodeURIComponent(nodeId)}`);
    if (!response.ok) {
      return;
    }

    const node = await response.json();
    this.selectedNode = node.id;
    this.highlighted = new Set([
      node.id,
      ...node.outgoing.map((edge) => edge.to),
      ...node.incoming.map((edge) => edge.from),
    ]);

    document.getElementById("nodeTitle").textContent =
      `${node.name} (${node.type})`;
    document.getElementById("nodeDetails").innerHTML = [
      this.detailRow("Full name", node.fullName || "not found"),
      this.detailRow("Summary", node.summary || "unknown"),
      this.detailRow(
        "Source",
        node.location
          ? `${node.location.file}:${node.location.startLine}`
          : "not found",
      ),
      this.detailRow("Provenance", node.provenance?.type || "unknown"),
    ].join("");

    const relations = [
      ...node.outgoing
        .slice(0, 8)
        .map((edge) =>
          this.relationRow(edge.type, edge.target?.name || edge.to, "outgoing"),
        ),
      ...node.incoming
        .slice(0, 8)
        .map((edge) =>
          this.relationRow(
            edge.type,
            edge.source?.name || edge.from,
            "incoming",
          ),
        ),
    ];
    document.getElementById("nodeRelations").innerHTML =
      relations.join("") || '<div class="relation-row">No related nodes</div>';
  }

  detailRow(label, value) {
    return `<div class="detail-row"><strong>${label}</strong><div>${this.escapeHtml(String(value))}</div></div>`;
  }

  relationRow(type, name, direction) {
    return `<div class="relation-row"><strong>${this.escapeHtml(direction)} ${this.escapeHtml(type)}</strong><div>${this.escapeHtml(name)}</div></div>`;
  }

  renderLegend() {
    const legend = document.getElementById("legend");

    const nodeTypes = Object.entries(this.palette)
      .map(
        ([type, color]) =>
          `<div class="legend-row"><span>${type}</span><span class="swatch" style="background:${color}"></span></div>`,
      )
      .join("");

    const edgeTypes = [
      "IMPORTS",
      "EXPORTS",
      "CALLS",
      "CALLS_UNRESOLVED",
      "OWNS",
      "DEFINES",
      "USES",
      "DEPENDS_ON",
      "TESTS",
      "DOCUMENTS",
      "IMPLEMENTS",
      "EXTENDS",
      "DECORATES",
      "REFERENCES",
      "ENTRY_POINT",
    ];

    const edgeColors = {
      IMPORTS: "#1565c0",
      EXPORTS: "#d32f2f",
      CALLS: "#2e7d32",
      CALLS_UNRESOLVED: "#f57f17",
      OWNS: "#6d4c41",
      DEFINES: "#1976d2",
      USES: "#7e57c2",
      DEPENDS_ON: "#c62828",
      TESTS: "#8e24aa",
      DOCUMENTS: "#546e7a",
      IMPLEMENTS: "#00897b",
      EXTENDS: "#e64a19",
      DECORATES: "#5e35b1",
      REFERENCES: "#0097a7",
      ENTRY_POINT: "#f57f17",
    };

    const edgeRows = edgeTypes
      .map(
        (type) =>
          `<div class="legend-row"><span>${type}</span><span class="swatch" style="background:${edgeColors[type] || "#000"}"></span></div>`,
      )
      .join("");

    legend.innerHTML = `
      <div style="border-bottom: 1px solid #ccc; padding-bottom: 8px; margin-bottom: 8px;">
        <strong>Node Types</strong>
        ${nodeTypes}
      </div>
      <div>
        <strong>Edge Types</strong>
        ${edgeRows}
      </div>
    `;
  }

  updateStats(stats) {
    const container = document.getElementById("stats");
    const rows = [
      ["Nodes", stats.nodeCount],
      ["Edges", stats.edgeCount],
      ...Object.entries(stats.nodesByType).slice(0, 8),
    ];
    container.innerHTML = rows
      .map(
        ([label, value]) =>
          `<div class="stats-row"><span>${this.escapeHtml(String(label))}</span><strong>${this.escapeHtml(String(value))}</strong></div>`,
      )
      .join("");
  }

  async search() {
    const query = document.getElementById("searchInput").value.trim();
    if (!query) {
      return;
    }

    const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    const results = await response.json();
    const container = document.getElementById("searchResults");
    container.innerHTML = results
      .slice(0, 12)
      .map(
        (result) => `
          <div class="search-result" data-node-id="${this.escapeHtml(result.id)}">
            <strong>${this.escapeHtml(result.name)}</strong>
            <span>${this.escapeHtml(result.type)} · ${this.escapeHtml(result.fullName || "unknown")}</span>
          </div>
        `,
      )
      .join("");

    for (const element of container.querySelectorAll(".search-result")) {
      element.addEventListener("click", () => {
        this.selectNode(element.dataset.nodeId);
      });
    }

    if (results[0]) {
      this.focusOnNode(results[0].id);
      this.selectNode(results[0].id);
    }
  }

  focusOnNode(nodeId) {
    const node = this.nodeMap.get(nodeId);
    if (!node) {
      return;
    }

    const rect = this.canvas.getBoundingClientRect();
    this.offsetX = rect.width / 2 - node.x * this.zoom;
    this.offsetY = rect.height / 2 - node.y * this.zoom;
  }

  escapeHtml(value) {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}

window.addEventListener("DOMContentLoaded", () => {
  const visualizer = new GraphVisualizer("graphCanvas");
  visualizer.loadGraph().catch((error) => {
    console.error("Failed to load graph", error);
  });
});
