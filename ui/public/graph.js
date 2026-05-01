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
    this.simulation = null;
    this.pathHighlight = [];
    this.pathSourceNode = null;
    this.pathTargetNode = null;
    this.ws = null;
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
    this.setupWebSocket();
    this.renderLegend();
    this.setupMinimap();
  }

  setupMinimap() {
    this.minimapCanvas = document.getElementById("minimapCanvas");
    if (!this.minimapCanvas) return;
    
    this.minimapCtx = this.minimapCanvas.getContext("2d");
    this.minimapCanvas.width = 200;
    this.minimapCanvas.height = 150;
    
    this.minimapCanvas.addEventListener("click", (event) => {
      const rect = this.minimapCanvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      
      // Calculate graph bounds
      const bounds = this.getGraphBounds();
      const scaleX = this.minimapCanvas.width / (bounds.maxX - bounds.minX || 1);
      const scaleY = this.minimapCanvas.height / (bounds.maxY - bounds.minY || 1);
      
      // Convert minimap click to graph coordinates
      const graphX = bounds.minX + x / scaleX;
      const graphY = bounds.minY + y / scaleY;
      
      // Center view on clicked position
      const rect2 = this.canvas.getBoundingClientRect();
      this.offsetX = rect2.width / 2 - graphX * this.zoom;
      this.offsetY = rect2.height / 2 - graphY * this.zoom;
      this.render();
    });
  }

  setupWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    this.ws = new WebSocket(wsUrl);
    
    this.ws.onopen = () => {
      console.log('WebSocket connected');
    };
    
    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        this.handleWebSocketMessage(message);
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    };
    
    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
    
    this.ws.onclose = () => {
      console.log('WebSocket disconnected, reconnecting in 5s...');
      setTimeout(() => this.setupWebSocket(), 5000);
    };
  }

  handleWebSocketMessage(message) {
    switch (message.type) {
      case 'connected':
        console.log('WebSocket connection established');
        break;
      case 'graph_updated':
        console.log('Graph updated, reloading...');
        this.loadGraph();
        break;
      case 'node_added':
        this.handleNodeAdded(message.node);
        break;
      case 'node_updated':
        this.handleNodeUpdated(message.node);
        break;
      case 'edge_added':
        this.handleEdgeAdded(message.edge);
        break;
      default:
        console.log('Unknown message type:', message.type);
    }
  }

  handleNodeAdded(node) {
    const cx = this.canvas.width / (2 * window.devicePixelRatio);
    const cy = this.canvas.height / (2 * window.devicePixelRatio);
    
    const newNode = {
      ...node,
      x: cx + (Math.random() - 0.5) * 300,
      y: cy + (Math.random() - 0.5) * 300,
      vx: 0,
      vy: 0,
      visible: true,
    };
    
    this.nodes.push(newNode);
    this.nodeMap.set(newNode.id, newNode);
    
    if (this.simulation) {
      this.simulation.nodes(this.nodes);
      this.simulation.alpha(0.3).restart();
    }
  }

  handleNodeUpdated(node) {
    const existingNode = this.nodeMap.get(node.id);
    if (existingNode) {
      Object.assign(existingNode, node);
      this.render();
    }
  }

  handleEdgeAdded(edge) {
    this.edges.push({ ...edge, visible: true });
    
    if (this.simulation) {
      this.simulation.force('link').links(this.edges);
      this.simulation.alpha(0.3).restart();
    }
  }

  getGraphBounds() {
    if (this.nodes.length === 0) {
      return { minX: 0, maxX: 100, minY: 0, maxY: 100 };
    }
    
    const visibleNodes = this.nodes.filter(n => n.visible !== false);
    if (visibleNodes.length === 0) {
      return { minX: 0, maxX: 100, minY: 0, maxY: 100 };
    }
    
    const minX = Math.min(...visibleNodes.map(n => n.x));
    const maxX = Math.max(...visibleNodes.map(n => n.x));
    const minY = Math.min(...visibleNodes.map(n => n.y));
    const maxY = Math.max(...visibleNodes.map(n => n.y));
    
    return { minX, maxX, minY, maxY };
  }

  renderMinimap() {
    if (!this.minimapCanvas || !this.minimapCtx) return;
    
    const ctx = this.minimapCtx;
    ctx.clearRect(0, 0, this.minimapCanvas.width, this.minimapCanvas.height);
    
    // Draw background
    ctx.fillStyle = "#f5f5f5";
    ctx.fillRect(0, 0, this.minimapCanvas.width, this.minimapCanvas.height);
    
    const bounds = this.getGraphBounds();
    const scaleX = this.minimapCanvas.width / (bounds.maxX - bounds.minX || 1);
    const scaleY = this.minimapCanvas.height / (bounds.maxY - bounds.minY || 1);
    const scale = Math.min(scaleX, scaleY) * 0.9;
    
    const offsetX = (this.minimapCanvas.width - (bounds.maxX - bounds.minX) * scale) / 2;
    const offsetY = (this.minimapCanvas.height - (bounds.maxY - bounds.minY) * scale) / 2;
    
    // Draw nodes
    for (const node of this.nodes) {
      if (node.visible === false) continue;
      
      const x = (node.x - bounds.minX) * scale + offsetX;
      const y = (node.y - bounds.minY) * scale + offsetY;
      
      ctx.fillStyle = this.palette[node.type] || "#607d8b";
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Draw viewport rectangle
    const rect = this.canvas.getBoundingClientRect();
    const viewMinX = (-this.offsetX / this.zoom - bounds.minX) * scale + offsetX;
    const viewMinY = (-this.offsetY / this.zoom - bounds.minY) * scale + offsetY;
    const viewWidth = (rect.width / this.zoom) * scale;
    const viewHeight = (rect.height / this.zoom) * scale;
    
    ctx.strokeStyle = "#2196f3";
    ctx.lineWidth = 2;
    ctx.strokeRect(viewMinX, viewMinY, viewWidth, viewHeight);
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
    document
      .getElementById("resetLayoutBtn")
      .addEventListener("click", () => this.resetLayout());
    document
      .getElementById("applyFiltersBtn")
      .addEventListener("click", () => this.applyFilters());
    document
      .getElementById("findPathBtn")
      ?.addEventListener("click", () => this.findPath());
    document
      .getElementById("clearPathBtn")
      ?.addEventListener("click", () => this.clearPath());
  }

  applyFilters() {
    const filters = {
      nodes: {
        file: document.getElementById("filterFiles").checked,
        class: document.getElementById("filterClasses").checked,
        function: document.getElementById("filterFunctions").checked,
        method: document.getElementById("filterMethods").checked,
        route: document.getElementById("filterRoutes").checked,
        test: document.getElementById("filterTests").checked,
      },
      edges: {
        IMPORTS: document.getElementById("filterImports").checked,
        CALLS: document.getElementById("filterCalls").checked,
        EXTENDS: document.getElementById("filterExtends").checked,
      }
    };

    // Filter nodes
    this.nodes.forEach(node => {
      if (filters.nodes[node.type] !== undefined) {
        node.visible = filters.nodes[node.type];
      } else {
        node.visible = true; // Show types not in filter
      }
    });

    // Filter edges
    this.edges.forEach(edge => {
      if (filters.edges[edge.type] !== undefined) {
        edge.visible = filters.edges[edge.type];
      } else {
        edge.visible = true;
      }
      
      // Hide edge if either endpoint is hidden
      const sourceNode = this.nodeMap.get(edge.source.id || edge.source);
      const targetNode = this.nodeMap.get(edge.target.id || edge.target);
      if (sourceNode && !sourceNode.visible) edge.visible = false;
      if (targetNode && !targetNode.visible) edge.visible = false;
    });

    this.updateStats();
    this.render();
  }

  async loadGraph() {
    const response = await fetch("/api/graph");
    const data = await response.json();
    
    // Initialize nodes with random positions near center
    const cx = this.canvas.width / (2 * window.devicePixelRatio);
    const cy = this.canvas.height / (2 * window.devicePixelRatio);
    
    this.nodes = data.nodes.map((node) => ({
      ...node,
      x: cx + (Math.random() - 0.5) * 300,
      y: cy + (Math.random() - 0.5) * 300,
      vx: 0,
      vy: 0,
      visible: true, // Initialize all nodes as visible
    }));
    
    this.edges = data.edges.map((edge) => ({
      ...edge,
      visible: true, // Initialize all edges as visible
    }));
    
    this.nodeMap = new Map(this.nodes.map((node) => [node.id, node]));
    this.updateStats(data.stats);
    
    // Create D3 force simulation
    this.simulation = d3.forceSimulation(this.nodes)
      .force('link', d3.forceLink(this.edges)
        .id(d => d.id)
        .distance(80)
        .strength(0.3))
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(cx, cy).strength(0.05))
      .force('collision', d3.forceCollide(28))
      .alphaDecay(0.028)
      .stop();
    
    // Pre-run 150 ticks before first render
    for (let i = 0; i < 150; i++) this.simulation.tick();
    
    // Then animate remaining ticks
    this.simulation.on('tick', () => this.draw()).restart();
  }

  animate() {
    this.render();
    requestAnimationFrame(() => this.animate());
  }

  draw() {
    this.render();
  }

  updateLayout() {
    // Layout is now handled by D3 force simulation
    // This method is kept for compatibility but does nothing
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

    // Check if we have a path to highlight
    const pathEdgeSet = new Set();
    if (this.pathHighlight.length > 1) {
      for (let i = 0; i < this.pathHighlight.length - 1; i++) {
        const from = this.pathHighlight[i];
        const to = this.pathHighlight[i + 1];
        pathEdgeSet.add(`${from}-${to}`);
      }
    }

    for (const edge of this.edges) {
      // Skip if edge is not visible
      if (edge.visible === false) continue;
      
      const from = this.nodeMap.get(edge.from);
      const to = this.nodeMap.get(edge.to);
      if (!from || !to) {
        continue;
      }

      const isPathEdge = pathEdgeSet.has(`${edge.from}-${edge.to}`);
      const highlighted =
        this.highlighted.has(edge.from) && this.highlighted.has(edge.to);
      const edgeColor = edgeColors[edge.type] || "#1d2330";
      
      if (isPathEdge) {
        this.ctx.strokeStyle = "#ff9800";
        this.ctx.lineWidth = 3 / this.zoom;
      } else {
        this.ctx.strokeStyle = highlighted ? edgeColor : `${edgeColor}40`;
        this.ctx.lineWidth = highlighted ? 2.2 / this.zoom : 0.8 / this.zoom;
      }
      
      this.ctx.beginPath();
      this.ctx.moveTo(from.x, from.y);
      this.ctx.lineTo(to.x, to.y);
      this.ctx.stroke();
    }

    const pathNodeSet = new Set(this.pathHighlight);

    for (const node of this.nodes) {
      // Skip if node is not visible
      if (node.visible === false) continue;
      
      // Node size based on degree (incoming + outgoing edges)
      const radius = Math.max(5, Math.min(15, 5 + (node.degree || 0) * 0.3));
      const fill = this.palette[node.type] || "#607d8b";
      const highlighted =
        this.highlighted.size === 0 || this.highlighted.has(node.id);
      const isPathNode = pathNodeSet.has(node.id);

      this.ctx.globalAlpha = highlighted ? 1 : 0.25;
      
      if (isPathNode) {
        this.ctx.fillStyle = "#ff9800";
      } else {
        this.ctx.fillStyle = fill;
      }
      
      this.ctx.beginPath();
      this.ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
      this.ctx.fill();

      if (this.selectedNode === node.id || isPathNode) {
        this.ctx.strokeStyle = isPathNode ? "#ff5722" : "#111";
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
    
    // Render minimap
    this.renderMinimap();
  }

  onMouseDown(event) {
    const point = this.toGraphPoint(event);
    this.dragNodeId = this.getNodeAtPoint(point);
    this.dragging = true;
    this.lastMouse = { x: event.clientX, y: event.clientY };

    if (this.dragNodeId) {
      // Handle Shift+click for path selection
      if (event.shiftKey) {
        if (!this.pathSourceNode) {
          this.pathSourceNode = this.dragNodeId;
          const node = this.nodeMap.get(this.dragNodeId);
          const pathInfo = document.getElementById("pathInfo");
          if (pathInfo) {
            pathInfo.innerHTML = `<strong>Source:</strong> ${this.escapeHtml(node?.name || this.dragNodeId)}<br>Shift+click another node to set target`;
          }
          this.dragging = false;
          this.dragNodeId = null;
          return;
        } else if (!this.pathTargetNode) {
          this.pathTargetNode = this.dragNodeId;
          this.findPath();
          this.dragging = false;
          this.dragNodeId = null;
          return;
        }
      }
      
      this.selectNode(this.dragNodeId);
      const node = this.nodeMap.get(this.dragNodeId);
      if (node) {
        node.fx = node.x;
        node.fy = node.y;
      }
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
        node.fx = node.x + dx / this.zoom;
        node.fy = node.y + dy / this.zoom;
        if (this.simulation) {
          this.simulation.alpha(0.3).restart();
        }
      }
    } else {
      this.offsetX += dx;
      this.offsetY += dy;
    }
  }

  onMouseUp() {
    if (this.dragNodeId) {
      const node = this.nodeMap.get(this.dragNodeId);
      if (node) {
        node.fx = null;
        node.fy = null;
      }
    }
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

  resetLayout() {
    if (this.simulation) {
      this.simulation.alpha(1).restart();
    }
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
    
    // Count visible nodes and edges if filters are applied
    const visibleNodes = this.nodes.filter(n => n.visible !== false).length;
    const visibleEdges = this.edges.filter(e => e.visible !== false).length;
    
    const rows = [
      ["Nodes", visibleNodes],
      ["Edges", visibleEdges],
      ...Object.entries(stats.nodesByType || {}).slice(0, 8),
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

  async findPath() {
    if (!this.pathSourceNode || !this.pathTargetNode) {
      alert("Please select source and target nodes first by clicking on them while holding Shift");
      return;
    }

    try {
      const response = await fetch(`/api/path?from=${encodeURIComponent(this.pathSourceNode)}&to=${encodeURIComponent(this.pathTargetNode)}`);
      const data = await response.json();
      
      if (data.path && data.path.length > 0) {
        this.pathHighlight = data.path.map(n => n.id);
        this.render();
        
        // Show path info
        const pathInfo = document.getElementById("pathInfo");
        if (pathInfo) {
          pathInfo.innerHTML = `
            <strong>Path found:</strong> ${data.path.length} nodes, ${data.edges.length} edges<br>
            ${data.path.map(n => this.escapeHtml(n.name)).join(" → ")}
          `;
        }
      } else {
        alert("No path found between selected nodes");
      }
    } catch (error) {
      console.error("Path finding error:", error);
      alert("Error finding path");
    }
  }

  clearPath() {
    this.pathHighlight = [];
    this.pathSourceNode = null;
    this.pathTargetNode = null;
    this.render();
    
    const pathInfo = document.getElementById("pathInfo");
    if (pathInfo) {
      pathInfo.innerHTML = "";
    }
  }
}

window.addEventListener("DOMContentLoaded", () => {
  const visualizer = new GraphVisualizer("graphCanvas");
  visualizer.loadGraph().catch((error) => {
    console.error("Failed to load graph", error);
  });
});
