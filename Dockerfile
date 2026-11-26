FROM node:22-alpine AS build

WORKDIR /app
RUN apk add --no-cache openssl
COPY package*.json ./
RUN npm ci
COPY . .
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN npm run build

FROM node:22-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache openssl
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/src/infrastructure/database/generated ./src/infrastructure/database/generated
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts

# Los adjuntos privados viven en un volumen propiedad del usuario sin privilegios.
ENV ALMACENAMIENTO_DIR=/var/lib/synapse/adjuntos
RUN mkdir -p "$ALMACENAMIENTO_DIR" && chown -R node:node "$ALMACENAMIENTO_DIR" /app
USER node

EXPOSE 3000
# Readiness: responde solo si PostgreSQL contesta. Las migraciones las aplica el servicio `migrate`.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/v1/salud/listo').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main"]
