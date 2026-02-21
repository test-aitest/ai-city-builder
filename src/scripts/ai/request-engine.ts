/**
 * Citizen Request Engine.
 * Detects city problems and generates citizen requests.
 * Checks fulfillment automatically and awards happiness bonuses.
 */

export interface CitizenRequest {
  id: string;
  citizenName: string;
  type: 'housing' | 'jobs' | 'power' | 'road' | 'commerce';
  message: string;
  condition: () => boolean;
  reward: number;
  createdAt: number;
  status: 'active' | 'fulfilled' | 'expired';
}

type NotifyFn = (message: string, type: 'new' | 'fulfilled', spokenText?: string) => void;

const CITIZEN_NAMES = [
  'Tanaka', 'Suzuki', 'Yamamoto', 'Sato', 'Watanabe',
  'Ito', 'Nakamura', 'Kobayashi', 'Kato', 'Yoshida',
  'Yamada', 'Sasaki', 'Takahashi', 'Matsumoto', 'Inoue',
  'Kimura', 'Shimizu', 'Hayashi', 'Saito', 'Mori',
];

function randomName(): string {
  return CITIZEN_NAMES[Math.floor(Math.random() * CITIZEN_NAMES.length)];
}

function generateId(): string {
  return 'req_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
}

export class RequestEngine {
  private requests: CitizenRequest[] = [];
  private city: any;
  private notify: NotifyFn;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private checkIntervalId: ReturnType<typeof setInterval> | null = null;
  private maxActiveRequests = 3;

  constructor(city: any, notify: NotifyFn) {
    this.city = city;
    this.notify = notify;
  }

  start(): void {
    // Generate requests every 30 seconds
    this.intervalId = setInterval(() => this.tick(), 30000);
    // Check fulfillment every 5 seconds
    this.checkIntervalId = setInterval(() => this.checkFulfillment(), 5000);
  }

  stop(): void {
    if (this.intervalId) clearInterval(this.intervalId);
    if (this.checkIntervalId) clearInterval(this.checkIntervalId);
  }

  getActiveRequests(): CitizenRequest[] {
    return this.requests.filter(r => r.status === 'active');
  }

  private tick(): void {
    if (this.getActiveRequests().length >= this.maxActiveRequests) return;

    const problems = this.detectProblems();
    if (problems.length === 0) return;

    const problem = problems[Math.floor(Math.random() * problems.length)];
    const request = this.generateRequest(problem);
    if (request) {
      this.requests.push(request);
      this.notify(
        `[Citizen Request] ${request.citizenName}: "${request.message}"`,
        'new',
        request.message
      );
    }
  }

  private detectProblems(): string[] {
    const problems: string[] = [];
    const city = this.city;

    let residentialCapacity = 0;
    let residentialCount = 0;
    let commercialCount = 0;
    let industrialCount = 0;
    let unpoweredCount = 0;
    let totalBuildings = 0;
    let noRoadAccess = 0;
    let totalResidents = 0;
    let employed = 0;

    for (let x = 0; x < city.size; x++) {
      for (let y = 0; y < city.size; y++) {
        const tile = city.getTile(x, y);
        if (!tile?.building) continue;
        const b = tile.building;
        totalBuildings++;

        if (!b.powered && b.type !== 'road' && b.type !== 'power-plant' && b.type !== 'power-line') {
          unpoweredCount++;
        }

        if (b.type === 'residential') {
          residentialCount++;
          residentialCapacity += b.residents?.maxCount ?? 4;
          const residents = b.residents?.count ?? 0;
          const employedRes = b.residents?.list?.filter((c: any) => c.job)?.length ?? 0;
          totalResidents += residents;
          employed += employedRes;
        } else if (b.type === 'commercial') {
          commercialCount++;
        } else if (b.type === 'industrial') {
          industrialCount++;
        }

        // Check road access (has adjacent road)
        if (b.type !== 'road' && b.type !== 'power-line') {
          const neighbors = city.getTileNeighbors(x, y);
          const hasRoad = neighbors.some((n: any) => n?.building?.type === 'road');
          if (!hasRoad) noRoadAccess++;
        }
      }
    }

    const pop = city.population;

    // Housing shortage
    if (pop > 0 && pop > residentialCapacity * 0.8) {
      problems.push('housing');
    }

    // Unemployment
    if (totalResidents > 0 && (totalResidents - employed) > 0 && (commercialCount + industrialCount) < residentialCount) {
      problems.push('jobs');
    }

    // Power shortage
    if (unpoweredCount > 0) {
      problems.push('power');
    }

    // No road access
    if (noRoadAccess > 0) {
      problems.push('road');
    }

    // Commerce shortage
    if (residentialCount > 0 && commercialCount < residentialCount * 0.3) {
      problems.push('commerce');
    }

    return problems;
  }

