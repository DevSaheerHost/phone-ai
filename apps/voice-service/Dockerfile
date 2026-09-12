# Persistent Node.js service — do NOT deploy this to a serverless/edge
# runtime. It holds long-lived WebSocket connections (Twilio Media Streams
# and OpenAI Realtime) for the duration of each phone call.
FROM node:22-slim AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/voice-service/package.json apps/voice-service/package.json
RUN npm ci
COPY packages/shared packages/shared
COPY apps/voice-service apps/voice-service
COPY tsconfig.base.json tsconfig.base.json
RUN npm run build -w packages/shared && npm run build -w apps/voice-service

FROM node:22-slim
WORKDIR /repo
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/voice-service/package.json apps/voice-service/package.json
RUN npm ci --omit=dev
COPY --from=build /repo/packages/shared/dist packages/shared/dist
COPY --from=build /repo/apps/voice-service/dist apps/voice-service/dist
EXPOSE 8080
CMD ["node", "apps/voice-service/dist/index.js"]
