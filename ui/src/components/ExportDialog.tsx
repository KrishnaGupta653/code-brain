import React, { useState } from "react";
import { Download, Image, FileJson, FileText, X } from "lucide-react";

interface ExportDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onExport: (format: ExportFormat, options: ExportOptions) => void;
}

export type ExportFormat = "png" | "svg" | "json" | "markdown";

export interface ExportOptions {
    includeMetadata: boolean;
    includeSource: boolean;
    quality?: number; // For PNG
    scale?: number; // For image exports
}

export function ExportDialog({ isOpen, onClose, onExport }: ExportDialogProps) {
    const [format, setFormat] = useState<ExportFormat>("png");
    const [includeMetadata, setIncludeMetadata] = useState(true);
    const [includeSource, setIncludeSource] = useState(false);
    const [quality, setQuality] = useState(90);
    const [scale, setScale] = useState(2);

    if (!isOpen) return null;

    const handleExport = () => {
        onExport(format, {
            includeMetadata,
            includeSource,
            quality: format === "png" ? quality : undefined,
            scale: format === "png" || format === "svg" ? scale : undefined,
        });
        onClose();
    };

    return (
        <div className="export-dialog-overlay" onClick={onClose}>
            <div className="export-dialog" onClick={(e) => e.stopPropagation()}>
                <header className="export-dialog-header">
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <Download size={20} />
                        <h2>Export Graph</h2>
                    </div>
                    <button type="button" onClick={onClose}>
                        <X size={18} />
                    </button>
                </header>

                <div className="export-dialog-content">
                    <div className="export-format-grid">
                        <button
                            type="button"
                            className={`export-format-card ${format === "png" ? "active" : ""}`}
                            onClick={() => setFormat("png")}
                        >
                            <Image size={24} />
                            <span>PNG Image</span>
                            <small>High-quality raster image</small>
                        </button>

                        <button
                            type="button"
                            className={`export-format-card ${format === "svg" ? "active" : ""}`}
                            onClick={() => setFormat("svg")}
                        >
                            <Image size={24} />
                            <span>SVG Vector</span>
                            <small>Scalable vector graphics</small>
                        </button>

                        <button
                            type="button"
                            className={`export-format-card ${format === "json" ? "active" : ""}`}
                            onClick={() => setFormat("json")}
                        >
                            <FileJson size={24} />
                            <span>JSON Data</span>
                            <small>Raw graph data</small>
                        </button>

                        <button
                            type="button"
                            className={`export-format-card ${format === "markdown" ? "active" : ""}`}
                            onClick={() => setFormat("markdown")}
                        >
                            <FileText size={24} />
                            <span>Markdown</span>
                            <small>Documentation format</small>
                        </button>
                    </div>

                    <div className="export-options">
                        <h3>Options</h3>

                        {(format === "png" || format === "svg") && (
                            <div className="export-option">
                                <label htmlFor="scale">Scale</label>
                                <div className="export-slider">
                                    <input
                                        id="scale"
                                        type="range"
                                        min="1"
                                        max="4"
                                        step="0.5"
                                        value={scale}
                                        onChange={(e) => setScale(Number(e.target.value))}
                                    />
                                    <span>{scale}x</span>
                                </div>
                            </div>
                        )}

                        {format === "png" && (
                            <div className="export-option">
                                <label htmlFor="quality">Quality</label>
                                <div className="export-slider">
                                    <input
                                        id="quality"
                                        type="range"
                                        min="50"
                                        max="100"
                                        step="5"
                                        value={quality}
                                        onChange={(e) => setQuality(Number(e.target.value))}
                                    />
                                    <span>{quality}%</span>
                                </div>
                            </div>
                        )}

                        {(format === "json" || format === "markdown") && (
                            <>
                                <div className="export-option">
                                    <label>
                                        <input
                                            type="checkbox"
                                            checked={includeMetadata}
                                            onChange={(e) => setIncludeMetadata(e.target.checked)}
                                        />
                                        <span>Include metadata</span>
                                    </label>
                                    <small>Node metrics, provenance, and analytics</small>
                                </div>

                                <div className="export-option">
                                    <label>
                                        <input
                                            type="checkbox"
                                            checked={includeSource}
                                            onChange={(e) => setIncludeSource(e.target.checked)}
                                        />
                                        <span>Include source code</span>
                                    </label>
                                    <small>Embed source code snippets</small>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                <footer className="export-dialog-footer">
                    <button type="button" className="export-cancel" onClick={onClose}>
                        Cancel
                    </button>
                    <button type="button" className="export-confirm" onClick={handleExport}>
                        <Download size={16} />
                        Export {format.toUpperCase()}
                    </button>
                </footer>
            </div>
        </div>
    );
}
