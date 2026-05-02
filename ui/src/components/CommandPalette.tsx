import React, { useEffect, useState, useRef } from "react";
import {
    Search,
    Sparkles,
    Filter,
    Download,
    Settings,
    Keyboard,
    Maximize2,
    RotateCcw,
    ZoomIn,
    ZoomOut,
    X,
} from "lucide-react";

interface Command {
    id: string;
    label: string;
    icon: React.ReactNode;
    shortcut?: string;
    action: () => void;
    category: "navigation" | "view" | "graph" | "export" | "settings";
}

interface CommandPaletteProps {
    isOpen: boolean;
    onClose: () => void;
    commands: Command[];
}

export function CommandPalette({ isOpen, onClose, commands }: CommandPaletteProps) {
    const [query, setQuery] = useState("");
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);

    const filteredCommands = commands.filter((cmd) =>
        cmd.label.toLowerCase().includes(query.toLowerCase())
    );

    useEffect(() => {
        if (isOpen) {
            inputRef.current?.focus();
            setQuery("");
            setSelectedIndex(0);
        }
    }, [isOpen]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!isOpen) return;

            if (e.key === "ArrowDown") {
                e.preventDefault();
                setSelectedIndex((prev) => (prev + 1) % filteredCommands.length);
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSelectedIndex((prev) => (prev - 1 + filteredCommands.length) % filteredCommands.length);
            } else if (e.key === "Enter") {
                e.preventDefault();
                if (filteredCommands[selectedIndex]) {
                    filteredCommands[selectedIndex].action();
                    onClose();
                }
            } else if (e.key === "Escape") {
                e.preventDefault();
                onClose();
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isOpen, filteredCommands, selectedIndex, onClose]);

    if (!isOpen) return null;

    const groupedCommands = filteredCommands.reduce((acc, cmd) => {
        if (!acc[cmd.category]) acc[cmd.category] = [];
        acc[cmd.category].push(cmd);
        return acc;
    }, {} as Record<string, Command[]>);

    return (
        <div className="command-palette-overlay" onClick={onClose}>
            <div className="command-palette" onClick={(e) => e.stopPropagation()}>
                <div className="command-palette-header">
                    <Search size={18} />
                    <input
                        ref={inputRef}
                        type="text"
                        placeholder="Type a command or search..."
                        value={query}
                        onChange={(e) => {
                            setQuery(e.target.value);
                            setSelectedIndex(0);
                        }}
                    />
                    <button type="button" onClick={onClose} className="command-palette-close">
                        <X size={18} />
                    </button>
                </div>

                <div className="command-palette-results">
                    {Object.entries(groupedCommands).map(([category, cmds]) => (
                        <div key={category} className="command-group">
                            <div className="command-group-label">{category}</div>
                            {cmds.map((cmd, index) => {
                                const globalIndex = filteredCommands.indexOf(cmd);
                                return (
                                    <button
                                        key={cmd.id}
                                        type="button"
                                        className={`command-item ${globalIndex === selectedIndex ? "selected" : ""}`}
                                        onClick={() => {
                                            cmd.action();
                                            onClose();
                                        }}
                                        onMouseEnter={() => setSelectedIndex(globalIndex)}
                                    >
                                        <div className="command-item-left">
                                            <span className="command-icon">{cmd.icon}</span>
                                            <span className="command-label">{cmd.label}</span>
                                        </div>
                                        {cmd.shortcut && (
                                            <kbd className="command-shortcut">{cmd.shortcut}</kbd>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    ))}

                    {filteredCommands.length === 0 && (
                        <div className="command-empty">
                            <Sparkles size={32} />
                            <p>No commands found</p>
                            <small>Try a different search term</small>
                        </div>
                    )}
                </div>

                <div className="command-palette-footer">
                    <div className="command-hint">
                        <kbd>↑</kbd> <kbd>↓</kbd> Navigate
                    </div>
                    <div className="command-hint">
                        <kbd>Enter</kbd> Select
                    </div>
                    <div className="command-hint">
                        <kbd>Esc</kbd> Close
                    </div>
                </div>
            </div>
        </div>
    );
}

export function useCommandPalette() {
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Cmd/Ctrl + P to open command palette
            if ((e.metaKey || e.ctrlKey) && e.key === "p") {
                e.preventDefault();
                setIsOpen(true);
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, []);

    return {
        isOpen,
        open: () => setIsOpen(true),
        close: () => setIsOpen(false),
        toggle: () => setIsOpen((prev) => !prev),
    };
}
