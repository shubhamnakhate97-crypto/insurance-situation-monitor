FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile=false
ARG APP=web-free
RUN pnpm --filter @insurance/${APP} build

FROM node:22-alpine
RUN npm install -g serve
WORKDIR /app
ARG APP=web-free
COPY --from=build /app/apps/${APP}/dist ./dist
EXPOSE 3000
CMD ["serve", "-s", "dist", "-l", "3000"]
