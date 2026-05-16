import React, { useEffect, useState } from 'react';
import { getTheme, type AccentPreset, type ColorPalette } from '../lib/codeflow-theme';
import '../styles/codeflow-legend.css';

export interface LegendCategory {
  id: string;
  label: string;
  icon?: string;
  items: LegendItem[];
}

export interface LegendItem {
  id: string;
  label: string;
  color: string;
  count: number;
  percentage?: number;
}

export interface CodeFlowLegendProps {
  categories: LegendCategory[];
  title?: string;
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  accent?: AccentPreset;
  onItemClick?: (item: LegendItem, categoryId: string) => void;
  onCategoryToggle?: (categoryId: string, expanded: boolean) => void;
  showStats?: boolean;
  collapsedCategories?: Set<string>;
  initialCollapsed?: boolean;
}

export const CodeFlowLegend: React.FC<CodeFlowLegendProps> = ({
  categories,
  title = 'Legend',
  position = 'top-right',
  accent = 'purple',
  onItemClick,
  onCategoryToggle,
  showStats = true,
  collapsedCategories = new Set(),
  initialCollapsed = false,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(initialCollapsed);
  const [theme, setTheme] = useState<ColorPalette>(() => getTheme('auto', { accent }));
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(categories.map((category) => category.id).filter((id) => !collapsedCategories.has(id))),
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => setTheme(getTheme('auto', { accent }));

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [accent]);

  useEffect(() => {
    setExpandedCategories((previous) => {
      const next = new Set(previous);
      categories.forEach((category) => {
        if (!collapsedCategories.has(category.id) && !next.has(category.id)) {
          next.add(category.id);
        }
      });
      return next;
    });
  }, [categories, collapsedCategories]);

  const handleCategoryToggle = (categoryId: string) => {
    const nextExpanded = new Set(expandedCategories);
    if (nextExpanded.has(categoryId)) {
      nextExpanded.delete(categoryId);
    } else {
      nextExpanded.add(categoryId);
    }
    setExpandedCategories(nextExpanded);
    onCategoryToggle?.(categoryId, nextExpanded.has(categoryId));
  };

  const handleItemKeyDown = (
    event: React.KeyboardEvent<HTMLDivElement>,
    item: LegendItem,
    categoryId: string,
  ) => {
    if (!onItemClick) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onItemClick(item, categoryId);
    }
  };

  const totalItems = categories.reduce(
    (sum, category) => sum + category.items.reduce((itemSum, item) => itemSum + item.count, 0),
    0,
  );

  return (
    <div
      className={`codeflow-legend codeflow-legend--${position} ${isCollapsed ? 'codeflow-legend--collapsed' : ''}`}
      style={{
        '--cf-bg': theme.bg,
        '--cf-border': theme.border,
        '--cf-text': theme.text,
        '--cf-text-dim': theme.textDim,
        '--cf-text-faint': theme.textFaint,
        '--cf-accent': theme.accent,
        '--cf-accent-soft': theme.accentSoft,
      } as React.CSSProperties}
    >
      <div className="codeflow-legend__header">
        <h3 className="codeflow-legend__title">{title}</h3>
        <button
          type="button"
          className="codeflow-legend__collapse"
          onClick={() => setIsCollapsed((value) => !value)}
          aria-label={isCollapsed ? 'Expand legend' : 'Collapse legend'}
          aria-expanded={!isCollapsed}
        >
          {isCollapsed ? '+' : '-'}
        </button>
      </div>

      {!isCollapsed && (
        <div className="codeflow-legend__content">
          {categories.map((category) => {
            const isExpanded = expandedCategories.has(category.id);
            const categoryTotal = category.items.reduce((sum, item) => sum + item.count, 0);

            return (
              <div key={category.id} className="codeflow-legend__category">
                <button
                  type="button"
                  className="codeflow-legend__category-header"
                  onClick={() => handleCategoryToggle(category.id)}
                  aria-expanded={isExpanded}
                >
                  <span className="codeflow-legend__category-toggle">
                    {isExpanded ? '-' : '+'}
                  </span>
                  {category.icon && (
                    <span className="codeflow-legend__category-icon">{category.icon}</span>
                  )}
                  <span className="codeflow-legend__category-label">{category.label}</span>
                  {showStats && (
                    <span className="codeflow-legend__category-count">{categoryTotal}</span>
                  )}
                </button>

                {isExpanded && (
                  <div className="codeflow-legend__category-items">
                    {category.items.map((item) => (
                      <div
                        key={item.id}
                        className="codeflow-legend__item"
                        onClick={() => onItemClick?.(item, category.id)}
                        onKeyDown={(event) => handleItemKeyDown(event, item, category.id)}
                        role={onItemClick ? 'button' : undefined}
                        tabIndex={onItemClick ? 0 : undefined}
                      >
                        <div
                          className="codeflow-legend__item-color"
                          style={{ backgroundColor: item.color }}
                          title={item.label}
                        />
                        <span className="codeflow-legend__item-label">{item.label}</span>
                        {showStats && (
                          <span className="codeflow-legend__item-stats">
                            <span className="codeflow-legend__item-count">{item.count}</span>
                            {item.percentage !== undefined && (
                              <span className="codeflow-legend__item-percent">{item.percentage}%</span>
                            )}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showStats && !isCollapsed && (
        <div className="codeflow-legend__footer">
          <div className="codeflow-legend__footer-stat">
            <span className="codeflow-legend__footer-label">Total Items</span>
            <span className="codeflow-legend__footer-value">{totalItems}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default CodeFlowLegend;
