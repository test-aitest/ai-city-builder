/**
 * Citizen Request Engine — State Machine version.
 * Detects city problems and generates one citizen request at a time.
 * Lifecycle: idle → request_active → settling → evaluating → idle
 */

export type EnginePhase = 'idle' | 'request_active' | 'settling' | 'evaluating';

export interface CitySnapshot {
  unpoweredCount: number;
  residentialCapacity: number;
  population: number;
  totalResidents: number;
  employed: number;
  commercialCount: number;
  industrialCount: number;
  residentialCount: number;
  powerPlantCount: number;
  powerLineCount: number;
  roadCount: number;
  noRoadAccess: number;
}

export interface CitizenRequest {
  id: string;
  citizenName: string;
  type: 'housing' | 'jobs' | 'power' | 'road' | 'commerce';
  message: string;
  createdAt: number;
  status: 'active' | 'fulfilled' | 'expired';
}

type NotifyFn = (message: string, type: 'new' | 'fulfilled' | 'failed', spokenText?: string) => void;

type EvaluateFn = (
  request: CitizenRequest,
  snapshotBefore: CitySnapshot,
  snapshotAfter: CitySnapshot,
  happinessDelta: number,
) => Promise<void>;

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

/** Expiry timeout: 90 seconds */
const EXPIRY_MS = 90 * 1000;
/** How many sim ticks to wait in settling phase */
const SETTLE_TICKS = 3;

export class RequestEngine {
  private city: any;
  private notify: NotifyFn;
  private evaluateFn: EvaluateFn | null = null;

  private phase: EnginePhase = 'idle';
  private currentRequest: CitizenRequest | null = null;
  private snapshotBefore: CitySnapshot | null = null;
  private settleTicksRemaining = 0;
  private expiryTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private requests: CitizenRequest[] = [];
  private lastIdleTime = 0;
  /** Dynamic cooldown (ms) computed when entering idle phase */
  private nextCooldownMs = 20_000;

  constructor(city: any, notify: NotifyFn) {
    this.city = city;
    this.notify = notify;
  }

  /** Set the callback invoked during evaluating phase (Gemini citizen evaluation). */
  setEvaluateFn(fn: EvaluateFn): void {
    this.evaluateFn = fn;
  }

  /** Called every sim tick by the game loop. Drives the state machine. */
  onCityChanged(): void {
    switch (this.phase) {
      case 'idle':
        this.tryGenerateRequest();
        break;
      case 'settling':
        this.settleTicksRemaining--;
        if (this.settleTicksRemaining <= 0) {
          this.phase = 'evaluating';
          this.evaluate();
        }
        break;
      // request_active: waiting for markResolved() or expiry
      // evaluating: waiting for async evaluate() to finish
    }
  }

  /**
   * Called by the mayor (via mark_request_resolved tool) after construction is complete.
   * Captures the "after" snapshot and transitions to settling.
   */
  markResolved(): void {
    if (this.phase !== 'request_active' || !this.currentRequest) {
      console.warn(`[RequestEngine] markResolved called but phase=${this.phase}, request=${!!this.currentRequest}`);
      return;
    }

    console.log(`[RequestEngine] markResolved → settling (${this.currentRequest.citizenName})`);

    // Clear expiry timer
    if (this.expiryTimeoutId) {
      clearTimeout(this.expiryTimeoutId);
      this.expiryTimeoutId = null;
    }

    this.currentRequest.status = 'fulfilled';
    this.phase = 'settling';
    this.settleTicksRemaining = SETTLE_TICKS;
  }

  /** Return active requests (0 or 1). Existing tool compatibility. */
  getActiveRequests(): CitizenRequest[] {
    return this.requests.filter(r => r.status === 'active');
  }

  /** Get the current in-flight request (if any). */
  getCurrentRequest(): CitizenRequest | null {
    return this.currentRequest;
  }

  /** Get current phase (for debugging / UI). */
  getPhase(): EnginePhase {
    return this.phase;
  }

