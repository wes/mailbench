# mailben.ch: the site is static, so it is built here and served by nginx.
# `git push jokku main` builds this on the server.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# The site reads clients/, results/ and schema/ at build time; check them first,
# so a deploy never publishes a summary its raw output does not support.
RUN apk add --no-cache python3 bash \
    && python3 harness/validate.py \
    && npm run build

FROM nginx:1.27-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/public /usr/share/nginx/html
EXPOSE 80
