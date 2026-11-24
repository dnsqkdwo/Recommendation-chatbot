// 실행 중 에러를 모아 관리자 통지로 한 번에 보냄

import type { AppError } from '../core/errors.js';

export class ErrorCollector {
    readonly #errors: AppError[] = [];

    add(error: AppError): void {
        this.#errors.push(error);
    }

    list(): readonly AppError[] {
        return this.#errors;
    }
}
