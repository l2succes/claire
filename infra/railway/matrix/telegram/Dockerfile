FROM dock.mau.dev/mautrix/telegram:latest

COPY config.template.yaml /claire-config.template.yaml
COPY registration.template.yaml /claire-registration.template.yaml
COPY entrypoint.sh /claire-entrypoint.sh

RUN chmod +x /claire-entrypoint.sh

ENTRYPOINT ["/claire-entrypoint.sh"]