  /**
   * Check whether the current request's underlying problem is still present.
   * Returns a status object the mayor can use to decide next steps.
   */
  checkRequestStatus(): { resolved: boolean; request: CitizenRequest | null; detail: string; suggestion: string } {
    if (!this.currentRequest || this.phase !== 'request_active') {
      return { resolved: false, request: null, detail: 'アクティブなリクエストがありません。', suggestion: '' };
    }

    const now = this.captureSnapshot();
    const before = this.snapshotBefore;
    const req = this.currentRequest;
    let resolved = false;
    let detail = '';
    let suggestion = '';

    // Resolution checks use TWO criteria:
    // 1. "ideal" — the underlying problem is fully gone
    // 2. "progress" — meaningful improvement vs. snapshotBefore (covers simulation delay)
    // Either one counts as resolved.

    switch (req.type) {
      case 'housing': {
        const ideal = now.population === 0 || now.residentialCapacity >= now.population;
        const progress = before ? now.residentialCapacity > before.residentialCapacity : false;
        resolved = ideal || progress;
        detail = `人口: ${now.population}, 住宅容量: ${now.residentialCapacity}`;
        if (!resolved) {
          const needed = Math.ceil((now.population - now.residentialCapacity) / 4) + 1;
          suggestion = `あと${needed}軒ほど住宅を建ててほしいです。人口${now.population}人に対して住宅容量が${now.residentialCapacity}しかありません。`;
        }
        break;
      }
      case 'jobs': {
        const workplaces = now.commercialCount + now.industrialCount;
        const prevWorkplaces = before ? before.commercialCount + before.industrialCount : 0;
        const ideal = workplaces >= now.residentialCount;
        const progress = before ? workplaces > prevWorkplaces : false;
        resolved = ideal || progress;
        detail = `商業: ${now.commercialCount}, 工業: ${now.industrialCount}, 住宅: ${now.residentialCount}`;
        if (!resolved) {
          const needed = now.residentialCount - workplaces;
          suggestion = `あと${needed}軒の商業施設か工業施設が必要です。住宅${now.residentialCount}軒に対して職場が${workplaces}軒しかありません。`;
        }
        break;
      }
      case 'power': {
        const ideal = now.unpoweredCount === 0;
        // Progress: power plant or power line was added (powered flag updates on next sim tick)
        const progress = before
          ? now.powerPlantCount > before.powerPlantCount || now.powerLineCount > before.powerLineCount
          : false;
        resolved = ideal || progress;
        detail = `停電中: ${now.unpoweredCount}棟, 発電所: ${now.powerPlantCount}, 送電線: ${now.powerLineCount}`;
        if (!resolved) {
          if (now.powerPlantCount === 0) {
            suggestion = `発電所がありません！まず発電所を建てて、送電線で建物に電力を届けてください。`;
          } else {
            suggestion = `まだ${now.unpoweredCount}棟が停電しています。送電線を追加して電力を届けてください。`;
          }
        }
        break;
      }
      case 'road': {
        const ideal = now.noRoadAccess === 0;
        // Progress: new roads were added
        const progress = before ? now.roadCount > before.roadCount : false;
        resolved = ideal || progress;
        detail = `道路なし: ${now.noRoadAccess}棟, 道路: ${now.roadCount}`;
        if (!resolved) {
          suggestion = `まだ${now.noRoadAccess}棟に道路が繋がっていません。建物の隣に道路を敷いてください。`;
        }
        break;
      }
      case 'commerce': {
        const ideal = now.commercialCount >= now.residentialCount * 0.3;
        const progress = before ? now.commercialCount > before.commercialCount : false;
        resolved = ideal || progress;
        detail = `商業: ${now.commercialCount}, 住宅: ${now.residentialCount}`;
        if (!resolved) {
          const needed = Math.ceil(now.residentialCount * 0.3) - now.commercialCount;
          suggestion = `あと${needed}軒の商業施設が必要です。住宅${now.residentialCount}軒に対して商業施設が${now.commercialCount}軒しかありません。`;
        }
        break;
      }
    }

    return { resolved, request: req, detail, suggestion };
  }

  // ── Private ──

