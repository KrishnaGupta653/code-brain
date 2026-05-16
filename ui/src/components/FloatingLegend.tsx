/**
 * Floating Legend with Dynamic Colors
 * Displays graph node types with color coding and statistics
 * Inspired by CodeFlow's visual design
 */

import React, { useState, useEffect } from 'react';
import { getTheme, type ColorPalette, type AccentPreset } from '../lib/codeflow-theme';
import '../styles/floating-legend.css';

export interface LegendItem {
    label: string;
    color: string;
    count: number;
    icon?: string;
}

export interface LegendSection {
    title: string;
    items: LegendItem[];
    collapsible?: boolean;
}

export interface FloatingLegendProps {
    items?: LegendItem[];
    sections?: LegendSection[];
    title?: string;
    position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
    accent?: AccentPreset;
    onItemClick?: (item: LegendItem) => void;
    collapsed?: boolean;
    showStats?: boolean;
}

export const FloatingLegend: React.FC<FloatingLegendProps> = ({
    items,
    sections,
    title = 'Legend',
    position = 'top-right',
    accent = 'purple',
    onItemClick,
    collapsed: initialCollapsed = false,
    showStats = true,
}) => {
    const [isCollapsed, setIsCollapsed] = useState(initialCollapsed);
    const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
    const [theme, setTheme] = useState<ColorPalette>(() => getTheme('auto', { accent }));

    useEffect(() => {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const handleChange = () => {
            setTheme(getTheme('auto', { accent }));
        };

        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
    }, [accent]);

    const toggleSection = (sectionTitle: string) => {
        setExpandedSections(prev => ({
            ...prev,
            [sectionTitle]: !prev[sectionTitle]
        }));
    };

    const renderItems = (itemList: LegendItem[]) => {
        const totalCount = itemList.reduce((sum, item) => sum + item.count, 0);
        return itemList.map((item, idx) => (
            <div
                key={idx}
                className="floating-legend__item"
                onClick={() => onItemClick?.(item)}
                role={onItemClick ? 'button' : undefined}
                tabIndex={onItemClick ? 0 : undefined}
            >
                <div
                    className="floating-legend__color"
                    style={{ backgroundColor: item.color }}
                    title={item.label}
                />
                <span className="floating-legend__label">{item.label}</span>
                {showStats && (
                    <span className="floating-legend__count">
                        {item.count}
                        {totalCount > 0 && (
                            <span className="floating-legend__percent">
                                {Math.round((item.count / totalCount) * 100)}%
                            </span>
                        )}
                    </span>
                )}
            </div>
        ));
    };

    const allItems = items || sections?.flatMap(s => s.items) || [];
    const totalCount = allItems.reduce((sum, item) => sum + item.count, 0);

    return (
        <div
            className={`floating-legend floating-legend--${position} ${isCollapsed ? 'floating-legend--collapsed' : ''}`}
            style={{
                '--cf-bg': theme.bg,
                '--cf-border': theme.border,
                '--cf-text': theme.text,
                '--cf-text-dim': theme.textDim,
                '--cf-accent': theme.accent,
            } as React.CSSProperties}
        >
            <div className="floating-legend__header">
                <h3 className="floating-legend__title">{title}</h3>
                <button
                    className="floating-legend__toggle"
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    aria-label={isCollapsed ? 'Expand legend' : 'Collapse legend'}
                >
                    {isCollapsed ? '▶' : '▼'}
                </button>
            </div>

            {!isCollapsed && (
                <div className="floating-legend__content">
                    {sections ? (
                        <div className="floating-legend__sections">
                            {sections.map((section) => (
                                <div key={section.title} className="floating-legend__section">
                                    {section.collapsible !== false && (
                                        <button
                                            className="floating-legend__section-header"
                                            onClick={() => toggleSection(section.title)}
                                        >
                                            <span className="floating-legend__section-title">{section.title}</span>
                                            <span className="floating-legend__section-toggle">
                                                {expandedSections[section.title] !== false ? '▼' : '▶'}
                                            </span>
                                        </button>
                                    )}
                                    {(expandedSections[section.title] !== false || section.collapsible === false) && (
                                        <div className="floating-legend__items">
                                            {renderItems(section.items)}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="floating-legend__items">
                            {renderItems(items || [])}
                        </div>
                    )}

                    {showStats && (
                        <div className="floating-legend__footer">
                            <div className="floating-legend__stat">
                                <span className="floating-legend__stat-label">Total</span>
                                <span className="floating-legend__stat-value">{totalCount}</span>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default FloatingLegend;
