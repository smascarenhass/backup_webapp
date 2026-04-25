FROM node:20-alpine AS test

RUN apk add --no-cache docker-cli

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm test

FROM node:20-alpine AS production

RUN apk add --no-cache docker-cli

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=test /app/server.mjs /app/backupFoldersStore.mjs /app/backupSettingsStore.mjs ./
COPY --from=test /app/scripts ./scripts

RUN mkdir -p /app/data

ENV PORT=8011
EXPOSE 8011

CMD ["npm", "start"]
