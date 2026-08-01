FROM matrixdotorg/synapse:latest

COPY entrypoint.sh /claire-entrypoint.sh
COPY templates /claire-templates

RUN chmod +x /claire-entrypoint.sh

ENTRYPOINT ["/claire-entrypoint.sh"]
