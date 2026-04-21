FROM node:20-alpine

RUN apk add --no-cache docker-cli

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY server.mjs ./

ENV PORT=8011
EXPOSE 8011

CMD ["npm", "start"]
