/**
 * Demo preset layouts in JSON format.
 * Used by quick action buttons and demo scripts.
 */
import type { CityLayout } from './city-api';

export const PRESETS: Record<string, CityLayout> = {
  'starter-town': {
    name: 'Starter Town',
    description: 'A basic starter town with power, roads, and mixed zones built from the center',
    version: 1,
    size: 8,
    buildings: [
      // Cross roads through the center
      { type: 'road', x: 0, y: 4, to_x: 7, to_y: 4 },
      { type: 'road', x: 4, y: 0, to_x: 4, to_y: 7 },

      // Power plant near center with power lines
      { type: 'power-plant', x: 3, y: 3 },
      { type: 'power-line', x: 2, y: 3 },
      { type: 'power-line', x: 1, y: 3 },

      // Commercial core (NE of center)
      { type: 'commercial', x: 5, y: 1, to_x: 7, to_y: 3 },

      // Residential (NW of center)
      { type: 'residential', x: 1, y: 1, to_x: 2, to_y: 2 },

      // Residential (SE of center)
      { type: 'residential', x: 5, y: 5, to_x: 7, to_y: 7 },

      // Industrial (SW of center)
      { type: 'industrial', x: 1, y: 5, to_x: 3, to_y: 7 },
    ],
  },

  'grid-city': {
    name: 'Grid City',
    description: 'An organized grid layout with cross roads',
    version: 1,
    size: 16,
    buildings: [
      // Power
      { type: 'power-plant', x: 0, y: 0 },
      { type: 'power-plant', x: 15, y: 15 },

      // Main roads (cross pattern)
      { type: 'road', x: 7, y: 0, to_x: 7, to_y: 15 },
      { type: 'road', x: 0, y: 7, to_x: 15, to_y: 7 },

      // Power lines to connect
      { type: 'power-line', x: 1, y: 0, to_x: 6, to_y: 0 },

      // Residential (NE quadrant)
      { type: 'residential', x: 8, y: 1, to_x: 12, to_y: 6 },

      // Commercial (NW quadrant)
      { type: 'commercial', x: 1, y: 1, to_x: 6, to_y: 6 },

      // Industrial (SE quadrant)
      { type: 'industrial', x: 8, y: 8, to_x: 12, to_y: 12 },

      // More residential (SW quadrant)
      { type: 'residential', x: 1, y: 8, to_x: 6, to_y: 12 },
    ],
  },

  'downtown': {
    name: 'Downtown Core',
    description: 'Dense commercial downtown with surrounding residential',
    version: 1,
    size: 16,
    buildings: [
      // Power
      { type: 'power-plant', x: 0, y: 0 },
      { type: 'power-line', x: 1, y: 0, to_x: 5, to_y: 0 },

      // Ring road
      { type: 'road', x: 6, y: 2, to_x: 9, to_y: 2 },
      { type: 'road', x: 6, y: 9, to_x: 9, to_y: 9 },
      { type: 'road', x: 6, y: 2, to_x: 6, to_y: 9 },
      { type: 'road', x: 9, y: 2, to_x: 9, to_y: 9 },

      // Downtown commercial core
      { type: 'commercial', x: 7, y: 3, to_x: 8, to_y: 8 },

      // Surrounding residential
      { type: 'residential', x: 3, y: 3, to_x: 5, to_y: 8 },
      { type: 'residential', x: 10, y: 3, to_x: 12, to_y: 8 },

      // Industrial district
      { type: 'industrial', x: 1, y: 10, to_x: 5, to_y: 13 },
    ],
  },
};

export function getPresetNames(): string[] {
  return Object.keys(PRESETS);
}

export function getPreset(name: string): CityLayout | null {
  return PRESETS[name] || null;
}