  private tryGenerateRequest(): void {
    // Wait for the dynamic cooldown since last idle transition
    const now = Date.now();
    if (now - this.lastIdleTime < this.nextCooldownMs) return;

    const problems = this.detectProblems();
    if (problems.length === 0) return;
    const problem = problems[Math.floor(Math.random() * problems.length)];
    const request = this.createRequest(problem);
    console.log(`[RequestEngine] New request: ${request.type} by ${request.citizenName}`);

    this.currentRequest = request;
    this.requests.push(request);
    this.snapshotBefore = this.captureSnapshot();
    this.phase = 'request_active';

    // Start expiry timer
    this.expiryTimeoutId = setTimeout(() => this.expireRequest(), EXPIRY_MS);

    this.notify(
      `[市民リクエスト] ${request.citizenName}: 「${request.message}」`,
      'new',
      request.message,
    );
  }

  private expireRequest(): void {
    if (this.phase !== 'request_active' || !this.currentRequest) return;

    console.log(`[RequestEngine] Request expired: ${this.currentRequest.citizenName}`);
    this.currentRequest.status = 'expired';
    this.expiryTimeoutId = null;

    this.notify(
      `[期限切れ] ${this.currentRequest.citizenName} のリクエストが期限切れになりました。`,
      'failed',
    );

    this.currentRequest = null;
    this.snapshotBefore = null;
    this.transitionToIdle();
  }

  private async evaluate(): Promise<void> {
    const request = this.currentRequest;
    const before = this.snapshotBefore;
    if (!request || !before) {
      console.warn('[RequestEngine] evaluate: no request or snapshot, returning to idle');
      this.transitionToIdle();
      return;
    }

    const after = this.captureSnapshot();
    const delta = this.computeHappinessDelta(request, before, after);
    console.log(`[RequestEngine] evaluate: ${request.type} delta=${delta}`);

    // Apply happiness change
    this.city.happiness = Math.max(0, Math.min(100, (this.city.happiness ?? 50) + delta));

    const deltaStr = delta >= 0 ? `+${delta}` : `${delta}`;
    this.notify(
      `✅ ${request.citizenName} のリクエストが完了しました！ (幸福度 ${deltaStr})`,
      'fulfilled',
    );

    // Call Gemini evaluation callback
    if (this.evaluateFn) {
      try {
        await this.evaluateFn(request, before, after, delta);
      } catch (err) {
        console.warn('[RequestEngine] evaluateFn failed:', err);
      }
    }

    this.currentRequest = null;
    this.snapshotBefore = null;
    this.transitionToIdle();
  }

  private computeHappinessDelta(
    request: CitizenRequest,
    before: CitySnapshot,
    after: CitySnapshot,
  ): number {
    let delta = 0;

    switch (request.type) {
      case 'housing':
        delta = after.residentialCapacity > before.residentialCapacity ? 10 : -2;
        break;
      case 'jobs':
        delta = (after.commercialCount + after.industrialCount) >
                (before.commercialCount + before.industrialCount) ? 10 : -2;
        break;
      case 'power':
        delta = (after.powerPlantCount > before.powerPlantCount || after.powerLineCount > before.powerLineCount
                 || after.unpoweredCount < before.unpoweredCount) ? 10 : -2;
        break;
      case 'road':
        delta = (after.roadCount > before.roadCount || after.noRoadAccess < before.noRoadAccess) ? 10 : -2;
        break;
      case 'commerce':
        delta = after.commercialCount > before.commercialCount ? 10 : -2;
        break;
    }

    return delta;
  }

