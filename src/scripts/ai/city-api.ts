/**
 * Common City API layer used by both Gemini (browser) and Claude Code (HTTP API).
 * Provides validated operations on the city: place, bulldoze, zone, layout, export.
 */

const VALID_TYPES = ['residential', 'commercial', 'industrial', 'road', 'power-plant', 'power-line'];

interface BuildingEntry {
  type: string;
  x: number;
  y: number;
  to_x?: number;
  to_y?: number;
}

export interface CityLayout {
  name?: string;
  description?: string;
  version?: number;
  size?: number;
  buildings: BuildingEntry[];
}

function getCity(): any {
  return (window as any).game?.city;
}

function getRenderer(): any {
  return (window as any).game?.renderer;
}

function validateCoords(x: number, y: number): string | null {
  const city = getCity();
  if (!city) return 'City not initialized';
  if (typeof x !== 'number' || typeof y !== 'number') return 'x and y must be numbers';
  if (x < 0 || y < 0 || x >= city.size || y >= city.size) {
    return `Coordinates (${x},${y}) out of bounds. City size is ${city.size}x${city.size} (0-${city.size - 1})`;
  }
  return null;
}

function validateType(type: string): string | null {
  if (!VALID_TYPES.includes(type)) {
    return `Invalid building type "${type}". Valid types: ${VALID_TYPES.join(', ')}`;
  }
  return null;
}

export function getCityState(): any {
  const city = getCity();
  if (!city) return { error: 'City not initialized' };

  const TYPE_CHAR: Record<string, string> = {
    'road': 'R',
    'residential': 'H',
    'commercial': 'C',
    'industrial': 'I',
    'power-plant': 'P',
    'power-line': 'L',
  };

  const buildings: BuildingEntry[] = [];
  // Build grid with compass annotations
  // x = columns X0-X7 (W→E), y = rows Y0-Y7 (N→S)
  const gridLines: string[] = [];
  const colHeader = Array.from({ length: city.size }, (_, i) => `X${i}`).join(' ');
  gridLines.push(`       W → E`);
  gridLines.push(`    ${colHeader}`);

  for (let y = 0; y < city.size; y++) {
    const prefix = y === 0 ? 'N' : y === city.size - 1 ? 'S' : ' ';
    let row = `${prefix} Y${y} `;
    for (let x = 0; x < city.size; x++) {
      const tile = city.getTile(x, y);
      if (tile?.building) {
        buildings.push({ type: tile.building.type, x, y });
        row += (TYPE_CHAR[tile.building.type] || '?') + ' ';
      } else {
        row += '. ';
      }
    }
    gridLines.push(row);
  }

  return {
    name: city.name,
    size: city.size,
    population: city.population,
    simTime: city.simTime,
    grid: gridLines.join('\n'),
    gridLegend: '. = empty, R = road, H = residential, C = commercial, I = industrial, P = power-plant, L = power-line',
    buildings,
    buildingCount: buildings.length,
  };
}

export function placeBuilding(x: number, y: number, type: string): any {
  const coordErr = validateCoords(x, y);
  if (coordErr) return { success: false, error: coordErr };

  const typeErr = validateType(type);
  if (typeErr) return { success: false, error: typeErr };

  const city = getCity();
  const tile = city.getTile(x, y);
  if (tile?.building) {
    return { success: false, error: `Tile (${x},${y}) already has a building: ${tile.building.type}` };
  }

  city.placeBuilding(x, y, type);
  return { success: true, x, y, type };
}

export function bulldoze(x: number, y: number): any {
  const coordErr = validateCoords(x, y);
  if (coordErr) return { success: false, error: coordErr };

  const city = getCity();
  const tile = city.getTile(x, y);
  if (!tile?.building) {
    return { success: false, error: `No building at (${x},${y})` };
  }

  const removed = tile.building.type;
  city.bulldoze(x, y);
  return { success: true, x, y, removedType: removed };
}

