# Instagram moved to its dedicated bridge image in mautrix v26.07. Pin the
# image so a silent `latest` upgrade cannot put the bridge back on an
# incompatible legacy configuration path.
FROM dock.mau.dev/mautrix/meta:ig-v26.07

COPY config.template.yaml /claire-config.template.yaml
COPY registration.template.yaml /claire-registration.template.yaml
COPY entrypoint.sh /claire-entrypoint.sh

RUN chmod +x /claire-entrypoint.sh

ENTRYPOINT ["/claire-entrypoint.sh"]
