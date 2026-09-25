# Experimental image only. Production continues using its existing image.
FROM golang:1-alpine3.24 AS builder
RUN apk add --no-cache git ca-certificates build-base su-exec olm-dev
WORKDIR /build
RUN git init && git remote add origin https://github.com/mautrix/meta.git \
    && git fetch --depth 1 origin bd10396cdb83fbd71881a479f30d4c477afb2ddd \
    && git checkout --detach FETCH_HEAD && ./build-ig.sh
FROM alpine:3.24
RUN apk add --no-cache ffmpeg su-exec ca-certificates olm bash jq yq-go curl
COPY --from=builder /build/mautrix-instagram /usr/bin/mautrix-instagram
COPY config.template.yaml /config.template.yaml
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
