FROM node:22.23.1-bookworm-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3 AS build
WORKDIR /source
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches
COPY admin/package.json ./admin/package.json
COPY packages/api-client/package.json ./packages/api-client/package.json
RUN corepack pnpm install --frozen-lockfile --filter @coffix/admin...
COPY admin ./admin
COPY packages/api-client/src ./packages/api-client/src
# Same-origin routing keeps these bytes identical for dev and prod promotion.
ENV VITE_API_BASE_URL=/api/v1
RUN corepack pnpm --filter @coffix/admin exec vite build
ARG APP_VERSION
RUN test -n "$APP_VERSION" && printf '{"version":"%s"}\n' "$APP_VERSION" > admin/dist/version.json

FROM nginxinc/nginx-unprivileged:stable-alpine@sha256:4714e0b1b2577eaa1a6131d07c958b67f0eb68e6d0521e90c6e5287db8cf0bc5 AS runtime
# This upstream digest still includes libexpat 2.8.4 (CVE-2026-93990).
USER root
RUN apk add --no-cache --upgrade libexpat=2.8.5-r0
USER 101:101
ARG APP_VERSION
LABEL org.opencontainers.image.title="Coffix staff dashboard" \
      org.opencontainers.image.revision=$APP_VERSION
COPY admin/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /source/admin/dist /usr/share/nginx/html
USER 101:101
EXPOSE 8080
STOPSIGNAL SIGQUIT
HEALTHCHECK --interval=10s --timeout=5s --start-period=5s --retries=3 CMD ["wget", "-q", "--spider", "http://127.0.0.1:8080/health/live"]
ENTRYPOINT ["nginx"]
CMD ["-g", "daemon off;"]
