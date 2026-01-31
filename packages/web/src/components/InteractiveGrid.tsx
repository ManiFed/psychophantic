'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface GridCell {
  x: number;
  y: number;
  opacity: number;
  targetOpacity: number;
}

export function InteractiveGrid() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [cells, setCells] = useState<GridCell[]>([]);
  const [dimensions, setDimensions] = useState({ cols: 0, rows: 0 });
  const cellSize = 40;
  const gap = 2;

  useEffect(() => {
    const updateDimensions = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const cols = Math.ceil(rect.width / (cellSize + gap));
      const rows = Math.ceil(rect.height / (cellSize + gap));
      setDimensions({ cols, rows });

      const newCells: GridCell[] = [];
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          newCells.push({ x, y, opacity: 0, targetOpacity: 0 });
        }
      }
      setCells(newCells);
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // Animation loop
  useEffect(() => {
    let animationId: number;

    const animate = () => {
      setCells(prev => prev.map(cell => ({
        ...cell,
        opacity: cell.opacity + (cell.targetOpacity - cell.opacity) * 0.15,
      })));
      animationId = requestAnimationFrame(animate);
    };

    animationId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationId);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const cellX = Math.floor(mouseX / (cellSize + gap));
    const cellY = Math.floor(mouseY / (cellSize + gap));

    setCells(prev => prev.map(cell => {
      const dx = cell.x - cellX;
      const dy = cell.y - cellY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const radius = 4;

      if (distance < radius) {
        const intensity = 1 - (distance / radius);
        return { ...cell, targetOpacity: Math.min(1, intensity * 1.2) };
      }
      return { ...cell, targetOpacity: Math.max(0, cell.targetOpacity - 0.05) };
    }));
  }, []);

  const handleMouseLeave = useCallback(() => {
    setCells(prev => prev.map(cell => ({ ...cell, targetOpacity: 0 })));
  }, []);

  // Random pulse effect
  useEffect(() => {
    const interval = setInterval(() => {
      if (cells.length === 0) return;
      const randomIndex = Math.floor(Math.random() * cells.length);
      setCells(prev => prev.map((cell, i) =>
        i === randomIndex ? { ...cell, targetOpacity: 0.3 } : cell
      ));
    }, 500);

    return () => clearInterval(interval);
  }, [cells.length]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <div
        className="grid absolute inset-0"
        style={{
          gridTemplateColumns: `repeat(${dimensions.cols}, ${cellSize}px)`,
          gridTemplateRows: `repeat(${dimensions.rows}, ${cellSize}px)`,
          gap: `${gap}px`,
        }}
      >
        {cells.map((cell, i) => (
          <div
            key={i}
            className="rounded-sm transition-colors duration-100"
            style={{
              backgroundColor: `hsl(24 100% 50% / ${cell.opacity * 0.6})`,
              boxShadow: cell.opacity > 0.3
                ? `0 0 ${cell.opacity * 20}px hsl(24 100% 50% / ${cell.opacity * 0.4})`
                : 'none',
            }}
          />
        ))}
      </div>
    </div>
  );
}
