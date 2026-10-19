import { parseCli } from './cli.js';
import { loadEnv } from './config.js';
import { run } from './run.js';

// 진입점. CLI 옵션과 환경변수를 읽어 run()에 넘기고, 반환값을 종료 코드로 씀
try {
    // 앞 2개(node 경로, 스크립트 경로)를 빼고 실제 옵션만 파싱
    const opts = parseCli(process.argv.slice(2));
    // process.exit() 대신 exitCode 지정. 남은 출력·전송이 끝난 뒤 종료됨
    process.exitCode = await run(opts, loadEnv(process.env));
} catch (e) {
    // run() 밖으로 나온 예외는 예상 밖의 오류(잘못된 CLI 옵션 등). 메시지만 출력
    console.error(`[실행 실패] ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1; 
}
