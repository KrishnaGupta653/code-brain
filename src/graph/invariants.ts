/**
 * Architecture Invariant Detector — Detect violations of architectural rules.
 * 
 * Enforces rules like:
 * - "UI layer must not import from database layer"
 * - "Core domain must not depend on infrastructure"
 * - "Public API must not expose internal types"
 * - "Test files must not be imported by production code"
 * 
 * This is a killer feature for maintaining clean architecture at scale.
 */

import { GraphModel } from './model.js';
import { GraphNode, GraphEdge } from '../types/models.js';
import { logger } from '../utils/index.js';

export interface ArchitectureRule {
  /** Rule ID (for tracking) */
  id: string;
  
  /** Human-readable description */
  description: string;
  
  /** Rule type */
  type: 'layer_dependency' | 'import_restriction' | 'naming_convention' | 'test_isolation' | 'custom';
  
  /** Severity level */
  severity: 'error' | 'warning' | 'info';
  
  /** Rule checker function */
  check: (graph: GraphModel) => Violation[];
}

export interface Violation {
  /** Rule that was violated */
  ruleId: string;
  
  /** Severity */
  severity: 'error' | 'warning' | 'info';
  
  /** Violating node */
  node: GraphNode;
  
  /** Related edge (if applicable) */
  edge?: GraphEdge;
  
  /** Related target node (if applicable) */
  target?: GraphNode;
  
  /** Explanation */
  message: string;
}

export interface InvariantReport {
  /** Total violations */
  totalViolations: number;
  
  /** Violations by severity */
  errors: Violation[];
  warnings: Violation[];
  info: Violation[];
  
  /** Violations by rule */
  byRule: Map<string, Violation[]>;
  
  /** Overall health score (0-100) */
  healthScore: number;
}

export class InvariantDetector {
  private rules: ArchitectureRule[] = [];

  constructor(private graph: GraphModel) {
    this.registerDefaultRules();
  }

  /**
   * Register a custom rule.
   */
  registerRule(rule: ArchitectureRule): void {
    this.rules.push(rule);
  }

  /**
   * Check all rules and generate report.
   */
  checkInvariants(): InvariantReport {
    logger.info(`Checking ${this.rules.length} architecture invariants...`);

    const allViolations: Violation[] = [];

    for (const rule of this.rules) {
      try {
        const violations = rule.check(this.graph);
        allViolations.push(...violations);
        logger.debug(`Rule ${rule.id}: ${violations.length} violations`);
      } catch (error) {
        logger.warn(`Rule ${rule.id} failed:`, error);
      }
    }

    // Group by severity
    const errors = allViolations.filter(v => v.severity === 'error');
    const warnings = allViolations.filter(v => v.severity === 'warning');
    const info = allViolations.filter(v => v.severity === 'info');

    // Group by rule
    const byRule = new Map<string, Violation[]>();
    for (const violation of allViolations) {
      const existing = byRule.get(violation.ruleId) || [];
      existing.push(violation);
      byRule.set(violation.ruleId, existing);
    }

    // Calculate health score
    const healthScore = this.calculateHealthScore(errors.length, warnings.length, info.length);

    logger.info(
      `Invariant check complete: ${errors.length} errors, ${warnings.length} warnings, ${info.length} info`
    );

    return {
      totalViolations: allViolations.length,
      errors,
      warnings,
      info,
      byRule,
      healthScore,
    };
  }

  /**
   * Calculate architecture health score (0-100).
   */
  private calculateHealthScore(errors: number, warnings: number, info: number): number {
    const totalNodes = this.graph.getNodes().length;
    if (totalNodes === 0) return 100;

    // Penalties
    const errorPenalty = errors * 10;
    const warningPenalty = warnings * 3;
    const infoPenalty = info * 1;

    const totalPenalty = errorPenalty + warningPenalty + infoPenalty;
    const penaltyPerNode = totalPenalty / totalNodes;

    // Score: 100 - penalty (capped at 0)
    return Math.max(0, Math.min(100, 100 - penaltyPerNode * 10));
  }

