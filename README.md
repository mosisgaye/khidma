🛠 Installation

1. Cloner le repository

bash
git clone https://github.com/votre-org/khidma-backend.git
cd khidma-backend

2. Installer les dépendances

# Avec npm
npm install

# Ou avec yarn
yarn install

Configuration des variables d'environnement

Créez un fichier `.env` à la racine du projet :
cp .env.example .env

Modifiez le fichier `.env` avec vos configurations :


🗄️ Configuration Prisma

 1. Générer le client Prisma

bash
npx prisma generate

Appliquer les migrations
npx prisma migrate deploy

npx prisma migrate dev

Visualiser la base de données

# Ouvrir Prisma Studio
npx prisma studio

 📊 Commandes Prisma Utiles

 Migrations

# Créer une nouvelle migration
npx prisma migrate dev --name nom_de_la_migration

# Appliquer les migrations en production
npx prisma migrate deploy

# Réinitialiser la base de données (ATTENTION: supprime toutes les données)
npx prisma migrate reset

# Voir le statut des migrations
npx prisma migrate status

# Créer une migration vide
npx prisma migrate dev --create-only --name nom_migration

### Base de données

# Pousser le schéma vers la base sans migration
npx prisma db push

# Tirer le schéma depuis la base existante
npx prisma db pull

# Seeder la base de données
npx prisma db seed

# Ouvrir Prisma Studio
npx prisma studio


### Client

bash
# Générer le client Prisma
npx prisma generate

# Formater le schéma
npx prisma format

# Valider le schéma
npx prisma validate
