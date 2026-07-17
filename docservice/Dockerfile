# Legacy .doc -> real .docx conversion microservice.
#
# Built on the gotenberg/gotenberg base image purely to reuse the LibreOffice
# install + fonts it already ships (Gotenberg's own HTTP API only outputs
# PDF, which is why this exists instead of just calling Gotenberg). See
# convert_server.py for the actual /convert endpoint.
#
# Local dev:
#   docker build -t doc-converter docservice/
#   docker run -d --name doc-converter -p 3033:3000 doc-converter
#
# Production (Vercel can't run LibreOffice in a serverless function): build
# and deploy this same image to a host you control (Fly.io, Railway, a small
# VPS), then set GOTENBERG_URL to that host's address as an env var on Vercel.
FROM gotenberg/gotenberg:8
USER root
COPY convert_server.py /opt/convert_server.py
EXPOSE 3000
ENTRYPOINT ["python3", "/opt/convert_server.py"]