  /**
   * Register default architectural rules.
   */
  private registerDefaultRules(): void {
    // Rule 1: Test files must not be imported by production code
    this.registerRule({
      id: 'test-isolation',
      description: 'Test files must not be imported by production code',
      type: 'test_isolation',
      severity: 'error',
      check: (graph) => {
        const violations: Violation[] = [];

        const testFiles = graph.getNodes().filter(n =>
          n.type === 'file' &&
          (n.metadata?.isTestFile || /\.(test|spec)\.(ts|js|tsx|jsx)$/.test(n.location?.file || ''))
        );

        for (const testFile of testFiles) {
          const importers = graph.getIncomingEdges(testFile.id)
            .filter(e => e.type === 'IMPORTS');

          for (const edge of importers) {
            const importer = graph.getNode(edge.from);
            if (!importer) continue;

            // Check if importer is also a test file
            const importerIsTest =
              importer.metadata?.isTestFile ||
              /\.(test|spec)\.(ts|js|tsx|jsx)$/.test(importer.location?.file || '');

            if (!importerIsTest) {
              violations.push({
                ruleId: 'test-isolation',
                severity: 'error',
                node: importer,
                edge,
                target: testFile,
                message: `Production code "${importer.name}" imports test file "${testFile.name}"`,
              });
            }
          }
        }

        return violations;
      },
    });

    // Rule 2: Circular dependencies are forbidden
    this.registerRule({
      id: 'no-circular-deps',
      description: 'Circular dependencies are forbidden',
      type: 'layer_dependency',
      severity: 'warning',
      check: (graph) => {
        const violations: Violation[] = [];
        const visited = new Set<string>();

        for (const node of graph.getNodes()) {
          if (visited.has(node.id)) continue;

          const cycle = this.detectCycleFrom(graph, node.id, new Set(), []);
          if (cycle.length > 0) {
            // Mark all nodes in cycle as visited
            cycle.forEach(id => visited.add(id));

            // Add violation for first node
            const cycleNodes = cycle
              .map(id => graph.getNode(id))
              .filter((n): n is GraphNode => n !== null);

            violations.push({
              ruleId: 'no-circular-deps',
              severity: 'warning',
              node,
              message: `Circular dependency: ${cycleNodes.map(n => n.name).join(' → ')}`,
            });
          }
        }

        return violations;
      },
    });

    // Rule 3: Dead code should be removed
    this.registerRule({
      id: 'no-dead-code',
      description: 'Dead code should be removed',
      type: 'custom',
      severity: 'info',
      check: (graph) => {
        const violations: Violation[] = [];

        const deadNodes = graph.getNodes().filter(n => n.metadata?.isDead);

        for (const node of deadNodes) {
          violations.push({
            ruleId: 'no-dead-code',
            severity: 'info',
            node,
            message: `Dead code detected: "${node.name}" is never called or imported`,
          });
        }

        return violations;
      },
    });

    // Rule 4: Public API must not expose internal types
    this.registerRule({
      id: 'no-internal-exposure',
      description: 'Public API must not expose internal types',
      type: 'import_restriction',
      severity: 'warning',
      check: (graph) => {
        const violations: Violation[] = [];

        // Find public API nodes (exported from index files)
        const publicNodes = graph.getNodes().filter(n =>
          n.metadata?.isExported &&
          (n.location?.file?.endsWith('index.ts') || n.location?.file?.endsWith('index.js'))
        );

        for (const publicNode of publicNodes) {
          // Check if it depends on internal nodes
          const deps = graph.getOutgoingEdges(publicNode.id)
            .filter(e => e.type === 'USES' || e.type === 'DEPENDS_ON');

          for (const edge of deps) {
            const dep = graph.getNode(edge.to);
            if (!dep) continue;

            // Check if dependency is internal (not exported, in internal/ folder)
            const isInternal =
              !dep.metadata?.isExported &&
              (dep.location?.file?.includes('/internal/') || dep.location?.file?.includes('/_'));

            if (isInternal) {
              violations.push({
                ruleId: 'no-internal-exposure',
                severity: 'warning',
                node: publicNode,
                edge,
                target: dep,
                message: `Public API "${publicNode.name}" exposes internal type "${dep.name}"`,
              });
            }
          }
        }

        return violations;
      },
    });

    // Rule 5: Layer dependency rules (UI → Service → Data)
    this.registerRule({
      id: 'layer-dependency',
      description: 'UI layer must not import from data layer directly',
      type: 'layer_dependency',
      severity: 'error',
      check: (graph) => {
        const violations: Violation[] = [];

        // Classify nodes by layer
        const uiNodes = graph.getNodes().filter(n =>
          n.location?.file?.includes('/ui/') ||
          n.location?.file?.includes('/components/') ||
          n.location?.file?.includes('/views/')
        );

        const dataNodes = graph.getNodes().filter(n =>
          n.location?.file?.includes('/data/') ||
          n.location?.file?.includes('/database/') ||
          n.location?.file?.includes('/storage/')
        );

        const dataNodeIds = new Set(dataNodes.map(n => n.id));

        // Check if UI nodes import from data layer
        for (const uiNode of uiNodes) {
          const imports = graph.getOutgoingEdges(uiNode.id)
            .filter(e => e.type === 'IMPORTS' || e.type === 'DEPENDS_ON');

          for (const edge of imports) {
            if (dataNodeIds.has(edge.to)) {
              const dataNode = graph.getNode(edge.to);
              violations.push({
                ruleId: 'layer-dependency',
                severity: 'error',
                node: uiNode,
                edge,
                target: dataNode || undefined,
                message: `UI layer "${uiNode.name}" imports from data layer "${dataNode?.name}" (violates layered architecture)`,
              });
            }
          }
        }

        return violations;
      },
    });

    // Rule 6: Naming conventions
    this.registerRule({
      id: 'naming-convention',
      description: 'Classes should use PascalCase, functions should use camelCase',
      type: 'naming_convention',
      severity: 'info',
      check: (graph) => {
        const violations: Violation[] = [];

        for (const node of graph.getNodes()) {
          if (node.type === 'class' || node.type === 'interface') {
            // Should be PascalCase
            if (!/^[A-Z][a-zA-Z0-9]*$/.test(node.name)) {
              violations.push({
                ruleId: 'naming-convention',
                severity: 'info',
                node,
                message: `Class/Interface "${node.name}" should use PascalCase`,
              });
            }
          } else if (node.type === 'function' || node.type === 'method') {
            // Should be camelCase (unless it's a constructor or React component)
            const isConstructor = node.name === 'constructor';
            const isReactComponent = /^[A-Z]/.test(node.name) && node.metadata?.isReactComponent;

            if (!isConstructor && !isReactComponent && !/^[a-z][a-zA-Z0-9]*$/.test(node.name)) {
              violations.push({
                ruleId: 'naming-convention',
                severity: 'info',
                node,
                message: `Function "${node.name}" should use camelCase`,
              });
            }
          }
        }

        return violations;
      },
    });

    // Rule 7: High complexity functions
    this.registerRule({
      id: 'max-complexity',
      description: 'Functions should not have excessive complexity (>15 callees)',
      type: 'custom',
      severity: 'warning',
      check: (graph) => {
        const violations: Violation[] = [];

        for (const node of graph.getNodes()) {
          if (node.type !== 'function' && node.type !== 'method') continue;

          const callees = graph.getOutgoingEdges(node.id)
            .filter(e => e.type === 'CALLS');

          if (callees.length > 15) {
            violations.push({
              ruleId: 'max-complexity',
              severity: 'warning',
              node,
              message: `Function "${node.name}" has high complexity (${callees.length} callees, max 15)`,
            });
          }
        }

        return violations;
      },
    });
  }

  /**
   * Detect cycle from a starting node using DFS.
   */
  private detectCycleFrom(
    graph: GraphModel,
    nodeId: string,
    visiting: Set<string>,
    path: string[]
  ): string[] {
    if (visiting.has(nodeId)) {
      // Found cycle
      const cycleStart = path.indexOf(nodeId);
      return path.slice(cycleStart);
    }

    visiting.add(nodeId);
    path.push(nodeId);

    const outgoing = graph.getOutgoingEdges(nodeId)
      .filter(e => e.type === 'IMPORTS' || e.type === 'DEPENDS_ON');

    for (const edge of outgoing) {
      const cycle = this.detectCycleFrom(graph, edge.to, new Set(visiting), [...path]);
      if (cycle.length > 0) {
        return cycle;
      }
    }

    return [];
  }
}
