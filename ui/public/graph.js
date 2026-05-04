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
    // Visual layering state
    this.hoverNode = null;
    this.communities = [];
    this.communityMap = new Map();
    this.nodeImportance = new Map();
    this.tooltip = null;
    this.edgeTypePriority = {
      IMPORTS: 1.0, EXTENDS: 1.0, IMPLEMENTS: 0.9, DEPENDS_ON: 0.8,
      ENTRY_POINT: 0.8, EXPORTS: 0.6, CALLS: 0.5, DEFINES: 0.4,
      TESTS: 0.4, USES: 0.3, REFERENCES: 0.3, DECORATES: 0.3,
      OWNS: 0.2, CALLS_UNRESOLVED: 0.15, DOCUMENTS: 0.15,
    };
    this.communityColors = [
      [21,101,192], [46,125,50], [239,108,0], [142,36,170], [198,40,40],
      [0,137,123], [109,76,65], [94,53,177], [3,155,229], [244,81,30],
    ];
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
    this.tooltip = document.getElementById("graphTooltip");
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

    // Double-click to zoom into node neighborhood
    this.canvas.addEventListener("dblclick", (event) => {
      const point = this.toGraphPoint(event);
      const nodeId = this.getNodeAtPoint(point);
      if (nodeId) {
        this.selectNode(nodeId);
        this.focusOnNode(nodeId);
        this.zoom = Math.min(4.0, this.zoom * 2.5);
        this.focusOnNode(nodeId); // re-center after zoom
        this.render();
      }
    });

    // Keyboard shortcuts
    document.addEventListener("keydown", (event) => {
      // Don't trigger when typing in inputs
      if (event.target.tagName === "INPUT" || event.target.tagName === "TEXTAREA") return;

      switch (event.key) {
        case "Escape":
          this.deselectNode();
          break;
        case "f":
        case "F":
          this.fitToView();
          break;
        case "+":
        case "=":
          this.zoomBy(1.3);
          this.render();
          break;
        case "-":
        case "_":
          this.zoomBy(1 / 1.3);
          this.render();
          break;
      }
    });
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
    
    // Scale initial spread based on node count for better separation
    const nodeCount = data.nodes.length;
    const initialSpread = Math.max(600, Math.sqrt(nodeCount) * 40);
    
    this.nodes = data.nodes.map((node) => ({
      ...node,
      x: cx + (Math.random() - 0.5) * initialSpread,
      y: cy + (Math.random() - 0.5) * initialSpread,
      vx: 0,
      vy: 0,
      visible: true,
    }));
    
    this.edges = data.edges.map((edge) => ({
      ...edge,
      visible: true,
    }));
    
    this.nodeMap = new Map(this.nodes.map((node) => [node.id, node]));
    this.updateStats(data.stats);
    
    // Store community data for hull rendering
    if (data.analytics && data.analytics.communities) {
      this.communities = data.analytics.communities;
      this.communityMap.clear();
      this.communities.forEach((community, idx) => {
        (community.nodeIds || []).forEach(nodeId => {
          this.communityMap.set(nodeId, idx);
        });
      });
    }
    
    // Compute per-node importance for label priority and glow halos
    this.nodeImportance.clear();
    const maxDegree = Math.max(1, ...this.nodes.map(n => n.degree || 0));
    for (const node of this.nodes) {
      const degreeFactor = (node.degree || 0) / maxDegree;
      const rankFactor = node.rank ? node.rank.score : 0;
      const typeFactor = ['project', 'file', 'module'].includes(node.type) ? 0.15 : 0;
      this.nodeImportance.set(node.id, Math.min(1, degreeFactor * 0.4 + rankFactor * 0.45 + typeFactor));
    }
    
    // Scale forces dynamically based on graph size for readability
    const scaleFactor = Math.min(Math.max(nodeCount / 200, 1), 8);
    const chargeStrength = -200 * scaleFactor;
    const linkDistance = Math.min(80 + scaleFactor * 40, 400);
    const linkStrength = Math.max(0.3 / scaleFactor, 0.04);
    const collisionRadius = Math.min(28 + scaleFactor * 7, 80);
    const centerStrength = Math.max(0.05 / scaleFactor, 0.005);
    
    // Type-clustering: push same-type nodes toward radial sectors
    const typeClusterRadius = initialSpread * 0.25;
    const typeTargets = {
      project: { x: cx, y: cy },
      file:     { x: cx - typeClusterRadius * 0.7, y: cy - typeClusterRadius * 0.7 },
      module:   { x: cx + typeClusterRadius * 0.7, y: cy - typeClusterRadius * 0.7 },
      class:    { x: cx - typeClusterRadius * 0.8, y: cy + typeClusterRadius * 0.5 },
      function: { x: cx + typeClusterRadius * 0.6, y: cy + typeClusterRadius * 0.2 },
      method:   { x: cx + typeClusterRadius * 0.3, y: cy + typeClusterRadius * 0.7 },
      route:    { x: cx + typeClusterRadius * 0.8, y: cy + typeClusterRadius * 0.6 },
      test:     { x: cx - typeClusterRadius * 0.5, y: cy + typeClusterRadius * 0.8 },
    };
    
    // Create D3 force simulation with spread-optimised forces
    this.simulation = d3.forceSimulation(this.nodes)
      .force('link', d3.forceLink(this.edges)
        .id(d => d.id)
        .distance(linkDistance)
        .strength(linkStrength))
      .force('charge', d3.forceManyBody()
        .strength(chargeStrength)
        .distanceMax(linkDistance * 8))
      .force('center', d3.forceCenter(cx, cy).strength(centerStrength))
      .force('collision', d3.forceCollide(collisionRadius))
      .force('typeX', d3.forceX(d => (typeTargets[d.type] || { x: cx }).x).strength(0.012))
      .force('typeY', d3.forceY(d => (typeTargets[d.type] || { y: cy }).y).strength(0.012))
      .alphaDecay(0.02)
      .velocityDecay(0.3)
      .stop();
    
    // More pre-run ticks for larger graphs to let them settle
    const preTicks = Math.min(150 + nodeCount, 500);
    for (let i = 0; i < preTicks; i++) this.simulation.tick();
    
    // Fit camera to show the full graph after initial settle
    this.fitToView();
    
    // Then animate remaining ticks, and auto-fit when done
    this.simulation.on('tick', () => this.draw());
    this.simulation.on('end', () => this.fitToView());
    this.simulation.restart();
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
    const ctx = this.ctx;

    // ── 1. Community hull backgrounds ──
    this.drawCommunityHulls(ctx);

    // ── 2. Edges: curved Bézier with type-priority opacity + direction arrows ──
    const edgeColors = {
      IMPORTS: "#1565c0", EXPORTS: "#d32f2f", CALLS: "#2e7d32",
      CALLS_UNRESOLVED: "#f57f17", OWNS: "#6d4c41", DEFINES: "#1976d2",
      USES: "#7e57c2", DEPENDS_ON: "#c62828", TESTS: "#8e24aa",
      DOCUMENTS: "#546e7a", IMPLEMENTS: "#00897b", EXTENDS: "#e64a19",
      DECORATES: "#5e35b1", REFERENCES: "#0097a7", ENTRY_POINT: "#f57f17",
    };

    // Viewport culling bounds (in graph coordinates)
    const rect = this.canvas.getBoundingClientRect();
    const vpMargin = 100 / this.zoom; // extra margin so edges don't pop in/out
    const vpLeft = -this.offsetX / this.zoom - vpMargin;
    const vpTop = -this.offsetY / this.zoom - vpMargin;
    const vpRight = vpLeft + rect.width / this.zoom + vpMargin * 2;
    const vpBottom = vpTop + rect.height / this.zoom + vpMargin * 2;

    const isInViewport = (x, y) =>
      x >= vpLeft && x <= vpRight && y >= vpTop && y <= vpBottom;

    const pathEdgeSet = new Set();
    if (this.pathHighlight.length > 1) {
      for (let i = 0; i < this.pathHighlight.length - 1; i++) {
        pathEdgeSet.add(`${this.pathHighlight[i]}-${this.pathHighlight[i + 1]}`);
      }
    }

    for (const edge of this.edges) {
      if (edge.visible === false) continue;
      const from = this.nodeMap.get(edge.from);
      const to = this.nodeMap.get(edge.to);
      if (!from || !to || from.visible === false || to.visible === false) continue;

      // Viewport culling: skip if both endpoints are outside view
      if (!isInViewport(from.x, from.y) && !isInViewport(to.x, to.y)) continue;

      const isPathEdge = pathEdgeSet.has(`${edge.from}-${edge.to}`);
      const isConnected = this.highlighted.has(edge.from) && this.highlighted.has(edge.to);
      const hasSelection = this.highlighted.size > 0;
      const edgeColor = edgeColors[edge.type] || "#1d2330";
      const typePriority = this.edgeTypePriority[edge.type] || 0.2;

      // When a node is selected, completely hide non-connected edges
      if (hasSelection && !isConnected && !isPathEdge) {
        continue;
      }

      let showArrow = false;
      if (isPathEdge) {
        ctx.strokeStyle = "#ff9800";
        ctx.lineWidth = 3 / this.zoom;
        ctx.globalAlpha = 1;
        showArrow = true;
      } else if (isConnected && hasSelection) {
        ctx.strokeStyle = edgeColor;
        ctx.lineWidth = 2.2 / this.zoom;
        ctx.globalAlpha = 0.9;
        showArrow = true;
      } else {
        ctx.strokeStyle = edgeColor;
        ctx.lineWidth = 0.5 / this.zoom;
        ctx.globalAlpha = 0.04 + typePriority * 0.06;
      }

      // Draw curved edge
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const curvature = Math.min(len * 0.12, 35);
      const mx = (from.x + to.x) / 2;
      const my = (from.y + to.y) / 2;
      const cpx = mx + (-dy / len) * curvature;
      const cpy = my + (dx / len) * curvature;

      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.quadraticCurveTo(cpx, cpy, to.x, to.y);
      ctx.stroke();

      // Direction arrowhead (only for highlighted/path edges to avoid clutter)
      if (showArrow && len > 40) {
        const t = 0.72; // position along curve
        const t1 = 1 - t;
        const ax = t1 * t1 * from.x + 2 * t1 * t * cpx + t * t * to.x;
        const ay = t1 * t1 * from.y + 2 * t1 * t * cpy + t * t * to.y;
        // Tangent at t
        const tdx = 2 * t1 * (cpx - from.x) + 2 * t * (to.x - cpx);
        const tdy = 2 * t1 * (cpy - from.y) + 2 * t * (to.y - cpy);
        const tlen = Math.sqrt(tdx * tdx + tdy * tdy) || 1;
        const arrowSize = Math.min(8, 5 / this.zoom);
        const ux = tdx / tlen;
        const uy = tdy / tlen;

        ctx.fillStyle = ctx.strokeStyle;
        ctx.beginPath();
        ctx.moveTo(ax + ux * arrowSize, ay + uy * arrowSize);
        ctx.lineTo(ax - ux * arrowSize * 0.4 + uy * arrowSize * 0.5, ay - uy * arrowSize * 0.4 - ux * arrowSize * 0.5);
        ctx.lineTo(ax - ux * arrowSize * 0.4 - uy * arrowSize * 0.5, ay - uy * arrowSize * 0.4 + ux * arrowSize * 0.5);
        ctx.closePath();
        ctx.fill();
      }
    }

    // ── 3. Nodes: glow halos + expanded sizes ──
    const pathNodeSet = new Set(this.pathHighlight);
    const visibleNodes = [];

    for (const node of this.nodes) {
      if (node.visible === false) continue;
      // Viewport culling: skip nodes outside view (but always keep highlighted/path nodes)
      if (!isInViewport(node.x, node.y) && !this.highlighted.has(node.id) && !pathNodeSet.has(node.id)) continue;
      visibleNodes.push(node);

      const importance = this.nodeImportance.get(node.id) || 0;
      const radius = this.getNodeRadius(node);
      const fill = this.palette[node.type] || "#607d8b";
      const isConnected = this.highlighted.size === 0 || this.highlighted.has(node.id);
      const hasSelection = this.highlighted.size > 0;
      const isPathNode = pathNodeSet.has(node.id);
      const isHovered = this.hoverNode === node.id;
      const greyedOut = hasSelection && !isConnected && !isPathNode;

      ctx.globalAlpha = greyedOut ? 0.12 : 1;

      // Glow halo for important nodes (top ~20%) — only when visible
      if (importance > 0.25 && isConnected && !greyedOut) {
        const glowRadius = radius * 3.5;
        const gradient = ctx.createRadialGradient(node.x, node.y, radius * 0.5, node.x, node.y, glowRadius);
        gradient.addColorStop(0, fill + "30");
        gradient.addColorStop(1, fill + "00");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(node.x, node.y, glowRadius, 0, Math.PI * 2);
        ctx.fill();
      }

      // Node circle — grey for non-connected, colored for connected
      ctx.fillStyle = greyedOut ? "#3a3a3a" : (isPathNode ? "#ff9800" : fill);
      ctx.beginPath();
      ctx.arc(node.x, node.y, greyedOut ? Math.max(2, radius * 0.6) : radius, 0, Math.PI * 2);
      ctx.fill();

      // Selection / path / hover ring
      if (!greyedOut && (this.selectedNode === node.id || isPathNode || isHovered)) {
        ctx.strokeStyle = isPathNode ? "#ff5722" : isHovered ? "#58a6ff" : "#ffffff";
        ctx.lineWidth = (isHovered ? 2 : 2.5) / this.zoom;
        ctx.stroke();
      }

      // Structural node type ring (file, class, module get a subtle border)
      if (!greyedOut && !isPathNode && !isHovered && this.selectedNode !== node.id &&
          ['file', 'class', 'module', 'project'].includes(node.type)) {
        ctx.strokeStyle = fill + "60";
        ctx.lineWidth = 1 / this.zoom;
        ctx.stroke();
      }
    }

    // ── 4. Collision-aware labels ──
    this.drawLabels(ctx, visibleNodes, pathNodeSet);

    ctx.restore();
    ctx.globalAlpha = 1;

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
    } else {
      this.isPanning = false;
    }
  }

  onMouseMove(event) {
    // Hover detection (always active)
    const point = this.toGraphPoint(event);
    const hoveredId = this.getNodeAtPoint(point);
    if (hoveredId !== this.hoverNode) {
      this.hoverNode = hoveredId;
      if (hoveredId) {
        this.showTooltip(hoveredId, event);
      } else {
        this.hideTooltip();
      }
      if (!this.dragging) this.render();
    } else if (hoveredId && this.tooltip) {
      // Update tooltip position as mouse moves
      const rect = this.canvas.getBoundingClientRect();
      this.tooltip.style.left = (event.clientX - rect.left) + "px";
      this.tooltip.style.top = (event.clientY - rect.top) + "px";
    }

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
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
        this.isPanning = true;
      }
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
    } else if (this.dragging && !this.isPanning && this.selectedNode) {
      // Clicked empty space without panning — deselect
      this.deselectNode();
    }
    
    this.dragging = false;
    this.isPanning = false;
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
    this.zoom = Math.max(0.02, Math.min(4.0, this.zoom * factor));
  }

  reset() {
    this.offsetX = 0;
    this.offsetY = 0;
    this.zoom = 1;
    this.highlighted.clear();
    this.selectedNode = null;
    this.hoverNode = null;
    this.hideTooltip();
    document.getElementById("nodeTitle").textContent = "Select a node";
    document.getElementById("nodeDetails").innerHTML = "";
    document.getElementById("nodeRelations").innerHTML = "";
    this.render();
  }

  deselectNode() {
    this.highlighted.clear();
    this.selectedNode = null;
    this.hoverNode = null;
    this.hideTooltip();
    document.getElementById("nodeTitle").textContent = "Select a node";
    document.getElementById("nodeDetails").innerHTML = "";
    document.getElementById("nodeRelations").innerHTML = "";
    const codeSection = document.getElementById("codeViewerSection");
    if (codeSection) codeSection.style.display = "none";
    this.render();
  }

  resetLayout() {
    if (this.simulation) {
      this.simulation.alpha(1).restart();
      // After the simulation settles, fit the view to the graph
      this.simulation.on('end', () => {
        this.fitToView();
      });
    }
  }

  fitToView() {
    const bounds = this.getGraphBounds();
    const rect = this.canvas.getBoundingClientRect();
    const graphWidth = bounds.maxX - bounds.minX || 1;
    const graphHeight = bounds.maxY - bounds.minY || 1;
    const padding = 60;
    
    const scaleX = (rect.width - padding * 2) / graphWidth;
    const scaleY = (rect.height - padding * 2) / graphHeight;
    this.zoom = Math.max(0.05, Math.min(1.5, Math.min(scaleX, scaleY)));
    
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;
    this.offsetX = rect.width / 2 - centerX * this.zoom;
    this.offsetY = rect.height / 2 - centerY * this.zoom;
    this.render();
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
      if (node.visible === false) continue;
      const radius = this.getNodeRadius(node);
      const hitRadius = Math.max(radius, 8) + 4;
      if (Math.hypot(node.x - point.x, node.y - point.y) <= hitRadius) {
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

    // Fetch and display source code
    await this.loadSourceCode(nodeId);
  }

  async loadSourceCode(nodeId) {
    const codeViewerSection = document.getElementById("codeViewerSection");
    const codeContent = document.getElementById("codeContent");
    const toggleBtn = document.getElementById("toggleCodeBtn");

    try {
      const response = await fetch(`/api/node/${encodeURIComponent(nodeId)}/code`);
      
      if (!response.ok) {
        // No code available, hide the section
        codeViewerSection.style.display = "none";
        return;
      }

      const data = await response.json();
      
      // Show the code viewer section
      codeViewerSection.style.display = "block";
      
      // Set the code content
      codeContent.textContent = data.code;
      codeContent.className = `language-${data.language}`;
      
      // Apply syntax highlighting if hljs is available
      if (window.hljs) {
        window.hljs.highlightElement(codeContent);
      }

      // Setup toggle button
      let isCodeVisible = true;
      const codeViewer = document.getElementById("codeViewer");
      
      toggleBtn.onclick = () => {
        isCodeVisible = !isCodeVisible;
        codeViewer.style.display = isCodeVisible ? "block" : "none";
        toggleBtn.textContent = isCodeVisible ? "Hide Code" : "Show Code";
      };
      
      // Reset to visible state
      codeViewer.style.display = "block";
      toggleBtn.textContent = "Hide Code";

    } catch (error) {
      console.error("Failed to load source code:", error);
      codeViewerSection.style.display = "none";
    }
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
  // ── Helper: node radius based on degree + importance ──
  getNodeRadius(node) {
    const degree = node.degree || 0;
    const importance = this.nodeImportance.get(node.id) || 0;
    const base = 3 + Math.sqrt(degree) * 1.8;
    const importanceBoost = importance * 6;
    return Math.max(3, Math.min(22, base + importanceBoost));
  }

  // ── Helper: draw community hull backgrounds ──
  drawCommunityHulls(ctx) {
    if (!this.communities || this.communities.length === 0) return;

    for (let i = 0; i < Math.min(this.communities.length, 20); i++) {
      const community = this.communities[i];
      if (!community.nodeIds || community.nodeIds.length < 3) continue;

      const points = [];
      for (const nodeId of community.nodeIds) {
        const node = this.nodeMap.get(nodeId);
        if (node && node.visible !== false) {
          points.push({ x: node.x, y: node.y });
        }
      }
      if (points.length < 3) continue;

      const hull = this.computeConvexHull(points);
      if (hull.length < 3) continue;

      const rgb = this.communityColors[i % this.communityColors.length];
      const padding = 30;

      // Expand hull outward by padding
      const cx = hull.reduce((s, p) => s + p.x, 0) / hull.length;
      const cy = hull.reduce((s, p) => s + p.y, 0) / hull.length;
      const expanded = hull.map(p => {
        const dx = p.x - cx;
        const dy = p.y - cy;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        return { x: p.x + (dx / len) * padding, y: p.y + (dy / len) * padding };
      });

      ctx.globalAlpha = 1;
      ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.035)`;
      ctx.strokeStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.08)`;
      ctx.lineWidth = 1.5 / this.zoom;

      ctx.beginPath();
      ctx.moveTo(expanded[0].x, expanded[0].y);
      for (let j = 1; j < expanded.length; j++) {
        ctx.lineTo(expanded[j].x, expanded[j].y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Community label at centroid
      if (community.label) {
        const label = community.label.split('/').pop() || community.label;
        const labelSize = Math.max(12, Math.min(28, 18 / this.zoom));
        ctx.font = `600 ${labelSize}px "IBM Plex Sans", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.globalAlpha = 0.09;
        ctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
        ctx.fillText(label, cx, cy);
      }
    }
  }

  // ── Helper: Graham scan convex hull ──
  computeConvexHull(points) {
    if (points.length < 3) return points.slice();
    let pivot = points[0];
    for (const p of points) {
      if (p.y < pivot.y || (p.y === pivot.y && p.x < pivot.x)) pivot = p;
    }
    const sorted = points.filter(p => p !== pivot).sort((a, b) => {
      const angleA = Math.atan2(a.y - pivot.y, a.x - pivot.x);
      const angleB = Math.atan2(b.y - pivot.y, b.x - pivot.x);
      return angleA - angleB || Math.hypot(a.x - pivot.x, a.y - pivot.y) - Math.hypot(b.x - pivot.x, b.y - pivot.y);
    });
    const hull = [pivot];
    for (const p of sorted) {
      while (hull.length >= 2) {
        const a = hull[hull.length - 2];
        const b = hull[hull.length - 1];
        const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
        if (cross <= 0) hull.pop();
        else break;
      }
      hull.push(p);
    }
    return hull;
  }

  // ── Helper: collision-aware label rendering ──
  drawLabels(ctx, visibleNodes, pathNodeSet) {
    const fontSize = Math.max(8, Math.min(14, 12 / this.zoom));
    ctx.font = `${fontSize}px "IBM Plex Sans", sans-serif`;
    ctx.textAlign = "center";

    // Score and sort nodes for label priority
    const scored = visibleNodes.map(node => {
      let score = 0;
      if (this.selectedNode === node.id) score += 1000;
      if (pathNodeSet.has(node.id)) score += 500;
      if (this.hoverNode === node.id) score += 800;
      if (this.highlighted.has(node.id) && this.highlighted.size > 0) score += 100;
      score += (this.nodeImportance.get(node.id) || 0) * 50;
      score += Math.min(20, (node.degree || 0) * 0.5);
      return { node, score };
    }).sort((a, b) => b.score - a.score);

    // Limit labels to avoid perf issues on huge graphs
    const maxLabels = Math.min(scored.length, 300);
    const placed = []; // bounding boxes of placed labels

    for (let i = 0; i < scored.length && placed.length < maxLabels; i++) {
      const { node, score } = scored[i];
      const hasSelection = this.highlighted.size > 0;
      const isConnected = this.highlighted.has(node.id);

      // When a node is selected, only label connected nodes
      if (hasSelection && !isConnected && !pathNodeSet.has(node.id)) continue;

      // Skip very low priority unless zoomed in (only when no selection)
      if (!hasSelection && score < 5 && this.zoom < 0.5) continue;

      const radius = this.getNodeRadius(node);
      const labelWidth = ctx.measureText(node.name).width;
      const labelHeight = fontSize * 1.2;
      const lx = node.x - labelWidth / 2;
      const ly = node.y + radius + fontSize * 0.4;

      // Check for overlap with placed labels
      let overlaps = false;
      for (const box of placed) {
        if (lx < box.x + box.w + 4 && lx + labelWidth + 4 > box.x &&
            ly < box.y + box.h + 2 && ly + labelHeight + 2 > box.y) {
          overlaps = true;
          break;
        }
      }

      if (!overlaps) {
        ctx.globalAlpha = (hasSelection && isConnected) ? 1 : 0.9;

        // Background pill for readability
        ctx.fillStyle = "rgba(244, 241, 234, 0.7)";
        const pillPadX = 3;
        const pillPadY = 1;
        const pillRadius = 3;
        const px = lx - pillPadX;
        const py = ly - labelHeight + pillPadY;
        const pw = labelWidth + pillPadX * 2;
        const ph = labelHeight + pillPadY;
        ctx.beginPath();
        ctx.moveTo(px + pillRadius, py);
        ctx.lineTo(px + pw - pillRadius, py);
        ctx.arcTo(px + pw, py, px + pw, py + pillRadius, pillRadius);
        ctx.lineTo(px + pw, py + ph - pillRadius);
        ctx.arcTo(px + pw, py + ph, px + pw - pillRadius, py + ph, pillRadius);
        ctx.lineTo(px + pillRadius, py + ph);
        ctx.arcTo(px, py + ph, px, py + ph - pillRadius, pillRadius);
        ctx.lineTo(px, py + pillRadius);
        ctx.arcTo(px, py, px + pillRadius, py, pillRadius);
        ctx.closePath();
        ctx.fill();

        // Label text
        ctx.fillStyle = "#1d2330";
        ctx.fillText(node.name, node.x, ly);

        placed.push({ x: lx, y: ly - labelHeight, w: labelWidth, h: labelHeight });
      }
    }
  }

  // ── Helper: show hover tooltip ──
  showTooltip(nodeId, event) {
    if (!this.tooltip) return;
    const node = this.nodeMap.get(nodeId);
    if (!node) return;

    const degree = node.degree || 0;
    this.tooltip.innerHTML = `<span class="tt-name">${this.escapeHtml(node.name)}</span><span class="tt-type">${this.escapeHtml(node.type)}</span><div class="tt-degree">${degree} connections</div>`;

    const rect = this.canvas.getBoundingClientRect();
    this.tooltip.style.left = (event.clientX - rect.left) + "px";
    this.tooltip.style.top = (event.clientY - rect.top) + "px";
    this.tooltip.classList.add("visible");
  }

  // ── Helper: hide hover tooltip ──
  hideTooltip() {
    if (!this.tooltip) return;
    this.tooltip.classList.remove("visible");
  }
}

window.addEventListener("DOMContentLoaded", () => {
  const visualizer = new GraphVisualizer("graphCanvas");
  visualizer.loadGraph().catch((error) => {
    console.error("Failed to load graph", error);
  });
});
