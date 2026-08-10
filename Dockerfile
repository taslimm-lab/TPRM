FROM node:20-alpine

WORKDIR /app

# install production dependencies
COPY package*.json ./
RUN npm ci --only=production

# copy source
COPY . .

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "server.js"]