export function zoneArea(x1: number, y1: number, x2: number, y2: number, type: string): any {
  const typeErr = validateType(type);
  if (typeErr) return { success: false, error: typeErr };

  const city = getCity();
  if (!city) return { success: false, error: 'City not initialized' };

  const minX = Math.max(0, Math.min(x1, x2));
  const maxX = Math.min(city.size - 1, Math.max(x1, x2));
  const minY = Math.max(0, Math.min(y1, y2));
  const maxY = Math.min(city.size - 1, Math.max(y1, y2));

  let placed = 0;
  let skipped = 0;
  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      const tile = city.getTile(x, y);
      if (tile && !tile.building) {
        city.placeBuilding(x, y, type);
        placed++;
      } else {
        skipped++;
      }
    }
  }

  return { success: true, placed, skipped, area: { x1: minX, y1: minY, x2: maxX, y2: maxY }, type };
}

export function applyLayout(layout: CityLayout): any {
  const city = getCity();
  if (!city) return { success: false, error: 'City not initialized' };

  if (!layout.buildings || !Array.isArray(layout.buildings)) {
    return { success: false, error: 'Layout must have a "buildings" array' };
  }

  let placed = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const entry of layout.buildings) {
    const typeErr = validateType(entry.type);
    if (typeErr) {
      errors.push(typeErr);
      continue;
    }

    const startX = entry.x;
    const startY = entry.y;
    const endX = entry.to_x ?? entry.x;
    const endY = entry.to_y ?? entry.y;

    const minX = Math.min(startX, endX);
    const maxX = Math.max(startX, endX);
    const minY = Math.min(startY, endY);
    const maxY = Math.max(startY, endY);

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        const coordErr = validateCoords(x, y);
        if (coordErr) {
          skipped++;
          continue;
        }
        const tile = city.getTile(x, y);
        if (tile && !tile.building) {
          city.placeBuilding(x, y, entry.type);
          placed++;
        } else {
          skipped++;
        }
      }
    }
  }

  return {
    success: true,
    placed,
    skipped,
    errors: errors.length > 0 ? errors : undefined,
    layoutName: layout.name || 'unnamed',
  };
}

export function exportLayout(): CityLayout {
  const state = getCityState();
  return {
    name: state.name || 'Exported City',
    description: `Exported at simTime ${state.simTime}`,
    version: 1,
    size: state.size,
    buildings: state.buildings,
  };
}

export function getHappiness(): any {
  const city = getCity();
  if (!city) return { error: 'City not initialized' };

  const pop = city.population;
  let totalResidents = 0;
  let employed = 0;
  let totalBuildings = 0;
  let poweredBuildings = 0;

  for (let x = 0; x < city.size; x++) {
    for (let y = 0; y < city.size; y++) {
      const tile = city.getTile(x, y);
      if (!tile?.building) continue;
      const b = tile.building;
      totalBuildings++;
      if (b.powered) poweredBuildings++;
      if (b.type === 'residential') {
        const residents = b.residents?.count ?? 0;
        const employedRes = b.residents?.list?.filter((c: any) => c.job)?.length ?? 0;
        totalResidents += residents;
        employed += employedRes;
      }
    }
  }

  const pendingRequests = ((window as any).requestEngine?.getActiveRequests?.() ?? []).length;

  return {
    happiness: Math.round(city.happiness ?? 50),
    factors: {
      employment: totalResidents > 0 ? Math.round((employed / totalResidents) * 100) : 0,
      power: totalBuildings > 0 ? Math.round((poweredBuildings / totalBuildings) * 100) : 0,
      density: pop > 0 ? 'populated' : 'empty',
      pendingRequests,
    },
  };
}

export function getActiveRequests(): any {
  const engine = (window as any).requestEngine;
  if (!engine) return { requests: [] };
  return { requests: engine.getActiveRequests() };
}

export function getScreenshot(): string | null {
  const renderer = getRenderer();
  if (!renderer) return null;
  return renderer.domElement.toDataURL('image/png');
}

// Route handler for API bridge
export function handleCommand(route: string, method: string, body: any): any {
  switch (route) {
    case 'city-state':
      return getCityState();
    case 'place-building':
      return placeBuilding(body.x, body.y, body.type);
    case 'bulldoze':
      return bulldoze(body.x, body.y);
    case 'zone-area':
      return zoneArea(body.x1, body.y1, body.x2, body.y2, body.type);
    case 'apply-layout':
      return applyLayout(body);
    case 'export-layout':
      return exportLayout();
    case 'happiness':
      return getHappiness();
    case 'requests':
      return getActiveRequests();
    case 'screenshot':
      return { screenshot: getScreenshot() };
    default:
      return { error: `Unknown route: ${route}` };
  }
}
