import { ProvenanceRecord, SourceSpan, NodeType } from '../types/models.js';

export class ProvenanceTracker {
  private records: Map<string, ProvenanceRecord> = new Map();

  trackParsing(
    nodeId: string,
    type: NodeType,
    sourceLocations: SourceSpan[],
    confidence: number = 1.0
  ): ProvenanceRecord {
    const record: ProvenanceRecord = {
      nodeId,
      type: 'parser',
      source: sourceLocations,
      confidence,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    this.records.set(nodeId, record);
    return record;
  }

  trackInference(
    nodeId: string,
    sourceLocations: SourceSpan[],
    confidence: number = 0.8
  ): ProvenanceRecord {
    const record: ProvenanceRecord = {
      nodeId,
      type: 'inference',
      source: sourceLocations,
      confidence,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    this.records.set(nodeId, record);
    return record;
  }

  getProvenance(nodeId: string): ProvenanceRecord | undefined {
    return this.records.get(nodeId);
  }

  getAllProvenanceRecords(): ProvenanceRecord[] {
    return Array.from(this.records.values());
  }

  clear(): void {
    this.records.clear();
  }
}