  private generateRequest(problem: string): CitizenRequest | null {
    const city = this.city;
    const name = randomName();

    switch (problem) {
      case 'housing': {
        const before = city.population;
        return {
          id: generateId(),
          citizenName: name,
          type: 'housing',
          message: 'もっと家が必要です！新しい住宅を建ててください。',
          condition: () => {
            let cap = 0;
            for (let x = 0; x < city.size; x++)
              for (let y = 0; y < city.size; y++) {
                const t = city.getTile(x, y);
                if (t?.building?.type === 'residential') cap += t.building.residents?.maxCount ?? 4;
              }
            return cap > before * 1.2;
          },
          reward: 5,
          createdAt: Date.now(),
          status: 'active',
        };
      }
      case 'jobs': {
        let beforeJobs = 0;
        for (let x = 0; x < city.size; x++)
          for (let y = 0; y < city.size; y++) {
            const t = city.getTile(x, y);
            if (t?.building?.type === 'commercial' || t?.building?.type === 'industrial') beforeJobs++;
          }
        return {
          id: generateId(),
          citizenName: name,
          type: 'jobs',
          message: '仕事が見つかりません...工場かお店を建ててもらえませんか？',
          condition: () => {
            let count = 0;
            for (let x = 0; x < city.size; x++)
              for (let y = 0; y < city.size; y++) {
                const t = city.getTile(x, y);
                if (t?.building?.type === 'commercial' || t?.building?.type === 'industrial') count++;
              }
            return count > beforeJobs;
          },
          reward: 5,
          createdAt: Date.now(),
          status: 'active',
        };
      }
      case 'power': {
        return {
          id: generateId(),
          citizenName: name,
          type: 'power',
          message: '停電が続いています。発電所と送電線をお願いします！',
          condition: () => {
            for (let x = 0; x < city.size; x++)
              for (let y = 0; y < city.size; y++) {
                const t = city.getTile(x, y);
                const b = t?.building;
                if (b && !b.powered && b.type !== 'road' && b.type !== 'power-plant' && b.type !== 'power-line') {
                  return false;
                }
              }
            return true;
          },
          reward: 5,
          createdAt: Date.now(),
          status: 'active',
        };
      }
      case 'road': {
        return {
          id: generateId(),
          citizenName: name,
          type: 'road',
          message: '道路がなくて不便です。道路を整備してください！',
          condition: () => {
            for (let x = 0; x < city.size; x++)
              for (let y = 0; y < city.size; y++) {
                const t = city.getTile(x, y);
                const b = t?.building;
                if (b && b.type !== 'road' && b.type !== 'power-line') {
                  const neighbors = city.getTileNeighbors(x, y);
                  const hasRoad = neighbors.some((n: any) => n?.building?.type === 'road');
                  if (!hasRoad) return false;
                }
              }
            return true;
          },
          reward: 5,
          createdAt: Date.now(),
          status: 'active',
        };
      }
      case 'commerce': {
        let beforeCommerce = 0;
        for (let x = 0; x < city.size; x++)
          for (let y = 0; y < city.size; y++) {
            const t = city.getTile(x, y);
            if (t?.building?.type === 'commercial') beforeCommerce++;
          }
        return {
          id: generateId(),
          citizenName: name,
          type: 'commerce',
          message: '買い物できる場所が少ないです。商業施設を増やしてください！',
          condition: () => {
            let count = 0;
            for (let x = 0; x < city.size; x++)
              for (let y = 0; y < city.size; y++) {
                const t = city.getTile(x, y);
                if (t?.building?.type === 'commercial') count++;
              }
            return count > beforeCommerce;
          },
          reward: 5,
          createdAt: Date.now(),
          status: 'active',
        };
      }
      default:
        return null;
    }
  }

  private checkFulfillment(): void {
    for (const req of this.requests) {
      if (req.status !== 'active') continue;

      try {
        if (req.condition()) {
          req.status = 'fulfilled';
          this.city.happiness = Math.min(100, (this.city.happiness ?? 50) + req.reward);
          const fulfilledMsg = `${req.citizenName} のリクエストが達成されました！幸福度が上がりました。`;
          this.notify(
            `${req.citizenName} のリクエストが達成されました！ (幸福度 +${req.reward})`,
            'fulfilled',
            fulfilledMsg
          );
        }
      } catch (_) {
        // condition check failed, skip
      }

      // Expire after 5 minutes
      if (Date.now() - req.createdAt > 5 * 60 * 1000 && req.status === 'active') {
        req.status = 'expired';
      }
    }
  }
}
