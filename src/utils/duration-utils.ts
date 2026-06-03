const UNIT_MAP: Record<string, number> = {
    s: 1000,
    sec: 1000,
    secs: 1000,
    second: 1000,
    seconds: 1000,
    m: 60 * 1000,
    min: 60 * 1000,
    mins: 60 * 1000,
    minute: 60 * 1000,
    minutes: 60 * 1000,
    h: 60 * 60 * 1000,
    hr: 60 * 60 * 1000,
    hrs: 60 * 60 * 1000,
    hour: 60 * 60 * 1000,
    hours: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    day: 24 * 60 * 60 * 1000,
    days: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000,
    week: 7 * 24 * 60 * 60 * 1000,
    weeks: 7 * 24 * 60 * 60 * 1000,
};

const TOKEN_REGEX = /(\d+)\s*([a-zA-Z]+)/g;

export interface DurationParseResult {
    ok: boolean;
    ms?: number;
    error?: string;
}

export class DurationUtils {
    public static parse(input: string): DurationParseResult {
        if (!input) {
            return { ok: false, error: 'No duration supplied.' };
        }

        const normalized = input.trim().toLowerCase();
        if (!TOKEN_REGEX.test(normalized)) {
            return { ok: false, error: `Could not parse duration "${input}".` };
        }

        TOKEN_REGEX.lastIndex = 0;
        let total = 0;
        let matched = 0;
        let match: RegExpExecArray | null;

        while ((match = TOKEN_REGEX.exec(normalized)) !== null) {
            const value = Number(match[1]);
            const unitRaw = match[2];
            const unit = UNIT_MAP[unitRaw];

            if (unit === undefined) {
                return {
                    ok: false,
                    error: `Unknown duration unit "${unitRaw}". Use s, m, h, d, or w.`,
                };
            }
            if (!Number.isFinite(value) || value < 0) {
                return { ok: false, error: 'Duration value must be a non-negative number.' };
            }
            total += value * unit;
            matched += 1;
        }

        if (matched === 0) {
            return { ok: false, error: `Could not parse duration "${input}".` };
        }

        if (total <= 0) {
            return { ok: false, error: 'Duration must be greater than zero.' };
        }

        if (total > 28 * 24 * 60 * 60 * 1000) {
            return { ok: false, error: 'Duration cannot exceed 28 days (Discord limit).' };
        }

        return { ok: true, ms: total };
    }

    public static humanize(ms: number): string {
        const seconds = Math.floor(ms / 1000);
        if (seconds < 60) return `${seconds}s`;
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ${minutes % 60}m`.trim();
        const days = Math.floor(hours / 24);
        return `${days}d ${hours % 24}h`.trim();
    }
}
