import React, { useEffect, useRef } from "react";
import { GraphPayload } from "../types";

interface GraphMinimapProps {
    payload: GraphPayload;
    selectedId: string | null;
    cameraPosition?: { x: number; y: number; ratio: number };
    onNavigate?: (x: number, y: number) => void;
}

export function GraphMinimap({
    payload,
    selectedId,
    cameraPosition,
    onNavigate,
}: GraphMinimapProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        // Set canvas size
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * window.devicePixelRatio;
        canvas.height = rect.height * window.devicePixelRatio;
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

        // Clear canvas
        ctx.clearRect(0, 0, rect.width, rect.height);

        // Draw background
        ctx.fillStyle = "rgba(10, 14, 23, 0.8)";
        ctx.fillRect(0, 0, rect.width, rect.height);

        // Calculate bounds
        const positions = payload.nodes.map((node) => ({
            x: (node.metadata?.x as number) || 0,
            y: (node.metadata?.y as number) || 0,
        }));

        if (positions.length === 0) return;

        const minX = Math.min(...positions.map((p) => p.x));
        const maxX = Math.max(...positions.map((p) => p.x));
        const minY = Math.min(...positions.map((p) => p.y));
        const maxY = Math.max(...positions.map((p) => p.y));

        const graphWidth = maxX - minX || 1;
        const graphHeight = maxY - minY || 1;

        const padding = 10;
        const scale = Math.min(
            (rect.width - padding * 2) / graphWidth,
            (rect.height - padding * 2) / graphHeight
        );

        // Transform function
        const transform = (x: number, y: number) => ({
            x: (x - minX) * scale + padding,
            y: (y - minY) * scale + padding,
        });

        // Draw edges (simplified)
        ctx.strokeStyle = "rgba(100, 116, 139, 0.3)";
        ctx.lineWidth = 0.5;
        payload.edges.slice(0, 500).forEach((edge) => {
            const fromNode = payload.nodes.find((n) => n.id === edge.from);
            const toNode = payload.nodes.find((n) => n.id === edge.to);
            if (!fromNode || !toNode) return;

            const from = transform((fromNode.metadata?.x as number) || 0, (fromNode.metadata?.y as number) || 0);
            const to = transform((toNode.metadata?.x as number) || 0, (toNode.metadata?.y as number) || 0);

            ctx.beginPath();
            ctx.moveTo(from.x, from.y);
            ctx.lineTo(to.x, to.y);
            ctx.stroke();
        });

        // Draw nodes
        payload.nodes.forEach((node) => {
            const pos = transform((node.metadata?.x as number) || 0, (node.metadata?.y as number) || 0);
            const isSelected = node.id === selectedId;

            ctx.beginPath();
            ctx.arc(pos.x, pos.y, isSelected ? 3 : 1.5, 0, Math.PI * 2);
            ctx.fillStyle = isSelected
                ? "#22d3ee"
                : node.type === "file"
                    ? "rgba(76, 201, 240, 0.6)"
                    : "rgba(148, 163, 184, 0.4)";
            ctx.fill();

            if (isSelected) {
                ctx.strokeStyle = "#22d3ee";
                ctx.lineWidth = 1;
                ctx.stroke();
            }
        });

        // Draw viewport indicator
        if (cameraPosition) {
            const viewportWidth = rect.width / (cameraPosition.ratio * 2);
            const viewportHeight = rect.height / (cameraPosition.ratio * 2);
            const viewportPos = transform(cameraPosition.x, cameraPosition.y);

            ctx.strokeStyle = "rgba(6, 182, 212, 0.8)";
            ctx.lineWidth = 2;
            ctx.strokeRect(
                viewportPos.x - viewportWidth / 2,
                viewportPos.y - viewportHeight / 2,
                viewportWidth,
                viewportHeight
            );
        }
    }, [payload, selectedId, cameraPosition]);

    const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!onNavigate) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Calculate graph position (inverse transform)
        const positions = payload.nodes.map((node) => ({
            x: (node.metadata?.x as number) || 0,
            y: (node.metadata?.y as number) || 0,
        }));

        if (positions.length === 0) return;

        const minX = Math.min(...positions.map((p) => p.x));
        const maxX = Math.max(...positions.map((p) => p.x));
        const minY = Math.min(...positions.map((p) => p.y));
        const maxY = Math.max(...positions.map((p) => p.y));

        const graphWidth = maxX - minX || 1;
        const graphHeight = maxY - minY || 1;

        const padding = 10;
        const scale = Math.min(
            (rect.width - padding * 2) / graphWidth,
            (rect.height - padding * 2) / graphHeight
        );

        const graphX = (x - padding) / scale + minX;
        const graphY = (y - padding) / scale + minY;

        onNavigate(graphX, graphY);
    };

    return (
        <div className="graph-minimap">
            <canvas
                ref={canvasRef}
                className="minimap-canvas"
                onClick={handleClick}
                style={{ cursor: onNavigate ? "pointer" : "default" }}
            />
            <div className="minimap-label">Minimap</div>
        </div>
    );
}
