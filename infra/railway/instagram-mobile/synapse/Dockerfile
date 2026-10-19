FROM matrixdotorg/synapse@sha256:7155ddc4835e5b8afa4e1598d92aa16ff1d03109f7d1cff61d493237d1210b1d
COPY configure.py bootstrap-bot.py /claire/
COPY entrypoint.sh /claire/entrypoint.sh
RUN chmod +x /claire/entrypoint.sh
ENTRYPOINT ["/claire/entrypoint.sh"]
