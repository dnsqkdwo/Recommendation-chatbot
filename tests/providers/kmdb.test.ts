import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SourceError } from '../../src/core/errors.js';
import { cleanKmdbTitle, parseKmdbPlot } from '../../src/providers/kmdb.js';

const fixture = (name: string): string => readFileSync(`fixtures/kmdb/${name}`, 'utf8');

describe('parseKmdbPlot', () => {
    it('제목과 개봉연도가 맞는 영화(2019 기생충)의 한국어 줄거리', () => {
        const plot = parseKmdbPlot(fixture('list.json'), '기생충', '2019');
        expect(plot).toMatch(/^“같이 잘 살면 안 될까요\?”/);
        expect(plot).toContain('기택(송강호)');
    });

    it('개봉일이 비어 있으면 제작연도로 매칭 (1968 기생충)', () => {
        expect(parseKmdbPlot(fixture('list.json'), '기생충', '1968')).toMatch(/^.+/);
    });

    it('연도가 맞는 영화가 없으면 null', () => {
        expect(parseKmdbPlot(fixture('list.json'), '기생충', '2026')).toBeNull();
    });

    it('제목이 다르면 null (부분 일치 안 함)', () => {
        expect(parseKmdbPlot(fixture('list.json'), '기생충을 예방', '1974')).toBeNull();
    });

    it('인증 오류 본문은 AUTH_ERROR', () => {
        try {
            parseKmdbPlot(fixture('error.txt'), '기생충', '2019');
            expect.unreachable();
        } catch (e) {
            expect((e as SourceError).code).toBe('AUTH_ERROR');
        }
    });
});

describe('cleanKmdbTitle', () => {
    it('검색어 강조 표시 제거', () => {
        expect(cleanKmdbTitle('  !HS 기생충 !HE 을 예방하자')).toBe('기생충 을 예방하자');
    });
});
