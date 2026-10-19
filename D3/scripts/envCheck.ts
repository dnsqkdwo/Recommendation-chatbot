// 키 상태 점검

const KEYS = [
    'DATA_GO_KR_SERVICE_KEY',
    'KOBIS_API_KEY',
    'KMDB_API_KEY',
    'KOPIS_SERVICE_KEY',
    'SEOUL_OPENAPI_KEY',
    'NL_API_KEY',
    'DATA4LIBRARY_AUTH_KEY',
    'OPENROUTER_API_KEY',
    'MATTERMOST_WEBHOOK_URL',
    'MATTERMOST_ADMIN_WEBHOOK_URL',
] as const;

const WEBHOOK_KEYS = new Set<string>(['MATTERMOST_WEBHOOK_URL', 'MATTERMOST_ADMIN_WEBHOOK_URL']);

// 키를 받기 전 자리만 채워 둔 값 (예: OPENROUTER_API_KEY=TODO)
const PLACEHOLDER = /^(todo|tbd|xxx+|changeme|placeholder|dummy|none)$/i;

type Status = 'OK' | '경고' | '비어 있음';

// 환경변수 값의 유효성을 점검해 상태와 비고를 반환
function check(name: string, value: string | undefined): { status: Status; note: string } {
    if (value === undefined || value.trim() === '') {
        return { status: '비어 있음', note: '' };
    }
    if (PLACEHOLDER.test(value.trim())) {
        return { status: '경고', note: '임시 값' };
    }
    const warnings: string[] = [];
    if (value !== value.trim()) warnings.push('앞뒤 공백 있음');
    if (/["'`]/.test(value)) warnings.push('따옴표 포함');
    if (WEBHOOK_KEYS.has(name)) {
        if (!value.trim().startsWith('https://')) warnings.push('https://로 시작하지 않음');
        return warnings.length > 0
            ? { status: '경고', note: warnings.join(', ') }
            : { status: 'OK', note: 'https://로 시작' };
    }
    if (/%[0-9A-Fa-f]{2}/.test(value)) warnings.push('인코딩된 키로 보임 (Decoding 키 필요)');
    return warnings.length > 0
        ? { status: '경고', note: `${value.length}자, ${warnings.join(', ')}` }
        : { status: 'OK', note: `${value.length}자` };
}

let problems = 0;
for (const name of KEYS) {
    const { status, note } = check(name, process.env[name]);
    if (status !== 'OK') problems++;
    console.log(`${name.padEnd(30)}${status.padEnd(8)}${note}`);
}

console.log('');
console.log(problems === 0 ? '모든 키 OK' : `문제 있는 키 ${problems}개`);
process.exitCode = problems === 0 ? 0 : 1;
