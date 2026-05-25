FROM alpine:3.20

ARG PB_VERSION=0.23.5

RUN apk add --no-cache ca-certificates unzip wget \
    && wget -O /tmp/pocketbase.zip "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip" \
    && mkdir -p /pb \
    && unzip /tmp/pocketbase.zip -d /pb \
    && chmod +x /pb/pocketbase \
    && rm /tmp/pocketbase.zip

EXPOSE 8080

CMD /pb/pocketbase serve --http="${PB_HTTP:-0.0.0.0:8080}" --dir="${PB_DATA_DIR:-/data}" --origins="${PB_ORIGINS:-https://coldwaterkim.com,https://www.coldwaterkim.com}"
