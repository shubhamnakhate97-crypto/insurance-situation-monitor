FROM node:24-alpine
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter web build
EXPOSE 3000
# Internal demo: keep the same-origin feed middleware, not a static-only file server.
CMD ["pnpm", "--filter", "web", "preview"]