  private captureSnapshot(): CitySnapshot {
    const city = this.city;
    let unpoweredCount = 0;
    let residentialCapacity = 0;
    let totalResidents = 0;
    let employed = 0;
    let commercialCount = 0;
    let industrialCount = 0;
    let residentialCount = 0;
    let powerPlantCount = 0;
    let powerLineCount = 0;
    let roadCount = 0;
    let noRoadAccess = 0;

    for (let x = 0; x < city.size; x++) {
      for (let y = 0; y < city.size; y++) {
        const tile = city.getTile(x, y);
        if (!tile?.building) continue;
        const b = tile.building;

        if (!b.powered && b.type !== 'road' && b.type !== 'power-plant' && b.type !== 'power-line') {
          unpoweredCount++;
        }

        if (b.type === 'residential') {
          residentialCount++;
          residentialCapacity += b.residents?.maxCount ?? 4;
          totalResidents += b.residents?.count ?? 0;
          employed += b.residents?.list?.filter((c: any) => c.job)?.length ?? 0;
        } else if (b.type === 'commercial') {
          commercialCount++;
        } else if (b.type === 'industrial') {
          industrialCount++;
        } else if (b.type === 'power-plant') {
          powerPlantCount++;
        } else if (b.type === 'power-line') {
          powerLineCount++;
        } else if (b.type === 'road') {
          roadCount++;
        }

        if (b.type !== 'road' && b.type !== 'power-line') {
          const neighbors = city.getTileNeighbors(x, y);
          const hasRoad = neighbors.some((n: any) => n?.building?.type === 'road');
          if (!hasRoad) noRoadAccess++;
        }
      }
    }

    return {
      unpoweredCount,
      residentialCapacity,
      population: city.population,
      totalResidents,
      employed,
      commercialCount,
      industrialCount,
      residentialCount,
      powerPlantCount,
      powerLineCount,
      roadCount,
      noRoadAccess,
    };
  }

  /**
   * Transition to idle and schedule the next request with adaptive timing.
   * Cooldown depends on city state: more problems / lower happiness / larger population
   * → citizens speak up sooner. Random jitter keeps it feeling natural.
   */
  private transitionToIdle(): void {
    this.phase = 'idle';
    this.nextCooldownMs = this.computeNextCooldown();
    this.lastIdleTime = Date.now();
    console.log(`[RequestEngine] → idle (next request in ~${(this.nextCooldownMs / 1000).toFixed(0)}s)`);
  }

  private computeNextCooldown(): number {
    const snap = this.captureSnapshot();
    const happiness = this.city.happiness ?? 50;
    const problems = this.detectProblems();

    // Base: 25s — a calm city doesn't get complaints quickly
    let cooldown = 25_000;

    // Unhappy citizens are more vocal (0-100 scale, lower = shorter wait)
    // At happiness=0: -8s, at happiness=100: 0s
    cooldown -= ((100 - happiness) / 100) * 8_000;

    // More simultaneous problems = more urgency (max 5 problem types)
    // Each problem shaves off ~2s, max -10s
    cooldown -= Math.min(problems.length * 2_000, 10_000);

    // Larger population = more voices, shorter intervals
    // Caps at population 30 for -5s
    cooldown -= Math.min(snap.population * 170, 5_000);

    // Random jitter: ±4s for natural variation
    cooldown += (Math.random() - 0.5) * 8_000;

    // Clamp: min 8s, max 40s
    return Math.max(8_000, Math.min(40_000, cooldown));
  }

  private detectProblems(): string[] {
    const snap = this.captureSnapshot();
    const problems: string[] = [];

    if (snap.population > 0 && snap.population > snap.residentialCapacity * 0.8) {
      problems.push('housing');
    }
    if (snap.totalResidents > 0 && (snap.totalResidents - snap.employed) > 0 &&
        (snap.commercialCount + snap.industrialCount) < snap.residentialCount) {
      problems.push('jobs');
    }
    if (snap.unpoweredCount > 0) {
      problems.push('power');
    }
    if (snap.noRoadAccess > 0) {
      problems.push('road');
    }
    if (snap.residentialCount > 0 && snap.commercialCount < snap.residentialCount * 0.3) {
      problems.push('commerce');
    }

    return problems;
  }

  private createRequest(problem: string): CitizenRequest {
    const name = randomName();
    const messages: Record<string, string> = {
      housing: 'もっと家が必要です！新しい住宅を建ててください。',
      jobs: '仕事が見つかりません...工場かお店を建ててもらえませんか？',
      power: '停電が続いています。発電所と送電線をお願いします！',
      road: '道路がなくて不便です。道路を整備してください！',
      commerce: '買い物できる場所が少ないです。商業施設を増やしてください！',
    };

    return {
      id: generateId(),
      citizenName: name,
      type: problem as CitizenRequest['type'],
      message: messages[problem] || '',
      createdAt: Date.now(),
      status: 'active',
    };
  }
}
