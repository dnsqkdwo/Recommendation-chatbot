# 빌드 단계: 전체 의존성 설치 → src를 dist로 컴파일 → 런타임 의존성만 남김
FROM node:22-slim AS build
WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
COPY package.json yarn.lock .yarnrc.yml ./
RUN yarn install --immutable
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN yarn build && yarn workspaces focus --production

# 실행 단계: dist와 런타임 의존성만 담음. 키는 K8s Secret이 환경변수로 주입
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
USER node
# CLI 옵션(--dry-run 등)은 docker run 뒤나 K8s args로 덧붙임
ENTRYPOINT ["node", "dist/index.js"]
