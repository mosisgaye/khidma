# ============ MULTI-STAGE BUILD ============

# Stage 1: Build
FROM node:18-alpine AS builder

# Métadonnées
LABEL maintainer="Khidma Service Team"
LABEL description="API Backend Khidma Service"
LABEL version="1.0.0"

# Variables d'environnement pour le build
ENV NODE_ENV=production
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

# Installation de pnpm pour des builds plus rapides
RUN corepack enable

# Création du répertoire de travail
WORKDIR /app

# Copie des fichiers de dépendances
COPY package*.json ./
COPY tsconfig.json ./
COPY prisma ./prisma/

# Installation des dépendances
RUN npm ci --only=production && npm cache clean --force

# Génération du client Prisma
RUN npx prisma generate

# Copie du code source
COPY src ./src

# Build de l'application TypeScript
RUN npm run build

# ============ STAGE 2: PRODUCTION ============
FROM node:18-alpine AS production

# Installation des dépendances système nécessaires
RUN apk add --no-cache \
    dumb-init \
    curl \
    ca-certificates \
    && rm -rf /var/cache/apk/*

# Création d'un utilisateur non-root pour la sécurité
RUN addgroup -g 1001 -S nodejs
RUN adduser -S khidma -u 1001

# Répertoire de travail
WORKDIR /app

# Copie des dépendances de production depuis le stage builder
COPY --from=builder --chown=khidma:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=khidma:nodejs /app/dist ./dist
COPY --from=builder --chown=khidma:nodejs /app/prisma ./prisma
COPY --from=builder --chown=khidma:nodejs /app/package*.json ./

# Création des dossiers nécessaires
RUN mkdir -p logs uploads tmp \
    && chown -R khidma:nodejs logs uploads tmp

# Variables d'environnement par défaut
ENV NODE_ENV=production
ENV PORT=3000
ENV LOG_LEVEL=info

# Exposition du port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Changement vers l'utilisateur non-root
USER khidma

# Script de démarrage avec dumb-init pour une gestion correcte des signaux
ENTRYPOINT ["dumb-init", "--"]

# Commande de démarrage
CMD ["node", "dist/app.js"]

# ============ LABELS & METADATA ============
LABEL org.opencontainers.image.title="Khidma Service API"
LABEL org.opencontainers.image.description="API Backend pour la plateforme Khidma Service"
LABEL org.opencontainers.image.version="1.0.0"
LABEL org.opencontainers.image.vendor="Khidma Service"
LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.documentation="https://docs.khidmaservice.com"
LABEL org.opencontainers.image.source="https://github.com/khidma/backend"