FROM alpine:3.19

RUN apk add --no-cache bash ca-certificates tzdata tar xz findutils supercronic

WORKDIR /app

COPY backup_sync.sh /app/backup_sync.sh
COPY entrypoint.sh /app/entrypoint.sh

RUN chmod +x /app/backup_sync.sh /app/entrypoint.sh

ENV BACKUP_CONFIG_FILE=/config/backup.conf
ENV CRON_SCHEDULE="0 3 * * *"

ENTRYPOINT ["/app/entrypoint.sh"]

